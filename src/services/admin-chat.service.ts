import { LeaveStatus } from "@prisma/client";

import {
  addUtcDays,
  formatDate,
  formatTimeInAppZone,
  toIsoDate,
  toUtcDay,
  todayUtc,
  utcWeekday,
} from "@/lib/date";
import { ValidationError } from "@/lib/errors";
import { employeeRepository, type AttendanceRosterMember } from "@/repositories/employee.repository";
import { leaveRepository } from "@/repositories/leave.repository";
import { attendanceService, type AttendanceDayStatus, type RosterEntry } from "@/services/attendance.service";
import { interpretAdminChat, type ChatTurn } from "@/services/ai.service";

/**
 * How far a single question may look back or forward.
 *
 * Not a policy about history — it is a bound on one request. A range is walked
 * day by day, and "show me last year" would be a question that takes a minute
 * to answer and produces something nobody reads.
 */
const MAX_RANGE_DAYS = 31;

/** How many people the assistant will offer to choose between by name. */
const MAX_CHOICES = 6;

/**
 * One candidate behind an ambiguous name.
 *
 * `email` is carried and always shown, and it is what makes the choice a choice:
 * two colleagues may share a name, a department *and* a job title, at which
 * point every other field here renders identically and the buttons offer no way
 * to tell them apart — which is how this was found. The address is unique on the
 * table, so it can always separate them. It gives nothing away either: an
 * administrator reads addresses off the Staff screen already, and unlike `role`
 * it does not say what anybody *is*.
 */
export type PersonChoice = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  position: string | null;
};

/**
 * A question that named somebody the system could not narrow to one person.
 *
 * Carries the question rather than the answer, so choosing a name re-asks it
 * against the chosen id — the same bargain `LeaveProposal` makes. Nothing here
 * decides anything: an administrator who edited it could ask about a different
 * colleague, which is a thing they may already do by typing their name.
 */
export type PendingPerson = {
  view: "status" | "history";
  date: string;
  endDate?: string | null;
};

export type AdminChatReply = {
  reply: string;
  choices?: PersonChoice[];
  pending?: PendingPerson;
};

/** The shape a resolved choice comes back as. */
export type ResolvedPerson = PendingPerson & { employeeId: string };

const STATUS_WORD: Record<AttendanceDayStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  ON_LEAVE: "On leave",
  CLOSED: "Office closed",
  NON_WORKING: "Non-working day",
  NO_RECORD: "No record",
  UPCOMING: "Upcoming",
};

function personLine(member: { name: string; position: string | null; department: string | null }): string {
  const detail = member.position ?? member.department;
  return detail ? `${member.name} — ${detail}` : member.name;
}

function numbered(entries: string[]): string {
  return entries.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

/**
 * What to say about a day nobody was expected in.
 *
 * Returned instead of a list rather than alongside one, because on such a day
 * the list is empty for a reason that has nothing to do with anybody: reporting
 * "0 absent" for a public holiday is true and reads as though the question was
 * understood, which it was not.
 */
function dayCaveat(day: { officeClosed: boolean; isWorkingDay: boolean; date: Date }): string | null {
  if (day.officeClosed) {
    return `The office was closed on ${formatDate(day.date)}. Nobody was expected in, and the day cost nobody a leave.`;
  }

  if (!day.isWorkingDay) {
    return `${formatDate(day.date)} is a ${utcWeekday(day.date)}, which is not a working day. Nobody was expected in.`;
  }

  // Judged last, below the closure and the working week, because both of those
  // are worth knowing about a day still to come — "the office is shut on Monday"
  // answers more than "Monday hasn't happened".
  //
  // It has to be said at all because the roster calls a future day `UPCOMING`
  // rather than `NO_RECORD`, so nothing above catches it and the counts all come
  // back zero. Left alone, "who is absent next Thursday" answered "nobody is
  // absent, everyone is accounted for" — true of a day nobody could yet have
  // missed, and read as a report on one.
  if (day.date.getTime() > todayUtc().getTime()) {
    return `${formatDate(day.date)} is still to come, so there is nothing recorded for it yet. Nobody has missed it and nobody has checked in.`;
  }

  return null;
}

/** True when the day holds nothing at all — see `NO_RECORD` in the attendance service. */
function isBlankDay(entries: RosterEntry[]): boolean {
  return entries.length > 0 && entries.every((entry) => entry.status === "NO_RECORD");
}

function blankDayNote(date: Date): string {
  return `Nothing is recorded for ${formatDate(date)} — no check-ins and no leave for anybody. That reads as no record rather than as everyone being absent, so nobody is marked down for it.`;
}

/**
 * Turns whatever the model extracted into a real calendar day.
 *
 * Defaults to today rather than refusing, and the caller always says which date
 * it used — an administrator who typed "who was absent" meant today, and being
 * asked "which day?" for it is worse than being told the assumption.
 */
function resolveDate(value: string | null | undefined): Date {
  if (!value) return todayUtc();

  const parsed = toUtcDay(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("That date didn't look like a real one. Try a day like 10 August 2026.");
  }

  return parsed;
}

/** A range, clamped and put the right way round. */
function resolveRange(start: string | null | undefined, end: string | null | undefined) {
  const first = resolveDate(start);
  const last = end ? resolveDate(end) : first;

  const [from, to] = first.getTime() <= last.getTime() ? [first, last] : [last, first];
  const span = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

  return span > MAX_RANGE_DAYS ? { from: addUtcDays(to, -(MAX_RANGE_DAYS - 1)), to, clamped: true } : { from, to, clamped: false };
}

export const adminChatService = {
  /**
   * Answers one turn for an administrator.
   *
   * The model classifies and names a person; nothing it says about the
   * workforce is ever passed on. Every roster, count and status below is read
   * through `attendanceService`, which is the same code the admin attendance
   * screen and the warning sweep use — so the assistant cannot disagree with
   * the screen, and a closure or a non-working day is honoured here for free.
   *
   * `resolved` short-circuits the model entirely: it is the second half of a
   * disambiguation, and re-interpreting the conversation to reach a question
   * already understood would be a chance to understand it differently.
   */
  async respond(turns: ChatTurn[], resolved?: ResolvedPerson): Promise<AdminChatReply> {
    if (resolved) {
      const member = await employeeRepository.findRosterMember(resolved.employeeId);

      if (!member) {
        return { reply: "That person is no longer on the active roster." };
      }

      return resolved.view === "history"
        ? describeHistory(member, resolveRange(resolved.date, resolved.endDate))
        : describeStatus(member, resolveDate(resolved.date));
    }

    const today = todayUtc();
    const intent = await interpretAdminChat(turns, today);

    if (intent.intent === "person") {
      return answerPerson(intent.name ?? "", intent.view === "history" ? "history" : "status", intent.date, intent.endDate);
    }

    if (intent.intent === "roster") {
      const date = resolveDate(intent.date);

      switch (intent.view) {
        case "present":
          return describePresent(date);
        case "leave":
          return describeLeave(date);
        case "summary":
          return describeSummary(date);
        default:
          return describeAbsent(date);
      }
    }

    return { reply: intent.reply };
  },
};

/**
 * Finds the one person meant, or asks which.
 *
 * The rule this exists for: **a name is never the identifier.** Two people may
 * share one, so a match of several is reported as a question with the id
 * carried on each option, and every lookup afterwards runs against that id.
 * Picking the first would answer confidently about the wrong colleague, which
 * is worse than not answering.
 */
async function answerPerson(
  name: string,
  view: "status" | "history",
  date: string | null | undefined,
  endDate: string | null | undefined,
): Promise<AdminChatReply> {
  const term = name.trim();

  if (term.length < 2) {
    return { reply: "Which person do you mean? Give me a name and I'll look them up." };
  }

  const matches = await employeeRepository.findActiveByNameLike(term, MAX_CHOICES);

  if (matches.length === 0) {
    return {
      reply: `I couldn't find anyone active called "${term}". Check the spelling, or try their full name.`,
    };
  }

  if (matches.length > 1) {
    return {
      reply: `I found ${matches.length} people matching "${term}". Which one do you mean?`,
      choices: matches.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        department: member.department,
        position: member.position,
      })),
      pending: { view, date: toIsoDate(resolveDate(date)), endDate: endDate ?? null },
    };
  }

  const member = matches[0]!;

  return view === "history"
    ? describeHistory(member, resolveRange(date, endDate))
    : describeStatus(member, resolveDate(date));
}

/** Where one person stands on one day. */
async function describeStatus(member: AttendanceRosterMember, date: Date): Promise<AdminChatReply> {
  const day = await attendanceService.rosterEntries(date, { employeeId: member.id });
  const entry = day.entries[0];

  if (!entry) {
    return { reply: `${member.name} is not on the active roster for ${formatDate(date)}.` };
  }

  const lines = [`**${member.name}** — ${formatDate(date)}`, `• Status: ${STATUS_WORD[entry.status]}`];

  if (member.department) lines.push(`• Department: ${member.department}`);
  if (member.position) lines.push(`• Position: ${member.position}`);

  if (entry.attendance) {
    lines.push(`• Attendance marked: ${formatTimeInAppZone(entry.attendance.checkInAt)}`);
  }

  if (entry.status === "ON_LEAVE") {
    const [leave] = await leaveRepository.approvedForEmployeeBetween(member.id, date, date);
    if (leave?.reason) lines.push(`• Leave reason: ${leave.reason}`);
  }

  const caveat = dayCaveat({ ...day });
  if (caveat) lines.push("", caveat);

  return { reply: lines.join("\n") };
}

/** One person, day by day, across a range. */
async function describeHistory(
  member: AttendanceRosterMember,
  range: { from: Date; to: Date; clamped: boolean },
): Promise<AdminChatReply> {
  const days = await attendanceService.historyFor(member.id, range.from, range.to);

  const counted = (status: AttendanceDayStatus) => days.filter((day) => day.status === status).length;
  const present = counted("PRESENT");
  const absent = counted("ABSENT");
  const onLeave = counted("ON_LEAVE");

  const header = `**${member.name}** — ${formatDate(range.from)} to ${formatDate(range.to)}`;

  // Only the days that say something about the person. A fortnight of weekends
  // and closures listed in full buries the two days that were actually missed.
  const notable = days.filter(
    (day) => day.status === "PRESENT" || day.status === "ABSENT" || day.status === "ON_LEAVE",
  );

  const body =
    notable.length === 0
      ? "Nothing is recorded against them in that range — no check-ins, no leave, and no working day they were expected on."
      : numbered(
          notable.map((day) => {
            const time = day.attendance ? ` at ${formatTimeInAppZone(day.attendance.checkInAt)}` : "";
            return `${formatDate(day.date)} — ${STATUS_WORD[day.status]}${time}`;
          }),
        );

  const lastAbsent = [...days].reverse().find((day) => day.status === "ABSENT");

  const footer = [
    `**Present: ${present} · Absent: ${absent} · On leave: ${onLeave}**`,
    lastAbsent
      ? `Most recent absence in this range: ${formatDate(lastAbsent.date)}.`
      : "No absences in this range.",
    range.clamped ? `That is the last ${MAX_RANGE_DAYS} days of the range you asked for.` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { reply: `${header}\n\n${body}\n\n${footer}` };
}

async function describePresent(date: Date): Promise<AdminChatReply> {
  const day = await attendanceService.rosterEntries(date);
  const caveat = dayCaveat(day);

  const present = day.entries.filter((entry) => entry.status === "PRESENT");

  if (present.length === 0) {
    const reason = caveat ?? (isBlankDay(day.entries) ? blankDayNote(date) : null);
    return {
      reply: reason
        ? `No check-ins are recorded for ${formatDate(date)}.\n\n${reason}`
        : `No one is recorded as present on ${formatDate(date)}.`,
    };
  }

  return {
    reply: [
      `**Present — ${formatDate(date)}**`,
      "",
      numbered(present.map((entry) => personLine(entry.employee))),
      "",
      `**Total present: ${present.length}**`,
      caveat ? `\n${caveat}` : "",
    ]
      .join("\n")
      .trimEnd(),
  };
}

async function describeAbsent(date: Date): Promise<AdminChatReply> {
  const day = await attendanceService.rosterEntries(date);

  // Asked before the list, because on a closed or non-working day the list is
  // empty for a reason that is not about anybody's attendance.
  const caveat = dayCaveat(day);
  if (caveat) return { reply: caveat };

  if (isBlankDay(day.entries)) return { reply: blankDayNote(date) };

  const absent = day.entries.filter((entry) => entry.status === "ABSENT");

  if (absent.length === 0) {
    return { reply: `Nobody is recorded as absent on ${formatDate(date)}. Everyone is accounted for.` };
  }

  return {
    reply: [
      `**Absent — ${formatDate(date)}**`,
      "",
      numbered(absent.map((entry) => personLine(entry.employee))),
      "",
      `**Total absent: ${absent.length}**`,
    ].join("\n"),
  };
}

/**
 * Who holds approved leave on a date.
 *
 * Approved only, deliberately: pending and rejected rows are not time off, and
 * counting them would tell an administrator somebody is away who is at their
 * desk. The roster agrees, because it asks the same question.
 */
async function describeLeave(date: Date): Promise<AdminChatReply> {
  const { items } = await leaveRepository.list({
    from: date,
    to: date,
    status: LeaveStatus.APPROVED,
    page: 1,
    pageSize: 100,
    sortBy: "leaveDate",
    sortDir: "asc",
  });

  if (items.length === 0) {
    return { reply: `Nobody is on approved leave on ${formatDate(date)}.` };
  }

  return {
    reply: [
      `**On leave — ${formatDate(date)}**`,
      "",
      numbered(
        items.map((leave) => {
          const who = personLine(leave.employee);
          return leave.reason ? `${who} — ${leave.reason}` : who;
        }),
      ),
      "",
      `**Total on leave: ${items.length}**`,
    ].join("\n"),
  };
}

/** The whole day at a glance. */
async function describeSummary(date: Date): Promise<AdminChatReply> {
  const day = await attendanceService.rosterEntries(date);

  const caveat = dayCaveat(day);
  if (caveat) return { reply: caveat };

  if (isBlankDay(day.entries)) return { reply: blankDayNote(date) };

  const count = (status: AttendanceDayStatus) => day.entries.filter((entry) => entry.status === status).length;

  const present = day.entries.filter((entry) => entry.status === "PRESENT");
  const absent = day.entries.filter((entry) => entry.status === "ABSENT");

  const sections = [
    `**Attendance — ${formatDate(date)}**`,
    "",
    `• Expected in: ${day.entries.length}`,
    `• Present: ${present.length}`,
    `• Absent: ${absent.length}`,
    `• On leave: ${count("ON_LEAVE")}`,
  ];

  if (present.length > 0) {
    sections.push("", "**Present**", numbered(present.map((entry) => personLine(entry.employee))));
  }

  if (absent.length > 0) {
    sections.push("", "**Absent**", numbered(absent.map((entry) => personLine(entry.employee))));
  }

  return { reply: sections.join("\n") };
}
