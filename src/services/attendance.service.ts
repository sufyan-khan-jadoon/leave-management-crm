import type { Role } from "@prisma/client";

import { hasCutoffPassed } from "@/lib/attendance-policy";
import { endOfUtcMonth, startOfUtcMonth, todayUtc } from "@/lib/date";
import { isWorkingWeekday } from "@/lib/working-days";
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
  /** Check-ins the reset would remove — `null` when the scope leaves them alone. */
  count: number | null;
  /**
   * Leave rows the reset would remove — `null` when the scope leaves them alone.
   *
   * Reported beside the check-in count rather than folded into one total,
   * because the two are not the same loss. A cleared check-in can be recorded
   * again by walking into the building; a cleared leave hands an allowance back
   * and takes a history away. Somebody confirming this should see both numbers
   * rather than their sum.
   *
   * `null` rather than `0` throughout, so "this scope does not touch that table"
   * and "that table is already empty" stay different sentences. The dialog says
   * different things about them.
   */
  leaveCount: number | null;
  /**
   * Warning rows the reset would remove — `null` when the scope leaves them
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
  removed: number;
  /** Leave rows removed. Always 0 for a single day, which never touches them. */
  removedLeaves: number;
  /** Warning rows removed — the record of absence, not the absence itself. */
  removedWarnings: number;
  scope: ResetAttendanceInput["scope"];
};

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
 * It is reported rather than prevented. Suppressing it would mean inserting
 * warning rows for letters nobody sent, which would put a lie in the table that
 * `consecutiveMissed` and every future letter are built from — worse than the
 * mail it avoided. The screen names the risk and points at the off switch, which
 * is on the same panel, and the super admin decides.
 *
 * An all-time reset now widens *who* is exposed without changing the answer
 * here. It clears leave as well, and somebody on approved leave today is
 * excluded from the sweep by that row alone — so deleting it turns them into an
 * ordinary absentee the cutoff applies to. The conjunction below already covers
 * them, because it is about the day rather than about any one person.
 */
async function warningExposure(date: Date | null): Promise<{
  mayTriggerWarnings: boolean;
  cutoffMinutes: number;
}> {
  const policy = await attendancePolicyService.get();

  // An all-time reset takes today with it, so it carries the same exposure.
  const touchesToday = date === null || date.getTime() === todayUtc().getTime();

  const mayTriggerWarnings =
    policy.warningsEnabled &&
    touchesToday &&
    isWorkingWeekday(todayUtc(), policy.workingDays) &&
    hasCutoffPassed(todayUtc(), policy.cutoffMinutes);

  return { mayTriggerWarnings, cutoffMinutes: policy.cutoffMinutes };
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
  return options.isFuture ? "UPCOMING" : "ABSENT";
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

    const [attendance, officeClosed, onLeaveIds, policy] = await Promise.all([
      attendanceRepository.findByEmployeeAndDate(employeeId, date),
      officeClosedOn(date),
      leaveRepository.employeeIdsOnApprovedLeave(date),
      attendancePolicyService.get(),
    ]);

    const onLeave = onLeaveIds.includes(employeeId);
    const isWorkingDay = isWorkingWeekday(date, policy.workingDays);

    const status = describeDay({ attendance, officeClosed, isWorkingDay, onLeave, isFuture: false });

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
  async roster(query: AttendanceRosterQuery): Promise<{
    date: Date;
    officeClosed: boolean;
    isWorkingDay: boolean;
    items: RosterEntry[];
    total: number;
    summary: AttendanceSummary;
  }> {
    const { date, officeClosed, isWorkingDay, entries } = await buildRoster(query.date ?? todayUtc(), {
      employeeId: query.employeeId,
      department: query.department,
      search: query.search,
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
  rosterEntries(date: Date, filters: { roles?: Role[] } = {}) {
    return buildRoster(date, filters);
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
    const { scope } = query;
    const touchesAttendance = scope === "DATE" || scope === "ATTENDANCE" || scope === "ALL_TIME";
    const touchesLeave = scope === "LEAVES" || scope === "ALL_TIME";
    const touchesWarnings = scope === "ABSENCES" || scope === "ALL_TIME";

    const [count, leaveCount, warningCount, warningsForToday, warning] = await Promise.all([
      !touchesAttendance
        ? null
        : scope === "DATE"
          ? attendanceRepository.countOnDate(query.date)
          : attendanceRepository.countAll(),
      touchesLeave ? leaveRepository.countAll() : null,
      touchesWarnings ? attendanceWarningRepository.countAll() : null,
      touchesWarnings ? attendanceWarningRepository.countOnDate(todayUtc()) : null,
      warningExposure(scope === "DATE" ? query.date : null),
    ]);

    return { count, leaveCount, warningCount, warningsForToday, ...warning };
  },

  /**
   * Erases the record of a day, and says how much went.
   *
   * The two scopes are deliberately not the same act. `DATE` clears **check-ins
   * only**, which is why it needs no typed confirmation: presence can be
   * recorded again by walking into the building. `ALL_TIME` also erases every
   * leave ever booked, and nothing can put those back.
   *
   * Leave belongs here because a roster is decided by both tables at once —
   * `describeDay` reads a leave before it reads an absence, so a reset that took
   * only check-ins left people on the screen marked *On leave* and looked to
   * whoever pressed it like a button that had done nothing at all. That is
   * precisely how this came to be reported as broken.
   *
   * Clearing leave hands every allowance back, since nothing about a balance is
   * stored — `countApprovedInMonth` and every figure beside it count these rows.
   * Removing them *is* the undo; there is no second place to correct.
   *
   * `ABSENCES` clears `attendance_warnings` — the only place absence is ever
   * written down, since the status itself is derived. It cannot make anybody
   * stop reading as absent, and does not claim to; what goes is the record of
   * the letters and the streak they counted from. Its risk is the opposite of
   * every other scope's: not a lost record but a *duplicate letter*, and only
   * for today's claims, which `warningsForToday` counts separately so the dialog
   * can name it precisely.
   *
   * Holidays survive every scope. A closure is a fact about the office rather
   * than about anybody's attendance, and outlives all three tables here.
   *
   * The super admin's alone, gated in the route.
   */
  async reset(input: ResetAttendanceInput): Promise<ResetResult> {
    switch (input.scope) {
      case "DATE":
        return {
          removed: await attendanceRepository.deleteMany(input.date),
          removedLeaves: 0,
          removedWarnings: 0,
          scope: input.scope,
        };

      case "ATTENDANCE":
        return {
          removed: await attendanceRepository.deleteMany(),
          removedLeaves: 0,
          removedWarnings: 0,
          scope: input.scope,
        };

      case "LEAVES":
        return {
          removed: 0,
          removedLeaves: await leaveRepository.deleteAll(),
          removedWarnings: 0,
          scope: input.scope,
        };

      case "ABSENCES":
        return {
          removed: 0,
          removedLeaves: 0,
          removedWarnings: await attendanceWarningRepository.deleteAll(),
          scope: input.scope,
        };

      case "ALL_TIME": {
        // Two deletes rather than one transaction, because a transaction
        // spanning both tables would have to be written where `prisma` is in
        // scope, and the layering keeps that in the repositories. The cost is a
        // crash in between leaving one table cleared, which is safe here in a
        // way it is not for the warning sweep: both deletes are unfiltered, so
        // pressing the button again finishes the job rather than doing anything
        // a second time.
        const [removed, removedLeaves, removedWarnings] = await Promise.all([
          attendanceRepository.deleteMany(),
          leaveRepository.deleteAll(),
          attendanceWarningRepository.deleteAll(),
        ]);

        return { removed, removedLeaves, removedWarnings, scope: input.scope };
      }
    }
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
