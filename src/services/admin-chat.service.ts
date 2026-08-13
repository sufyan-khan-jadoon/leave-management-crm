import { EmployeeStatus, LeaveStatus, Role } from "@prisma/client";

import {
  addUtcDays,
  formatDate,
  formatTimeInAppZone,
  toIsoDate,
  toUtcDay,
  todayUtc,
  utcWeekday,
} from "@/lib/date";
import { isSuperAdminRole } from "@/lib/enums";
import { ValidationError } from "@/lib/errors";
import { employeeRepository, type AttendanceRosterMember } from "@/repositories/employee.repository";
import { leaveRepository } from "@/repositories/leave.repository";
import { describeLateness } from "@/lib/lateness";
import {
  attendanceService,
  lateMinutesOf,
  type AttendanceDayStatus,
  type RosterEntry,
} from "@/services/attendance.service";
import { interpretAdminChat, type ChatTurn } from "@/services/ai.service";
import { employeeService, type Actor } from "@/services/employee.service";
import { invitationService } from "@/services/invitation.service";
import { emailSchema } from "@/validations/auth.schema";
import type { AdminChatAction, AdminChatActionInput } from "@/validations/admin-chat.schema";

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
  view: "status" | "history" | "remove";
  date: string;
  endDate?: string | null;
};

/**
 * Something the assistant is asking permission to do, spelled out.
 *
 * **This is a proposal, never a decision.** The model has classified a request;
 * nothing has happened yet. What the administrator approves is spelled out in the
 * `reply` beside it — the address that will actually be mailed, the person who
 * will actually be deleted. Approving it posts `/api/admin/chat/action`, which
 * re-reads the row and re-checks the caller's authority through
 * `employeeService` and `invitationService`; this carries no authority of its own.
 *
 * **It holds the inputs, plus `name` for the button, and nothing else.** The
 * account's status, department and job title are in the `reply` already, and this
 * is a payload the client posts back — every field on it that the action endpoint
 * does not accept is one the client has to remember to strip. It did not, and
 * `strictObject` refused every deletion while invitations went through untouched.
 * Keep the two in step by giving the client nothing it must drop.
 *
 * Declared in `admin-chat.schema.ts` beside `toActionRequest`, which narrows it to
 * what the endpoint accepts, and the test that holds the two together.
 */
export type PendingAction = AdminChatAction;

export type AdminChatReply = {
  reply: string;
  choices?: PersonChoice[];
  pending?: PendingPerson;
  action?: PendingAction;
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
  async respond(actor: Actor, turns: ChatTurn[], resolved?: ResolvedPerson): Promise<AdminChatReply> {
    if (resolved) {
      // A removal resolved to one person is still only a proposal — choosing
      // between two namesakes settles *who*, never whether.
      if (resolved.view === "remove") return proposeRemoval(actor, resolved.employeeId);

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

    if (intent.intent === "invite") {
      return proposeInvitation(actor, intent.email, intent.role);
    }

    if (intent.intent === "remove") {
      return findForRemoval(actor, intent.name ?? "");
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

  /**
   * Carries out something the administrator approved.
   *
   * **No model call happens here at all**, which is the point: the wording that
   * led to the proposal has already been interpreted, and re-reading it to reach
   * an act already agreed would be a chance to understand it differently. The
   * act is taken from the confirmed payload and nothing else.
   *
   * It delegates to `employeeService.remove` and `invitationService.invite`
   * rather than reimplementing either, so `assertMayManage` and `assertMayInvite`
   * decide exactly as they do for the Staff screen. The assistant is a way of
   * reaching those rules, never a way around them — an administrator who
   * hand-crafts a payload aimed at an account above their station is refused by
   * the same code that refuses them there.
   */
  async execute(actor: Actor, action: AdminChatActionInput): Promise<AdminChatReply> {
    if (action.kind === "invite") {
      const { invitation, emailSent } = await invitationService.invite(actor, {
        email: action.email,
        role: action.role === "ADMIN" ? Role.ADMIN : Role.EMPLOYEE,
        // The assistant does not assign job titles. `position` is stamped from the
        // invitation's job role, and picking one from a typed phrase would mean
        // matching a curated list by guesswork; the Staff form offers the list.
        jobRoleId: null,
      });

      const who = `**${invitation.email}** as ${roleWord(invitation.role)}`;

      return {
        reply: emailSent
          ? `Invitation sent to ${who}. The link expires ${formatDate(invitation.expiresAt)}, and they choose their own password when they accept.`
          : `The invitation for ${who} was created, but **the email did not go out**. Resend it from the Staff screen — until it arrives, nobody can act on it.`,
      };
    }

    const removed = await employeeService.remove(action.employeeId, actor);

    return {
      reply: `**${removed.name}** (${removed.email}) has been deleted, along with their attendance and leave history. Nothing here can undo that — they would have to be invited again as a new account.`,
    };
  },
};

function roleWord(role: Role): string {
  return role === Role.ADMIN ? "an administrator" : "an employee";
}

/**
 * Proposes an invitation, having checked this administrator may issue one.
 *
 * The permission is read here purely so a refusal arrives before the
 * administrator is asked to approve something that was never going to work —
 * `invitationService.invite` checks it again against the database when the
 * proposal is confirmed, and that is the check that counts. Same
 * courtesy-then-rule split as `canIssue` on the invitation routes.
 */
async function proposeInvitation(
  actor: Actor,
  email: string | null | undefined,
  role: "EMPLOYEE" | "ADMIN" | null | undefined,
): Promise<AdminChatReply> {
  const wanted = role === "ADMIN" ? "ADMIN" : "EMPLOYEE";
  const allowed = await invitationService.permissionsFor(actor);

  if (wanted === "ADMIN" && !allowed.admin) {
    return {
      reply:
        "Only the super administrator can invite administrators. I can invite somebody as an employee instead, if that is what you meant.",
    };
  }

  if (wanted === "EMPLOYEE" && !allowed.employee) {
    return {
      reply:
        "You do not have permission to invite employees. Your super administrator can enable it from the Access screen.",
    };
  }

  if (!email) {
    return {
      reply: `Which address should I invite as ${roleWord(wanted === "ADMIN" ? Role.ADMIN : Role.EMPLOYEE)}? Nobody is added without one — registration is by invitation to a specific mailbox.`,
    };
  }

  // Judged here rather than left to the invitation service, because a mistyped
  // address should be questioned before somebody approves mailing it.
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { reply: `"${email}" doesn't look like an email address. What should I use?` };
  }

  return {
    reply: [
      "**Invite a new member of staff**",
      "",
      `• Address: ${parsed.data}`,
      `• Joining as: ${wanted === "ADMIN" ? "Administrator" : "Employee"}`,
      "",
      "They will be emailed a link and choose their own password. Nothing exists until they accept it, and the role on the invitation is the only thing that decides what they become.",
    ].join("\n"),
    action: { kind: "invite", email: parsed.data, role: wanted },
  };
}

/**
 * Which roles this administrator may delete, and therefore may be shown.
 *
 * `SUPER_ADMIN` is in neither list — the owner is unmanageable from the
 * dashboard by anybody, itself included, so it must not be offered as a
 * candidate that would only be refused a moment later.
 */
function removableRoles(actor: Actor): Role[] {
  return isSuperAdminRole(actor.role) ? [Role.EMPLOYEE, Role.ADMIN] : [Role.EMPLOYEE];
}

/** Finds who a removal was aimed at, or asks which of them. */
async function findForRemoval(actor: Actor, name: string): Promise<AdminChatReply> {
  const term = name.trim();

  if (term.length < 2) {
    return { reply: "Whose account do you want to delete? Give me their name." };
  }

  const matches = await employeeRepository.findManageableByNameLike(term, removableRoles(actor), MAX_CHOICES);

  // Worded the same whether nobody matched or the only matches were accounts
  // this administrator may not touch, exactly as `byIdForActor` reports a
  // colleague they may not see as *not found*: a refusal that distinguished the
  // two would answer "is there an administrator called this?".
  if (matches.length === 0) {
    return { reply: `I couldn't find an account called "${term}" that you can delete.` };
  }

  if (matches.length > 1) {
    return {
      reply: `I found ${matches.length} accounts matching "${term}". Which one do you want to delete?`,
      choices: matches.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        department: member.department,
        position: member.position,
      })),
      pending: { view: "remove", date: toIsoDate(todayUtc()), endDate: null },
    };
  }

  return proposeRemoval(actor, matches[0]!.id);
}

/**
 * Spells out exactly whose account would go, and what goes with it.
 *
 * Re-read from the database rather than carried over from the search, so the
 * name and address being approved are the ones on the row now. The account is
 * re-checked against `removableRoles` for the case that reaches this directly
 * from a resolved choice, where the id came back through the client.
 */
async function proposeRemoval(actor: Actor, employeeId: string): Promise<AdminChatReply> {
  const member = await employeeRepository.findManageableById(employeeId, removableRoles(actor));

  if (!member) {
    return { reply: "I couldn't find that account, or it isn't one you can delete." };
  }

  if (member.id === actor.id) {
    return { reply: "You cannot delete your own account. Ask another administrator to do it." };
  }

  const detail = [
    `• Name: ${member.name}`,
    `• Address: ${member.email}`,
    `• Role: ${member.role === Role.ADMIN ? "Administrator" : "Employee"}`,
    member.position ? `• Position: ${member.position}` : null,
    member.department ? `• Department: ${member.department}` : null,
    `• Status: ${statusWord(member.status)}`,
  ].filter(Boolean) as string[];

  return {
    reply: [
      "**Delete this account?**",
      "",
      ...detail,
      "",
      "Their attendance records and every leave they booked go too, and **nothing in this application can undo it**. If you only want to stop them signing in, suspend them from the Staff screen instead — that keeps the record.",
    ].join("\n"),
    action: { kind: "remove", employeeId: member.id, name: member.name, email: member.email },
  };
}

function statusWord(status: EmployeeStatus): string {
  switch (status) {
    case EmployeeStatus.ACTIVE:
      return "Active";
    case EmployeeStatus.SUSPENDED:
      return "Suspended";
    case EmployeeStatus.PENDING_APPROVAL:
      return "Awaiting approval";
    default:
      return "Rejected";
  }
}

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
    // Lateness comes from `lateMinutesOf`, the same function the roster and the
    // CSV use, so the assistant cannot describe a day differently from the
    // screen an administrator would check it against.
    const late = describeLateness(lateMinutesOf(entry.attendance));
    lines.push(`• Attendance marked: ${formatTimeInAppZone(entry.attendance.checkInAt)}${late ? ` — ${late}` : ""}`);

    if (entry.attendance.markedBy) {
      lines.push(`• Recorded by ${entry.attendance.markedBy.name}, not by the location check`);
    }
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
            const late = day.attendance ? describeLateness(lateMinutesOf(day.attendance)) : null;
            return `${formatDate(day.date)} — ${STATUS_WORD[day.status]}${time}${late ? ` (${late})` : ""}`;
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
