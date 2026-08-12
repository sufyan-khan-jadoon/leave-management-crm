import type { Role } from "@prisma/client";

import { hasCutoffPassed } from "@/lib/attendance-policy";
import { addUtcDays, endOfUtcMonth, startOfUtcMonth, toIsoDate, todayUtc } from "@/lib/date";
import { isWorkingWeekday } from "@/lib/working-days";
import { isSuperAdminRole, rolesInPopulation } from "@/lib/enums";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { judgePosition } from "@/lib/geo";
import {
  attendanceRepository,
  type AttendanceDto,
} from "@/repositories/attendance.repository";
import {
  employeeRepository,
  type AttendanceRosterMember,
} from "@/repositories/employee.repository";
import { attendanceWarningRepository } from "@/repositories/attendance-warning.repository";
import { holidayRepository } from "@/repositories/holiday.repository";
import { leaveRepository } from "@/repositories/leave.repository";
import { attendancePolicyService } from "@/services/attendance-policy.service";
import type {
  MarkAttendanceInput,
  AttendanceRosterQuery,
  ResetAttendanceInput,
  ResetAttendancePreviewQuery,
} from "@/validations/attendance.schema";

/**
 * What one person's day amounts to.
 *
 * Derived on every read rather than stored, for the reason the holiday rules
 * give: a closure declared after the fact has to change what a past day meant,
 * and a stored ABSENT would have to be found and unwritten. Asking the question
 * makes that free — withdraw the closure and the day goes back to what it was.
 */
export type AttendanceDayStatus =
  /** Checked in from inside the geofence. */
  | "PRESENT"
  /** Approved leave on the day, so nobody was expecting them. */
  | "ON_LEAVE"
  /** The office was shut. Not a working day for anybody. */
  | "CLOSED"
  /** Outside the ordinary working week — a weekend, for most companies. */
  | "NON_WORKING"
  /** A working day, not on leave, and no check-in. */
  | "ABSENT"
  /**
   * A working day the system holds nothing whatsoever about.
   *
   * Not a softer word for absent — see `dayHoldsRecord`. Absence is a claim that
   * somebody did not turn up, and it is only worth making about a day the system
   * was actually watching. When a working day carries no check-in and no leave
   * for *anybody* in the company, nothing was recorded rather than everybody
   * having failed to appear, and saying "absent" about all of them asserts
   * something nobody has evidence for.
   */
  | "NO_RECORD"
  /** The day has not happened yet, so there is nothing to be absent from. */
  | "UPCOMING";

export type RosterEntry = {
  employee: AttendanceRosterMember;
  status: AttendanceDayStatus;
  attendance: AttendanceDto | null;
};

/** How a day went for a group of people. */
export type AttendanceSummary = {
  expected: number;
  present: number;
  absent: number;
  onLeave: number;
};

export type TodayState = {
  date: Date;
  attendance: AttendanceDto | null;
  status: AttendanceDayStatus;
  /** Whether the "Mark present" button has anything to do. */
  canMark: boolean;
  /** Why not, when it cannot — shown instead of the button. */
  blockedReason: string | null;
  /** Today's deadline, so the screen can quote the rule it is enforcing. */
  cutoffMinutes: number;
  /** False on a weekend: still markable, simply not expected or chased. */
  isWorkingDay: boolean;
};

export type MarkResult = {
  attendance: AttendanceDto;
  /** True when the row was already there; nothing new was written. */
  alreadyMarked: boolean;
};

/**
 * The refusals, in the words the employee sees.
 *
 * They say different things because they mean different things: the first is
 * "we know where you are, and it is not here", the second is "we do not know
 * where you are". Neither quotes a distance, a coordinate or an accuracy figure
 * — what the server worked out about somebody's position is not something to
 * read back to them, and a number invites an argument rather than a walk.
 */
const OUTSIDE_MESSAGE =
  "You are outside the allowed office attendance area. Please move closer to the office and try again.";

const INACCURATE_MESSAGE =
  "Unable to verify your location accurately. Please move to an area with better location accuracy and try again.";

export type ResetPreview = {
  /** Check-ins the reset would remove — `null` when the target leaves them alone. */
  count: number | null;
  /**
   * Leave rows the reset would remove — `null` when the target leaves them alone.
   *
   * Reported beside the check-in count rather than folded into one total,
   * because the two are not the same loss. A cleared check-in can be recorded
   * again by walking into the building; a cleared leave hands an allowance back
   * and takes a history away. Somebody confirming this should see both numbers
   * rather than their sum.
   *
   * `null` rather than `0` throughout, so "this target does not touch that
   * table" and "that table is already empty" stay different sentences. The
   * dialog says different things about them.
   */
  leaveCount: number | null;
  /**
   * Warning rows the reset would remove — `null` when the target leaves them
   * alone. This is the only stored trace of absence there is.
   */
  warningCount: number | null;
  /**
   * Claims held for today specifically, out of `warningCount`.
   *
   * The whole of the risk in clearing absences, isolated: a claim for a past day
   * is inert, because the sweep only ever revisits today. Counted separately so
   * the dialog can say "two of these are today's" rather than describing a
   * danger that may not apply to a single row being removed.
   *
   * `null` when this reset would not remove a claim for today at all — which is
   * every single-day reset aimed at a past date, and so the common case now that
   * each target can be pointed at one day.
   */
  warningsForToday: number | null;
  /**
   * True when clearing this would leave people the warning sweep reads as absent
   * and writes to. See `warningExposure` for why it is so narrow.
   */
  mayTriggerWarnings: boolean;
  /** The cutoff, so the screen can name the deadline it is talking about. */
  cutoffMinutes: number;
};

export type ResetResult = {
  /** Check-ins removed. */
  removed: number;
  removedLeaves: number;
  /** Warning rows removed — the record of absence, not the absence itself. */
  removedWarnings: number;
  range: ResetAttendanceInput["range"];
  target: ResetAttendanceInput["target"];
};

/** Which tables a target reaches. The one place the grid is spelt out. */
function tablesFor(target: ResetAttendanceInput["target"]): {
  attendance: boolean;
  leaves: boolean;
  warnings: boolean;
} {
  return {
    attendance: target === "ATTENDANCE" || target === "ALL",
    leaves: target === "LEAVES" || target === "ALL",
    warnings: target === "ABSENCES" || target === "ALL",
  };
}

/**
 * Whether erasing a day would cause warning letters to be sent about it.
 *
 * Narrow on purpose, because the exposure genuinely is. `dispatchAttendanceWarnings`
 * only ever sweeps `todayUtc()`, so clearing any past day cannot produce a letter
 * however many people it turns into absentees — the sweep will never look there
 * again. The one real case is clearing **today** after the cutoff has passed:
 * everyone who had checked in becomes absent, and because they were present they
 * have no claim row to stop the next sweep writing to them.
 *
 * Where it survives it is reported rather than prevented. Suppressing it by
 * inserting warning rows for letters nobody sent would put a lie in the table
 * that `consecutiveMissed` and every future letter are built from — worse than
 * the mail it avoided. The screen names the risk and points at the off switch,
 * which is on the same panel, and the super admin decides.
 *
 * A target that clears the **whole** of a day closes the exposure by itself
 * rather than by suppressing anything, and that falls out of `NO_RECORD` rather
 * than being arranged here: a day left holding no check-in and no leave has no
 * absentees on it, and the sweep writes only to people the roster calls
 * `ABSENT`. So the question below is not "does this touch today" but "would
 * today still hold anything afterwards" — which leaves the partial resets
 * exposed, and only them.
 */
async function warningExposure(
  tables: ReturnType<typeof tablesFor>,
  date: Date | null,
): Promise<{ mayTriggerWarnings: boolean; cutoffMinutes: number }> {
  const policy = await attendancePolicyService.get();
  const today = todayUtc();

  // An all-time reset takes today with it, so it carries the same exposure.
  const touchesToday = date === null || date.getTime() === today.getTime();

  const dayIsChaseable =
    policy.warningsEnabled &&
    touchesToday &&
    isWorkingWeekday(today, policy.workingDays) &&
    hasCutoffPassed(today, policy.cutoffMinutes);

  if (!dayIsChaseable) return { mayTriggerWarnings: false, cutoffMinutes: policy.cutoffMinutes };

  // What today would still hold once this had run. A day left holding nothing
  // reads as `NO_RECORD` for everybody, so the sweep finds nobody and no letter
  // can go out however many rows were removed. The exposure is real only for the
  // *partial* resets: clearing check-ins while somebody's leave stays behind, or
  // clearing leave while somebody's check-in does, leaves a day the system still
  // considers itself to have been watching.
  // Approved leave, not every row on the date — mirroring `buildRoster` exactly,
  // because this is asking what the roster would say afterwards. `countOnDate`
  // is the right question for how many rows a delete would take and the wrong
  // one here: a legacy `PENDING` row is something to remove and nothing that
  // keeps anybody off the sweep.
  const [checkIns, onLeave] = await Promise.all([
    tables.attendance ? 0 : attendanceRepository.countOnDate(today),
    tables.leaves ? 0 : leaveRepository.employeeIdsOnApprovedLeave(today).then((ids) => ids.length),
  ]);

  return {
    mayTriggerWarnings: dayHoldsRecord(checkIns, onLeave),
    cutoffMinutes: policy.cutoffMinutes,
  };
}

/**
 * Whether the system holds anything at all about a date.
 *
 * The one question that tells "everybody missed this day" apart from "this day
 * was never recorded", and it is asked about the **whole company** rather than
 * about the person or the filtered page in front of you — otherwise narrowing to
 * a department that happened to be away would turn its absences into nothing
 * having happened.
 *
 * It exists because absence is derived rather than stored, so no reset can
 * delete one: erasing every check-in and every leave left the roster asserting
 * that the entire company had failed to turn up on every working day in its
 * history, which is both false and indistinguishable from a reset that had done
 * nothing. Reported honestly instead — a day holding no evidence either way says
 * so, and nobody is accused.
 *
 * The trade is deliberate and worth stating: a genuine day on which literally
 * nobody in the company checked in and nobody was on leave also reads as no
 * record, and — because the warning sweep only ever writes to people the roster
 * calls `ABSENT` — nobody is chased for it either. That is the same conjunction
 * a reset produces, and no stored fact can separate them. A company of any size
 * clears it the moment one person checks in; a total no-show is a fire drill or
 * an outage, not a day to send everybody a letter about.
 */
function dayHoldsRecord(checkIns: number, onLeave: number): boolean {
  return checkIns > 0 || onLeave > 0;
}

/**
 * Who may narrow the roster to one population.
 *
 * The super admin alone, mirroring `role=ADMIN` on `/api/admin/employees` and
 * for the same reason: which of your colleagues is an administrator is not
 * something this screen tells an ordinary administrator. It cannot today —
 * `attendanceRosterSelect` carries no role, so the roster names people without
 * saying what they are — and a filter would hand over exactly that.
 *
 * **`EMPLOYEE` is gated too, and that is not an oversight.** Filtering to the
 * employees looks harmless, but comparing that list against the unfiltered one
 * names the administrators just as precisely as asking for them. A filter that
 * leaks by subtraction is still a leak, so the whole control belongs to one
 * viewer rather than half of it to everybody.
 *
 * Asserted here rather than in the route because there are two ways in — the
 * screen and the CSV export — and a check written twice is a check that will
 * one day be written once. The routes still guard `requireAdmin`; this decides
 * the narrower question behind it, the way `assertMayManage` does for accounts.
 */
function assertMayViewPopulation(
  actorRole: Role,
  population: AttendanceRosterQuery["population"],
): void {
  if (population !== "ALL" && !isSuperAdminRole(actorRole)) {
    throw new ForbiddenError(
      "Only a super administrator can filter attendance by employees or administrators.",
    );
  }
}

/**
 * Whether the office was open on a date.
 *
 * `closedDatesAmong` is the single question, and it is asked *before* anything
 * decides present or absent rather than alongside it — a closed day is not a
 * working day, so there is nothing for attendance to say about it.
 */
async function officeClosedOn(date: Date): Promise<boolean> {
  const closed = await holidayRepository.closedDatesAmong([date]);
  return closed.length > 0;
}

/**
 * Builds one day's roster: who was expected, and what became of each of them.
 *
 * Shared by the admin screen and the overview tile so the two can never
 * disagree about what "present" counted — the screen pages and filters the
 * result, the tile only counts it.
 */
async function buildRoster(
  date: Date,
  filters: { employeeId?: string; department?: string; search?: string; roles?: Role[] },
): Promise<{ date: Date; officeClosed: boolean; isWorkingDay: boolean; entries: RosterEntry[] }> {
  const isFuture = date.getTime() > todayUtc().getTime();

  const [members, records, officeClosed, onLeaveIds, policy] = await Promise.all([
    employeeRepository.listAttendanceRoster(filters),
    attendanceRepository.listOnDate(date),
    officeClosedOn(date),
    leaveRepository.employeeIdsOnApprovedLeave(date),
    attendancePolicyService.get(),
  ]);

  const byEmployee = new Map(records.map((record) => [record.employeeId, record]));
  const onLeave = new Set(onLeaveIds);
  const workingDay = isWorkingWeekday(date, policy.workingDays);

  // Both counts are company-wide — `listOnDate` and `employeeIdsOnApprovedLeave`
  // take no notice of the filters above — so the same day cannot read as empty
  // through one department's view and as everybody-absent through another's.
  const holdsRecord = dayHoldsRecord(records.length, onLeaveIds.length);

  const entries = members.map((employee) => {
    const attendance = byEmployee.get(employee.id) ?? null;

    return {
      employee,
      attendance,
      status: describeDay({
        attendance,
        officeClosed,
        isWorkingDay: workingDay,
        onLeave: onLeave.has(employee.id),
        isFuture,
        holdsRecord,
      }),
    };
  });

  return { date, officeClosed, isWorkingDay: workingDay, entries };
}

function summarise(entries: RosterEntry[]): AttendanceSummary {
  return {
    expected: entries.length,
    present: entries.filter((entry) => entry.status === "PRESENT").length,
    absent: entries.filter((entry) => entry.status === "ABSENT").length,
    onLeave: entries.filter((entry) => entry.status === "ON_LEAVE").length,
  };
}

function describeDay(options: {
  attendance: AttendanceDto | null;
  officeClosed: boolean;
  isWorkingDay: boolean;
  onLeave: boolean;
  isFuture: boolean;
  /** Whether anybody at all checked in or booked leave — see `dayHoldsRecord`. */
  holdsRecord: boolean;
}): AttendanceDayStatus {
  // Order matters. A check-in that exists is a fact about the day and outranks
  // anything derived — including a closure declared afterwards, which would
  // otherwise erase the record of somebody who did come in.
  if (options.attendance) return "PRESENT";

  // A declared closure before the ordinary week, because it is the more specific
  // fact: "closed for Eid" tells you more than "it's a Sunday".
  if (options.officeClosed) return "CLOSED";

  // Then the week itself. Ahead of leave, because a day off booked across a
  // weekend costs nobody anything and reads oddly as "on leave".
  if (!options.isWorkingDay) return "NON_WORKING";

  if (options.onLeave) return "ON_LEAVE";
  if (options.isFuture) return "UPCOMING";

  // Last, because it is the weakest thing known about the day: any of the facts
  // above outranks it. A person with a check-in still reads PRESENT on a day
  // that would otherwise be empty, which is why this cannot be decided earlier.
  return options.holdsRecord ? "ABSENT" : "NO_RECORD";
}

export const attendanceService = {
  /**
   * Marks somebody present, if the office agrees they are standing in it.
   *
   * The client sends three numbers and no opinion: latitude, longitude and how
   * sure the device is. Everything after that is decided here — the distance is
   * computed server-side against `OFFICE_LOCATION`, and a body carrying its own
   * `distance` or `isInsideOffice` is refused by the schema before it arrives.
   *
   * Idempotent on purpose. A second tap returns the check-in already recorded
   * rather than an error, because "you are already marked present, at 9:12" is
   * the answer to what was being asked, not a failure to do it.
   */
  async markPresent(employeeId: string, input: MarkAttendanceInput): Promise<MarkResult> {
    const date = todayUtc();

    // Asked first: on a closed day there is no attendance to take, so judging
    // the position at all would be answering a question nobody asked.
    if (await officeClosedOn(date)) {
      throw new ConflictError(
        "The office is closed today, so there is no attendance to mark. The day costs nobody a leave.",
      );
    }

    const existing = await attendanceRepository.findByEmployeeAndDate(employeeId, date);
    if (existing) return { attendance: existing, alreadyMarked: true };

    const verdict = judgePosition(input);

    if (!verdict.allowed) {
      // A vague fix is a request to try again, not an accusation of being
      // elsewhere — the server genuinely does not know which it is. Told apart
      // by status too: 422 asks for better input, 403 is a real refusal.
      if (verdict.reason === "inaccurate") throw new ValidationError(INACCURATE_MESSAGE);
      throw new ForbiddenError(OUTSIDE_MESSAGE);
    }

    const attendance = await attendanceRepository.create({
      employeeId,
      date,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters,
      distanceMeters: verdict.distanceMeters,
    });

    // Null means the unique index refused it: another tap landed between the
    // read above and this write. The row that won is the answer.
    if (!attendance) {
      const winner = await attendanceRepository.findByEmployeeAndDate(employeeId, date);
      if (winner) return { attendance: winner, alreadyMarked: true };

      throw new ConflictError("Couldn't record that check-in. Please try again.");
    }

    return { attendance, alreadyMarked: false };
  },

  /** Where one person stands today — what the attendance screen opens on. */
  async todayFor(employeeId: string): Promise<TodayState> {
    const date = todayUtc();

    const [attendance, officeClosed, onLeaveIds, checkIns, policy] = await Promise.all([
      attendanceRepository.findByEmployeeAndDate(employeeId, date),
      officeClosedOn(date),
      leaveRepository.employeeIdsOnApprovedLeave(date),
      // Company-wide, exactly as the roster counts it — one extra count so this
      // screen and the admin screen cannot describe the same morning differently.
      attendanceRepository.countOnDate(date),
      attendancePolicyService.get(),
    ]);

    const onLeave = onLeaveIds.includes(employeeId);
    const isWorkingDay = isWorkingWeekday(date, policy.workingDays);

    const status = describeDay({
      attendance,
      officeClosed,
      isWorkingDay,
      onLeave,
      isFuture: false,
      holdsRecord: dayHoldsRecord(checkIns, onLeaveIds.length),
    });

    const blockedReason = attendance
      ? null
      : officeClosed
        ? "The office is closed today. Nobody is expected in, and the day costs nobody a leave."
        : onLeave
          ? "You are on approved leave today, so there is no attendance to mark."
          : null;

    return {
      date,
      attendance,
      status,
      // A day outside the working week is deliberately *not* blocked. The
      // working week governs who is expected and who gets warned, not who is
      // permitted to check in — somebody who comes in on a Saturday should be
      // able to record it, and simply is not chased for missing it.
      canMark: !attendance && !officeClosed && !onLeave,
      blockedReason,
      cutoffMinutes: policy.cutoffMinutes,
      isWorkingDay,
    };
  },

  listForEmployee(employeeId: string, page: number, pageSize: number) {
    return attendanceRepository.listForEmployee(employeeId, page, pageSize);
  },

  /** Days this person has been in so far this calendar month, for the dashboard. */
  presentThisMonth(employeeId: string, reference: Date = new Date()): Promise<number> {
    return attendanceRepository.countForEmployeeBetween(
      employeeId,
      startOfUtcMonth(reference),
      endOfUtcMonth(reference),
    );
  },

  /**
   * Everyone expected in on one date, and whether they came.
   *
   * Day-centric because absence only exists per day per person: there is no row
   * to page through, so the roster is built by asking who was expected and
   * subtracting who checked in.
   *
   * The roster is fetched whole and paged in memory. That is deliberate — an
   * office is tens to low hundreds of people, and the status a row is filtered
   * on does not exist in the database to filter by. Paging in SQL first would
   * mean "show me today's absentees" returning a page of whoever happened to
   * sort first, most of whom were present.
   */
  async roster(
    query: AttendanceRosterQuery,
    actorRole: Role,
  ): Promise<{
    date: Date;
    officeClosed: boolean;
    isWorkingDay: boolean;
    items: RosterEntry[];
    total: number;
    summary: AttendanceSummary;
  }> {
    assertMayViewPopulation(actorRole, query.population);

    const { date, officeClosed, isWorkingDay, entries } = await buildRoster(query.date ?? todayUtc(), {
      employeeId: query.employeeId,
      department: query.department,
      search: query.search,
      // Narrowed in the query rather than filtered out of the result, so the
      // tiles count the population on screen. Switching to Administrators
      // changes what is being measured, not just which rows are listed — the
      // same thing the overview's population toggle does.
      roles: query.population === "ALL" ? undefined : rolesInPopulation(query.population),
    });

    const filtered = query.status === "ALL" ? entries : entries.filter((e) => e.status === query.status);
    const start = (query.page - 1) * query.pageSize;

    return {
      date,
      officeClosed,
      isWorkingDay,
      items: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
      // Counted over everyone matching the filters, not the page on screen, so
      // the tiles keep meaning the same thing on page two.
      summary: summarise(entries),
    };
  },

  /**
   * One day's roster, underived and unpaged.
   *
   * The warning sweep reads this rather than working out absence for itself, so
   * "absent" cannot come to mean one thing on the admin screen and another in
   * somebody's inbox. Anyone present, on approved leave, or covered by a closure
   * is already excluded by the time it returns.
   */
  rosterEntries(date: Date, filters: { roles?: Role[]; employeeId?: string } = {}) {
    return buildRoster(date, filters);
  },

  /**
   * One person's day-by-day history across a range.
   *
   * The stretched form of `rosterEntries`, and it exists so a question about a
   * week is not `buildRoster` called seven times — that is thirty-odd round
   * trips to say what four bulk queries can. Every day is still decided by
   * `describeDay`, so absence is computed in exactly the one place it always
   * was; what changes is how the facts it needs are fetched, not the rule.
   *
   * `holdsRecord` is asked company-wide per day, exactly as the roster asks it,
   * which is why the two grouped date queries are not scoped to this employee:
   * whether a day was one the system was watching is a fact about the day.
   */
  async historyFor(
    employeeId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ date: Date; status: AttendanceDayStatus; attendance: AttendanceDto | null }>> {
    const today = todayUtc();

    const [checkIns, leaves, closures, recordedDates, leaveDates, policy] = await Promise.all([
      attendanceRepository.listForEmployeeBetween(employeeId, from, to),
      leaveRepository.approvedForEmployeeBetween(employeeId, from, to),
      holidayRepository.closedDatesBetween(from, addUtcDays(to, 1)),
      attendanceRepository.datesWithCheckInsBetween(from, to),
      leaveRepository.datesWithApprovedLeaveBetween(from, to),
      attendancePolicyService.get(),
    ]);

    const mine = new Map(checkIns.map((row) => [toIsoDate(row.date), row]));
    const onLeave = new Set(leaves.map((row) => toIsoDate(row.leaveDate)));
    const closed = new Set(closures.map(toIsoDate));
    const recorded = new Set([...recordedDates, ...leaveDates].map(toIsoDate));

    const days: Array<{ date: Date; status: AttendanceDayStatus; attendance: AttendanceDto | null }> = [];

    for (let day = from; day.getTime() <= to.getTime(); day = addUtcDays(day, 1)) {
      const iso = toIsoDate(day);
      const attendance = mine.get(iso) ?? null;

      days.push({
        date: day,
        attendance,
        status: describeDay({
          attendance,
          officeClosed: closed.has(iso),
          isWorkingDay: isWorkingWeekday(day, policy.workingDays),
          onLeave: onLeave.has(iso),
          isFuture: day.getTime() > today.getTime(),
          holdsRecord: recorded.has(iso),
        }),
      });
    }

    return days;
  },

  /**
   * How much a reset would erase, and what else it would set in motion.
   *
   * Asked before the dialog shows a number, so the person confirming is looking
   * at the real count rather than at whatever the screen last happened to load.
   * The count is read again during the reset itself — this one is a preview, and
   * a check-in landing between the two is ordinary rather than a problem.
   */
  async resetPreview(query: ResetAttendancePreviewQuery): Promise<ResetPreview> {
    const tables = tablesFor(query.target);
    const date = query.range === "DATE" ? query.date : null;

    // Whether the rows going include a claim held for today. Only then is there
    // a second letter to warn about, so a single day pointed at any past date
    // reports `null` and the dialog says nothing about a risk it does not carry.
    const clearsTodaysClaims =
      tables.warnings && (date === null || date.getTime() === todayUtc().getTime());

    const [count, leaveCount, warningCount, warningsForToday, warning] = await Promise.all([
      !tables.attendance
        ? null
        : date
          ? attendanceRepository.countOnDate(date)
          : attendanceRepository.countAll(),
      !tables.leaves ? null : date ? leaveRepository.countOnDate(date) : leaveRepository.countAll(),
      !tables.warnings
        ? null
        : date
          ? attendanceWarningRepository.countOnDate(date)
          : attendanceWarningRepository.countAll(),
      clearsTodaysClaims ? attendanceWarningRepository.countOnDate(todayUtc()) : null,
      warningExposure(tables, date),
    ]);

    return { count, leaveCount, warningCount, warningsForToday, ...warning };
  },

  /**
   * Erases the record, and says how much went.
   *
   * One expression of a grid rather than a branch per combination: `target`
   * picks the tables and `range` picks how far back, and every pairing is
   * meaningful. Clearing one day of leave is the same act as clearing all of it,
   * differing only in how much it costs — so writing them as separate cases
   * would be five chances to get the same three deletes subtly out of step.
   *
   * Leave is one of the tables because a roster is decided by two at once —
   * `describeDay` reads a leave before it reads an absence, so a reset that took
   * only check-ins left people on the screen marked *On leave* and looked to
   * whoever pressed it like a button that had done nothing at all. That is
   * precisely how this came to be reported as broken.
   *
   * Clearing leave hands the allowance back for those days, since nothing about
   * a balance is stored — `countApprovedInMonth` and every figure beside it
   * count these rows. Removing them *is* the undo; there is no second place to
   * correct. That cuts both ways for a single date, which is the one thing here
   * an employee cannot recover from: a cleared check-in can be earned again by
   * walking into the building tomorrow, a cleared booking cannot be un-cleared
   * by anybody, and the dialog says so.
   *
   * `ABSENCES` clears `attendance_warnings` — the only place absence is ever
   * written down, since the status itself is derived. It cannot make anybody
   * stop reading as absent, and does not claim to; what goes is the record of
   * the letters and the streak they counted from. Its risk is the opposite of
   * every other target's: not a lost record but a *duplicate letter*, and only
   * for today's claims, which `warningsForToday` counts separately so the dialog
   * can name it precisely.
   *
   * Holidays survive every combination. A closure is a fact about the office
   * rather than about anybody's attendance, and outlives all three tables here.
   *
   * Three deletes rather than one transaction, because a transaction spanning
   * the tables would have to be written where `prisma` is in scope and the
   * layering keeps that in the repositories. The cost is a crash in between
   * leaving one table cleared, which is safe in a way it is not for the warning
   * sweep: every delete here is idempotent over the same range, so pressing the
   * button again finishes the job rather than doing anything a second time.
   *
   * The super admin's alone, gated in the route.
   */
  async reset(input: ResetAttendanceInput): Promise<ResetResult> {
    const tables = tablesFor(input.target);
    const date = input.range === "DATE" ? input.date : undefined;

    const [removed, removedLeaves, removedWarnings] = await Promise.all([
      tables.attendance ? attendanceRepository.deleteMany(date) : 0,
      tables.leaves ? leaveRepository.deleteMany(date) : 0,
      tables.warnings ? attendanceWarningRepository.deleteMany(date) : 0,
    ]);

    return { removed, removedLeaves, removedWarnings, range: input.range, target: input.target };
  },

  /**
   * Today at a glance for one population, for the admin overview.
   *
   * Scoped by role because the overview reports on employees and administrators
   * separately — an attendance tile that silently counted both would disagree
   * with every other figure beside it.
   */
  async summaryOn(date: Date, roles?: Role[]): Promise<AttendanceSummary & { officeClosed: boolean }> {
    const { officeClosed, entries } = await buildRoster(date, { roles });
    return { ...summarise(entries), officeClosed };
  },
};
