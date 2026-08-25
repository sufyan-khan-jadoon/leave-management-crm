import type { Role } from "@prisma/client";

import {
  cutoffInstant,
  describeHrMarkWindow,
  friendlyTimeLabel,
  hasCutoffPassed,
  hrMarkWindowExpiresAt,
  isAfterClosing,
  isWithinHrMarkWindow,
} from "@/lib/attendance-policy";
import {
  isEditableDayStatus,
  isHistoricalDate,
  isNoOp,
  planAttendanceEdit,
} from "@/lib/attendance-edit";
import { dayStatusLabel } from "@/lib/report-labels";
import { MONTHLY_LEAVE_ALLOWANCE } from "@/lib/constants";
import {
  addUtcDays,
  appZoneInstant,
  appZoneMinutesOfDay,
  endOfUtcMonth,
  formatDateTime,
  startOfUtcMonth,
  toIsoDate,
  todayUtc,
  type DayScope,
} from "@/lib/date";
import { attendanceStartOf, isBeforeEmployment } from "@/lib/employment";
import { minutesLate } from "@/lib/lateness";
import { selfCheckInRefusal } from "@/lib/self-check-in";
import { coversDate, describeRemotePeriod } from "@/lib/remote-work";
import { isWorkingWeekday } from "@/lib/working-days";
import { isSuperAdminRole, rolesInPopulation } from "@/lib/enums";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { judgePosition } from "@/lib/geo";
import {
  attendanceRepository,
  type AttendanceDto,
} from "@/repositories/attendance.repository";
import {
  attendanceEditRepository,
  type AttendanceEditDto,
} from "@/repositories/attendance-edit.repository";
import {
  employeeRepository,
  type AttendanceRosterMember,
} from "@/repositories/employee.repository";
import { attendanceWarningRepository } from "@/repositories/attendance-warning.repository";
import { holidayRepository } from "@/repositories/holiday.repository";
import { leaveRepository } from "@/repositories/leave.repository";
import {
  remoteWorkRepository,
  type RemoteCoverage,
} from "@/repositories/remote-work.repository";
import { attendancePolicyService } from "@/services/attendance-policy.service";
import { populationService, type PopulationActor } from "@/services/population.service";
import type {
  MarkAttendanceInput,
  MarkEmployeePresentInput,
  AttendanceRosterQuery,
  ResetAttendanceInput,
  ResetAttendancePreviewQuery,
} from "@/validations/attendance.schema";
import type {
  AttendanceEditInput,
  AttendanceEditQuery,
} from "@/validations/attendance-edit.schema";

/** What a historical correction moved, and what the day reads as now. */
export type AttendanceEditResult = {
  status: AttendanceDayStatus;
  attendance: AttendanceDto | null;
  previousStatus: AttendanceDayStatus;
  record: AttendanceEditDto;
};

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
  /**
   * Working away from the office under an arranged remote period.
   *
   * **Attendance-exempt, and that is the whole of it.** Not a softer word for
   * present and not a kind of leave: nobody is expected in, nothing is deducted
   * from an allowance, no warning letter can reach them for it, and every report
   * drops the day out of the attendance denominator rather than counting it as
   * one they failed to appear on. Derived from `remote_work_assignments` on
   * every read exactly as absence and closures are, so shortening or revoking a
   * period puts the days straight back with nothing to migrate.
   */
  | "REMOTE"
  /** A working day, not on leave, not remote, and no check-in. */
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
  /**
   * The day is earlier than the person's own account.
   *
   * **Not a softer word for absent, and not a variety of `NO_RECORD` either.**
   * That one says the *company* holds nothing about a date; this says the date
   * was not this person's to hold anything about. Somebody who registered on 22
   * August cannot have missed the 21st, however busy the office was that day —
   * they were not on the books, no letter could have reached them, and no
   * denominator has any business counting it.
   *
   * Derived from `Employee.createdAt` on every read, exactly as absence,
   * closures and remote periods are, so nothing had to be written or migrated to
   * make the pre-registration stretch stop reading as a run of missed days. See
   * `src/lib/employment.ts` for why the boundary is the account's own creation
   * day and deliberately not `joiningDate`.
   */
  | "PRE_EMPLOYMENT"
  /** The day has not happened yet, so there is nothing to be absent from. */
  | "UPCOMING";

export type RosterEntry = {
  employee: AttendanceRosterMember;
  status: AttendanceDayStatus;
  attendance: AttendanceDto | null;
};

/**
 * What one date amounted to for one person.
 *
 * A roster entry with the person taken off it, because a history is already
 * about somebody. Named so the report and the assistant can speak about the
 * shape rather than restating it — both walk these, and neither should be
 * declaring its own idea of what a day is.
 */
export type DayRecord = {
  date: Date;
  status: AttendanceDayStatus;
  attendance: AttendanceDto | null;
};

/** How a day went for a group of people. */
export type AttendanceSummary = {
  expected: number;
  present: number;
  absent: number;
  onLeave: number;
  /**
   * Working away from the office under an arranged period.
   *
   * A column of its own beside `present` and `absent` rather than folded into
   * either, because it is neither: these people are exempt from the register for
   * the day. `expected` still counts them — they are on the roster, and a
   * headcount that quietly shrank when somebody went remote would leave the
   * tiles failing to sum.
   */
  remote: number;
  /**
   * Present, but past the deadline. A **subset of `present`**, not a fifth
   * column beside it — somebody late was still there, and adding this to the
   * others would count them twice and make the tiles overshoot the headcount.
   */
  late: number;
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
  /**
   * The remote period covering today, when there is one.
   *
   * Carried so the screen can say *which* arrangement is in force and until
   * when, rather than only that attendance is not required — "remote until 31
   * August" is the answer somebody is actually looking for, and without it they
   * have nowhere to check whether it has been extended.
   */
  remote: { periodLabel: string; reason: string; permanent: boolean } | null;
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
 * How far back a range reaches. The companion of `tablesFor`: that decides which
 * tables, this decides which days, and every pairing of the two is meaningful.
 *
 * **`ALL_TIME` stops at today, and that bound is the fix for a real defect.** It
 * used to pass no filter at all, which deleted the table — and `leaveDate` is
 * routinely in the *future*, because booking leave is booking a day that has not
 * happened. So "clear the history" quietly cancelled everybody's upcoming leave
 * along with the record of their past leave. Nothing announced it and nothing
 * could undo it: no balance is stored anywhere, so the rows were the booking.
 *
 * "All time" now means all of *recorded* time, which is what an administrator
 * clearing a history means by it. A day still to come has no history to clear.
 *
 * `DATE` is deliberately left alone, future or not: naming a single date is an
 * explicit instruction about that date, not a sweep that happens to reach it.
 */
function resetScope(range: ResetAttendanceInput["range"], date: Date | undefined): DayScope {
  return range === "DATE" && date ? { on: date } : { upTo: todayUtc() };
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
 * Whether this account may record somebody present without the geofence.
 *
 * The super admin always; an administrator once granted `canMarkAttendance`,
 * read from the row on every attempt like every other delegable right.
 *
 * Kept apart from `canViewAdminRecords` on purpose. That grant decides who may
 * *report* on administrators as a group; this one decides who may write a fact
 * the building never proved. Folding the two together would mean an HR
 * administrator given the reporting view silently acquired the ability to record
 * attendance for anybody, which is the one thing on this screen that cannot be
 * undone by looking again.
 */
async function mayMarkAttendance(actor: PopulationActor): Promise<boolean> {
  if (isSuperAdminRole(actor.role)) return true;
  if (actor.role !== "ADMIN") return false;

  const employee = await employeeRepository.findById(actor.id);
  return Boolean(employee?.canMarkAttendance);
}

/**
 * Whether this account may correct a day that has already finished.
 *
 * The super admin always — nobody has to grant themselves the ability to put
 * the register right, and there is no one senior to ask. An administrator only
 * once `canEditHistoricalAttendance` is set, read from the row on every attempt
 * exactly as the other eight delegable rights are, so withdrawing it stops the
 * very next request rather than waiting out a week-old token.
 *
 * Deliberately a separate question from `mayMarkAttendance`. That grant is a
 * bounded grace period travelling in one direction; this one has no window and
 * can delete a check-in the building proved. An HR administrator trusted with
 * the first must not silently acquire the second.
 */
async function mayEditHistoricalAttendance(actor: PopulationActor): Promise<boolean> {
  if (isSuperAdminRole(actor.role)) return true;
  if (actor.role !== "ADMIN") return false;

  const employee = await employeeRepository.findById(actor.id);
  return Boolean(employee?.canEditHistoricalAttendance);
}

/**
 * Writes the approved leave a correction to `ON_LEAVE` implies.
 *
 * **The monthly allowance is enforced here, and that is what makes this safe to
 * exist at all.** The working notes are emphatic that there is no administrator
 * approval path and that adding one back would let somebody approve past
 * `MONTHLY_LEAVE_ALLOWANCE` by hand. This is not that: it is a correction to a
 * day already gone, and it is refused by the same count that refuses an
 * employee's own request. An administrator can record that leave was taken; they
 * cannot grant more of it than the policy allows.
 *
 * `usedInMonth`'s own logic is repeated in one respect only — discounting days
 * the office turned out to be closed — because `countApprovedInMonth` takes that
 * list as an argument and a count that ignored it would charge somebody for a
 * closure. The allowance rule itself is the constant, read from one place.
 *
 * The reason is generated rather than asked for. The requirement is a one-click
 * correction, and `Leave.reason` is a required column, so the honest thing to put
 * in it is what actually happened — never a blank, and never "n/a", which is what
 * a mandatory box would collect.
 */
async function assertLeaveAllowance(employeeId: string, date: Date): Promise<void> {
  const closedDates = await holidayRepository.closedDatesBetween(
    startOfUtcMonth(date),
    endOfUtcMonth(date),
  );

  const used = await leaveRepository.countApprovedInMonth(employeeId, date, closedDates);

  if (used >= MONTHLY_LEAVE_ALLOWANCE) {
    throw new ConflictError(
      `That would be more than the ${MONTHLY_LEAVE_ALLOWANCE} leaves allowed in ${toIsoDate(date).slice(0, 7)} — ${used} are already recorded. The allowance decides this, not an administrator.`,
    );
  }
}

/**
 * Writes the approved leave the correction implies.
 *
 * Separate from the check above **because the check has to run before anything
 * is deleted**. The two were one function at first, called in plan order, and
 * that was wrong in a way only the `PRESENT → ON_LEAVE` path shows: the
 * check-in is removed first, so an allowance refusal landed *after* the delete
 * and left the day reading `ABSENT` with no audit row to say why. A refusal has
 * to leave the record exactly as it found it.
 */
async function bookCorrectedLeave(employeeId: string, date: Date): Promise<void> {
  await leaveRepository.create({
    employeeId,
    leaveDate: date,
    // Generated rather than asked for. The requirement is a one-click
    // correction and `Leave.reason` is a required column, so the honest thing to
    // put in it is what actually happened — never a blank, and never the "n/a" a
    // mandatory box would collect.
    reason: "Recorded by an administrator when correcting the attendance record.",
    status: "APPROVED",
  });

  // Nothing is emailed. The other surfaces that write on somebody's behalf —
  // invitations, remote work, complaint resolutions — all send, and this
  // deliberately does not: a correction to a fortnight-old register is
  // bookkeeping, and a letter about a day already past gives its recipient
  // nothing to do. The audit row is where this is answerable.
}

/**
 * Whose attendance this account may correct.
 *
 * Deliberately **not** `assertMayManage`, and the difference is the whole point.
 * That rule governs acts on an *account* — editing an address, suspending,
 * deleting — and reserves administrator accounts for the super admin, because
 * changing an admin's email is the first half of taking it over. Correcting a
 * day somebody was in the office is not that. It writes one attendance row, it
 * touches nothing about the account, and an administrator who came in and whose
 * phone failed has exactly the same problem an employee does.
 *
 * So the tiers differ by one rung: a granted administrator may correct
 * `EMPLOYEE` **and** `ADMIN`, where `assertMayManage` would allow only the
 * former.
 *
 * Two things it still refuses, both load-bearing:
 *
 * - **Nobody corrects their own day.** The grant is a narrow exception to
 *   "presence is proved by standing there"; aimed at yourself it is simply a way
 *   to mark yourself present from home, every day, without ever going in. That
 *   is the geofence defeated rather than excepted. Somebody else with the grant,
 *   or the super admin, does it for you — the same shape as `assertMayManage`
 *   sending you to `/profile` for your own account.
 * - **Nobody corrects the super admin**, itself included, mirroring
 *   `assertMayManage` exactly. The owner is unmanageable from the dashboard, and
 *   an HR administrator able to write attendance for the account that granted
 *   them the right would be the boundary running backwards.
 *
 * The role is read from the row rather than from the roster, which deliberately
 * carries no `role` — see `attendanceRosterSelect`.
 */
function mayCorrect(actor: PopulationActor, target: { id: string; role: Role }): boolean {
  return target.id !== actor.id && target.role !== "SUPER_ADMIN";
}

function assertMayCorrect(actor: PopulationActor, target: { id: string; role: Role }): void {
  if (target.id === actor.id) {
    throw new ForbiddenError(
      "You cannot record your own attendance here. Marking yourself present is what the office check-in is for; ask another administrator to correct the day.",
    );
  }

  if (target.role === "SUPER_ADMIN") {
    throw new ForbiddenError("The super administrator's attendance cannot be recorded by hand.");
  }
}

/**
 * Why a day cannot be corrected, in the words the administrator sees.
 *
 * Every branch is a status `describeDay` already decided, which is the whole
 * point of judging this against the roster rather than re-deriving it: the
 * closure rules, the working week, approved leave and `NO_RECORD` all reach
 * here having been settled in the one place they are settled everywhere else.
 * A second opinion about what a day meant is exactly what this screen must not
 * introduce.
 */
function refusalFor(status: AttendanceDayStatus, date: Date): string | null {
  switch (status) {
    case "ABSENT":
      return null;

    case "CLOSED":
      return `The office was closed on ${toIsoDate(date)}, so there is no attendance to record. The day costs nobody a leave.`;

    case "NON_WORKING":
      return `${toIsoDate(date)} is not a working day, so nobody was expected in and nobody is marked absent.`;

    case "ON_LEAVE":
      return "This person was on approved leave that day. Recording them present would take a day back off their allowance without their asking — cancel the leave first if they actually came in.";

    // Refused rather than allowed, and the reason is the point of the status.
    // A remote day is attendance-exempt: nobody is marked absent for it and
    // nobody is chased about it, so there is no wrong record here to correct.
    // Writing one would assert that somebody who was arranged to work from home
    // stood in the building, which is exactly the claim there is no reason to
    // accept — and it would do it by hand, past the geofence.
    case "REMOTE":
      return `This person was working remotely on ${toIsoDate(date)}, so no attendance is expected and nobody is marked absent for it. If they actually came in, they can still check in from the office themselves; if the arrangement is wrong, shorten or revoke the remote period.`;

    case "UPCOMING":
      return "That day has not happened yet, so there is nothing to correct.";

    // Refused as both a source and a target, exactly as the calendar's own
    // statuses are. The day is earlier than the account, so there is no wrong
    // record here to put right — nobody was marked absent for it and nobody was
    // chased about it. Writing one would assert that somebody attended an office
    // before they existed in the system, which is the false record this boundary
    // was added to stop.
    case "PRE_EMPLOYMENT":
      return `${toIsoDate(date)} is before this person registered, so no attendance is expected for it and nobody is marked absent. Their record starts on the day their account was created.`;

    // The interesting refusal, and the reason it is a refusal rather than a
    // convenience. On a day holding no check-in and no leave for *anybody*, the
    // whole company reads NO_RECORD — the system was not watching, so nobody is
    // accused. Writing one row would make the day "held", flipping every other
    // person from NO_RECORD to ABSENT in one act; and if that day is today and
    // the cutoff has passed, the next warning sweep would write to all of them.
    // One correction would become a letter to the entire organisation.
    case "NO_RECORD":
      return `Nothing at all is recorded for ${toIsoDate(date)} — no check-ins and no leave for anybody — so nobody is marked absent for it and nobody will be chased about it. Recording one person present would make every one of their colleagues read as absent for that day.`;

    case "PRESENT":
      return null;
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

  const [members, records, officeClosed, onLeaveIds, remoteIds, policy] = await Promise.all([
    employeeRepository.listAttendanceRoster(filters),
    attendanceRepository.listOnDate(date),
    officeClosedOn(date),
    leaveRepository.employeeIdsOnApprovedLeave(date),
    // Company-wide and unfiltered, exactly like the two queries above it: who is
    // remote is a fact about people, and asking it once per roster rather than
    // once per row keeps this to one extra query however large the office is.
    remoteWorkRepository.employeeIdsRemoteOn(date),
    attendancePolicyService.get(),
  ]);

  const byEmployee = new Map(records.map((record) => [record.employeeId, record]));
  const onLeave = new Set(onLeaveIds);
  const remote = new Set(remoteIds);
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
        isRemote: remote.has(employee.id),
        isFuture,
        holdsRecord,
        // Read off the row the roster already fetched rather than through a
        // second query — `attendanceRosterSelect` carries `createdAt` for this
        // one purpose, so the boundary costs nothing over listing the people.
        beforeEmployment: isBeforeEmployment(date, attendanceStartOf(employee.createdAt)),
      }),
    };
  });

  return { date, officeClosed, isWorkingDay: workingDay, entries };
}

/**
 * Builds the day-by-day history of everybody asked about, in one set of queries.
 *
 * The engine behind both `historyFor` and `historiesFor`. Split out here rather
 * than left in the service object so the two cannot drift, and so the empty case
 * short-circuits before any query is issued — a report whose people selection
 * resolved to nobody should cost nothing rather than five round trips returning
 * nothing.
 */
async function buildHistories(
  employeeIds: string[],
  from: Date,
  to: Date,
): Promise<Map<string, DayRecord[]>> {
  const histories = new Map<string, DayRecord[]>();
  if (employeeIds.length === 0) return histories;

  const today = todayUtc();

  const [checkIns, leaves, closures, remoteSpans, recordedDates, leaveDates, registeredAt, policy] =
    await Promise.all([
      attendanceRepository.listRowsForEmployeesBetween(employeeIds, from, to),
      leaveRepository.approvedForEmployeesBetween(employeeIds, from, to),
      holidayRepository.closedDatesBetween(from, addUtcDays(to, 1)),
      // Fetched as intervals rather than expanded into dates, because an
      // open-ended period has no end to expand to. One query for the whole
      // rectangle, like every other read here.
      remoteWorkRepository.coveringBetween(employeeIds, from, to),
      attendanceRepository.datesWithCheckInsBetween(from, to),
      leaveRepository.datesWithApprovedLeaveBetween(from, to),
      // One more bulk read for the whole rectangle, in the shape of every other
      // one here. Unlike the roster, this walk is handed ids rather than rows,
      // so there is nothing already fetched to read the registration day off.
      employeeRepository.registrationDatesFor(employeeIds),
      attendancePolicyService.get(),
    ]);

  const key = (employeeId: string, day: Date) => `${employeeId}|${toIsoDate(day)}`;

  const byPersonDay = new Map(checkIns.map((row) => [key(row.employeeId, row.date), row]));
  const onLeave = new Set(leaves.map((row) => key(row.employeeId, row.leaveDate)));
  const closed = new Set(closures.map(toIsoDate));
  const recorded = new Set([...recordedDates, ...leaveDates].map(toIsoDate));

  // Grouped per person so the day walk below tests a handful of intervals rather
  // than scanning the whole company's arrangements once per cell.
  const remoteByPerson = new Map<string, RemoteCoverage[]>();

  for (const span of remoteSpans) {
    remoteByPerson.set(span.employeeId, [...(remoteByPerson.get(span.employeeId) ?? []), span]);
  }

  // The calendar is walked once and the weekday judged once per day rather than
  // once per person per day: the answer cannot differ between two people, and an
  // office of any size makes that the difference between a few dozen comparisons
  // and a few thousand.
  const calendar: Array<{ date: Date; iso: string; isWorkingDay: boolean; isFuture: boolean }> = [];

  for (let day = from; day.getTime() <= to.getTime(); day = addUtcDays(day, 1)) {
    calendar.push({
      date: day,
      iso: toIsoDate(day),
      isWorkingDay: isWorkingWeekday(day, policy.workingDays),
      isFuture: day.getTime() > today.getTime(),
    });
  }

  for (const employeeId of employeeIds) {
    const spans = remoteByPerson.get(employeeId) ?? [];

    // Resolved once per person rather than once per cell: `attendanceStartOf`
    // goes through `Intl`, and a month for a hundred people is three thousand
    // cells. Null only for an id that resolved to nobody, which `historiesFor`
    // is handed by a caller that has already looked them up — treated as no
    // boundary rather than as everything being before it, since inventing a
    // start date for a person who is not there would blank their whole report.
    const start = registeredAt.get(employeeId);
    const attendanceStart = start ? attendanceStartOf(start) : null;

    histories.set(
      employeeId,
      calendar.map((day) => {
        const attendance = byPersonDay.get(key(employeeId, day.date)) ?? null;

        return {
          date: day.date,
          attendance,
          status: describeDay({
            attendance,
            officeClosed: closed.has(day.iso),
            isWorkingDay: day.isWorkingDay,
            onLeave: onLeave.has(key(employeeId, day.date)),
            beforeEmployment:
              attendanceStart !== null && isBeforeEmployment(day.date, attendanceStart),
            // `coversDate` is the same pure rule the SQL predicate mirrors, so
            // the two are checked against each other on every cell of every
            // report rather than only where somebody remembered to.
            isRemote: spans.some((span) => coversDate(span, day.date)),
            isFuture: day.isFuture,
            holdsRecord: recorded.has(day.iso),
          }),
        };
      }),
    );
  }

  return histories;
}

function summarise(entries: RosterEntry[]): AttendanceSummary {
  return {
    expected: entries.length,
    present: entries.filter((entry) => entry.status === "PRESENT").length,
    absent: entries.filter((entry) => entry.status === "ABSENT").length,
    onLeave: entries.filter((entry) => entry.status === "ON_LEAVE").length,
    remote: entries.filter((entry) => entry.status === "REMOTE").length,
    // Counted off the rows rather than tracked separately, so it cannot disagree
    // with the figure each row displays.
    late: entries.filter((entry) => lateMinutesOf(entry.attendance) > 0).length,
  };
}

/**
 * How late one check-in was, or zero when there was none.
 *
 * The single place a row is turned into a number of minutes. Derived on read
 * rather than stored, exactly as every other attendance status is — what the row
 * carries is the *basis* it was judged by, so the arithmetic can never fall out
 * of step with the check-in time it was computed from.
 */
export function lateMinutesOf(attendance: AttendanceDto | null): number {
  if (!attendance) return 0;
  return minutesLate(appZoneMinutesOfDay(attendance.checkInAt), attendance.lateBasisMinutes);
}

function describeDay(options: {
  attendance: AttendanceDto | null;
  officeClosed: boolean;
  isWorkingDay: boolean;
  onLeave: boolean;
  /** Covered by an arranged remote-work period — see `AttendanceDayStatus`. */
  isRemote: boolean;
  isFuture: boolean;
  /** Whether anybody at all checked in or booked leave — see `dayHoldsRecord`. */
  holdsRecord: boolean;
  /** Earlier than this person's own account — see `PRE_EMPLOYMENT`. */
  beforeEmployment: boolean;
}): AttendanceDayStatus {
  // Order matters. A check-in that exists is a fact about the day and outranks
  // anything derived — including a closure declared afterwards, which would
  // otherwise erase the record of somebody who did come in.
  //
  // It outranks a remote period too, and deliberately: somebody arranged to work
  // from home who nonetheless walked into the office and checked in *was there*,
  // and the building is the stronger evidence. Nothing is taken from them for
  // it — remote costs nothing either way.
  if (options.attendance) return "PRESENT";

  // Immediately below the check-in, and above every calendar fact.
  //
  // **Below `PRESENT` because that is what protects existing employees.** A row
  // dated before the account — a seeded history, an import, a correction made
  // through the historical editor — is evidence that somebody was there, and it
  // outranks an inference drawn from a timestamp. Nobody's recorded past
  // disappears because of this ordering; only the invented absences do.
  //
  // **Above the closure and the working week because it is the more specific
  // fact, and because it is the only one that keeps the arithmetic honest.**
  // A pre-registration stretch reading as a mix of "office closed", "non-working
  // day" and this would leave `coverageOf` counting some of those days as days
  // off the person had, and a calendar showing three explanations for one thing.
  // Ranked here, every day before somebody's first is exactly one status, is
  // subtracted from `workingDays` once, and is a record in nothing.
  if (options.beforeEmployment) return "PRE_EMPLOYMENT";

  // A declared closure before the ordinary week, because it is the more specific
  // fact: "closed for Eid" tells you more than "it's a Sunday".
  //
  // Above remote as well. A closure is a fact about the whole company's calendar
  // and outranks any individual arrangement — on a day the office is shut,
  // "working remotely" is not the interesting thing about the date, and reading
  // it that way for some people and CLOSED for the rest would split one day's
  // roster into two accounts of it.
  if (options.officeClosed) return "CLOSED";

  // Then the week itself. Ahead of leave, because a day off booked across a
  // weekend costs nobody anything and reads oddly as "on leave" — and ahead of
  // remote for the same reason, since nobody works a Sunday remotely either.
  if (!options.isWorkingDay) return "NON_WORKING";

  // Leave above remote, which is the one ordering here worth arguing. Somebody
  // remote for August who booked the 25th off is *not working* on the 25th — the
  // leave is the more specific fact about the person, and it is the one that
  // cost them a day of allowance. Reading it as REMOTE would hide a charge they
  // have already paid. `planLeave` refuses new leave inside a remote period, so
  // this only arises for leave booked first, which is exactly the case where the
  // employee's own booking should win.
  if (options.onLeave) return "ON_LEAVE";

  // Remote is judged **above** the future, matching the closure two lines up: a
  // period arranged for next week is a fact already declared about those days,
  // and "remote" answers more than "hasn't happened yet".
  if (options.isRemote) return "REMOTE";

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
   *
   * **The calendar is asked before the fence, and that ordering is the rule
   * rather than a tidiness.** A day off is a fact about the date; being inside
   * the office is a fact about a position, and no amount of standing in the
   * right place changes what day it is. Judging the position first — or, as this
   * did, judging it without ever asking the working week — let somebody inside
   * the geofence record a Saturday, on a day every other surface here already
   * called `NON_WORKING` and refused. See `src/lib/self-check-in.ts`.
   */
  async markPresent(employeeId: string, input: MarkAttendanceInput): Promise<MarkResult> {
    // The date is the **server's**, resolved on the company's calendar. The
    // request body has no field for one — `markAttendanceSchema` is a
    // `strictObject` carrying three numbers — so a client cannot nominate a
    // working day to be judged against.
    const date = todayUtc();

    // Every calendar fact, resolved before the position is so much as looked at.
    // Fetched together because they are one question: is today a day this person
    // can record at all.
    const [officeClosed, onLeaveIds, policy] = await Promise.all([
      officeClosedOn(date),
      leaveRepository.employeeIdsOnApprovedLeave(date),
      attendancePolicyService.get(),
    ]);

    // The whole of the eligibility rule, from the one place that states it — the
    // same function `todayFor` builds the dashboard card's notice from, so the
    // screen and this endpoint cannot come to say different things about one
    // morning. A refusal here is a `ConflictError` (409): the request was
    // well-formed and the day was simply not one to record, which is a different
    // answer from "you are somewhere else" (403) and from "we cannot tell where
    // you are" (422).
    const refusal = selfCheckInRefusal({
      officeClosed,
      isWorkingDay: isWorkingWeekday(date, policy.workingDays),
      onLeave: onLeaveIds.includes(employeeId),
    });

    if (refusal) throw new ConflictError(refusal);

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

    // `policy` was read above with the calendar facts rather than here. It is
    // the same singleton either way; fetching it once keeps the deadline frozen
    // onto the row below the very one the eligibility check was judged against,
    // so a policy edit landing mid-request cannot produce a row judged by two.
    const attendance = await attendanceRepository.create({
      employeeId,
      date,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters,
      distanceMeters: verdict.distanceMeters,
      lateBasisMinutes: policy.cutoffMinutes,
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

  mayMarkAttendance,

  /**
   * Grants or withdraws the right to record attendance by hand. The super
   * admin's alone, gated in the route that calls it.
   */
  setMarkPermission(adminId: string, allowed: boolean) {
    return employeeRepository.setMarkAttendancePermission(adminId, allowed);
  },

  /**
   * Records somebody present on an administrator's word, for a day already gone.
   *
   * The exception to "presence is proved by standing there", and it is narrow by
   * construction: it can only ever turn `ABSENT` into `PRESENT`, on a date the
   * roster already calls absent, for somebody active. Everything else is
   * refused, and refused in the roster's own words.
   *
   * **It judges the day by building the roster rather than by asking its own
   * questions.** That is the load-bearing decision here. The closure rules, the
   * working week, approved leave, the future and `NO_RECORD` are all settled by
   * `describeDay` for every other surface, so asking it once more costs four
   * queries and guarantees this screen can never disagree with the one beside
   * it. A hand-written "is it a working day and not a holiday" check here would
   * be a second opinion, and the second opinion is always the one that rots.
   *
   * **It creates a row; it does not amend one.** An absent person has no record
   * to update — absence is the lack of one. The unique index is what makes that
   * safe: a row already there means somebody checked in between the roster read
   * and this write, and that check-in wins, because it is the stronger evidence
   * of the two. Nothing here can overwrite or weaken a geofenced check-in.
   *
   * The written row is permanently distinguishable from a proved one, carrying
   * who vouched for it and when. Every count downstream — the tiles, the
   * dashboard, the monthly figures, the CSV — reads rows, so this reaches all of
   * them without a single one of them being touched.
   */
  async markPresentFor(actor: PopulationActor, input: MarkEmployeePresentInput): Promise<MarkResult> {
    if (!(await mayMarkAttendance(actor))) {
      throw new ForbiddenError(
        actor.role === "ADMIN"
          ? "You do not have permission to record attendance. Ask your super administrator to enable it."
          : "Only administrators can record attendance for somebody else.",
      );
    }

    // The whole judgement, from the one place that makes it. `buildRoster`
    // filters to active accounts, so an unknown or suspended id simply is not
    // here — reported as not found, matching how the account endpoints phrase a
    // refusal they do not want used to probe for ids.
    //
    // The account is read alongside it purely for its `role`, which the roster
    // deliberately does not carry.
    const [{ entries }, target] = await Promise.all([
      buildRoster(input.date, { employeeId: input.employeeId }),
      employeeRepository.findById(input.employeeId),
    ]);

    const entry = entries[0];

    if (!entry || !target) throw new NotFoundError("That person is not on the roster.");

    // Seniority before anything about the day. Whether this administrator may
    // act on this person at all is a question about the two of them, and does
    // not depend on what the calendar says.
    assertMayCorrect(actor, target);

    // Already present, by whichever route. Answered idempotently with the row
    // that is there, exactly as a second tap on `markPresent` is: "they are
    // already marked present" is the answer to what was asked, not a failure.
    if (entry.status === "PRESENT" && entry.attendance) {
      return { attendance: entry.attendance, alreadyMarked: true };
    }

    const refusal = refusalFor(entry.status, input.date);
    if (refusal) throw new ConflictError(refusal);

    const policy = await attendancePolicyService.get();

    // **The window, judged on the server's own clock and nothing else.**
    //
    // This is the whole of the authorisation: the countdown on the screen is a
    // courtesy, and a request arriving from a stale tab, a hand-written `curl`
    // or a browser whose clock has been wound back is refused here regardless of
    // what any of them believed. `hrMarkWindowExpiresAt` derives the deadline
    // from the *date's* cutoff, so there is no session, no timer and no stored
    // expiry to go stale — the same answer comes back however the question
    // arrives.
    //
    // The super admin is exempt, deliberately. The grant is what is being
    // time-boxed; somebody has to stay able to correct a record found wrong next
    // month, or this column would have removed the only means of fixing the
    // register with nothing put in its place. `assertMayCorrect` above still
    // binds both, so the owner gains no reach over accounts they did not have.
    if (
      !isSuperAdminRole(actor.role) &&
      !isWithinHrMarkWindow(input.date, policy.cutoffMinutes, policy.hrMarkWindowMinutes)
    ) {
      const expiredAt = hrMarkWindowExpiresAt(input.date, policy.cutoffMinutes, policy.hrMarkWindowMinutes);

      // The zero case gets its own clause rather than being fed through
      // `describeHrMarkWindow`, which returns a phrase ("no time past the
      // cutoff") that reads as nonsense once "after the … cutoff" is appended
      // to it. Both halves name the configured numbers, because the two ways to
      // arrive here are a genuinely late request and a window set shorter than
      // anybody realised.
      const rule =
        policy.hrMarkWindowMinutes === 0
          ? `No time is allowed past the ${friendlyTimeLabel(policy.cutoffMinutes)} cutoff.`
          : `It runs for ${describeHrMarkWindow(policy.hrMarkWindowMinutes)} after the ${friendlyTimeLabel(policy.cutoffMinutes)} cutoff.`;

      throw new ForbiddenError(
        `The window for recording attendance on ${toIsoDate(input.date)} closed at ${formatDateTime(expiredAt)}. ${rule} Ask the super administrator, who is not bound by it.`,
      );
    }

    // The arrival time is paired with the chosen date on the company's clock,
    // never on the server's — a UTC server would otherwise read "17:15" as an
    // instant five hours off, and every lateness figure downstream with it.
    const [hour, minute] = input.arrivalTime.split(":").map(Number);
    const arrivalMinutes = hour * 60 + minute;
    const checkInAt = appZoneInstant(input.date, hour, minute);

    // An arrival still in the future is not a correction of anything. It is the
    // easiest mistake to make on today's date — picking a time later this
    // evening — and it would record somebody as having already been somewhere
    // they have not yet been.
    if (checkInAt.getTime() > Date.now()) {
      throw new ValidationError("That arrival time is still in the future.", {
        arrivalTime: "Enter the time they actually arrived.",
      });
    }

    // Nobody can have arrived at an office that had shut. Applied to a typed
    // time and never to a geofenced check-in — see `isAfterClosing` for why the
    // two are treated differently. Both times are named in the message, because
    // the two ways to be here are a mistyped arrival and office hours that have
    // moved, and the administrator is the only one who can tell which.
    if (isAfterClosing(arrivalMinutes, policy.closingMinutes)) {
      throw new ValidationError(
        `The office closes at ${friendlyTimeLabel(policy.closingMinutes)}, so nobody can have arrived at ${friendlyTimeLabel(arrivalMinutes)}.`,
        {
          arrivalTime: `Enter a time at or before ${friendlyTimeLabel(policy.closingMinutes)}, or update the office hours if they have changed.`,
        },
      );
    }

    const attendance = await attendanceRepository.createManual({
      employeeId: input.employeeId,
      date: input.date,
      checkInAt,
      // Frozen onto the row, so moving the deadline later never rewrites how
      // late this day was. See `Attendance.lateBasisMinutes`.
      lateBasisMinutes: policy.cutoffMinutes,
      markedById: actor.id,
      reason: input.reason,
    });

    // Null means the unique index refused it: a real check-in landed between the
    // roster read and this write. That row wins — it is proof, and this is not.
    if (!attendance) {
      const winner = await attendanceRepository.findByEmployeeAndDate(input.employeeId, input.date);
      if (winner) return { attendance: winner, alreadyMarked: true };

      throw new ConflictError("Couldn't record that attendance. Please try again.");
    }

    return { attendance, alreadyMarked: false };
  },

  mayEditHistoricalAttendance,

  /**
   * Whether this administrator could edit a past day **of this person's** — the
   * grant and the seniority rule together, as one boolean a screen can render
   * from.
   *
   * It exists so no route has to restate `assertMayCorrect`. The grant alone is
   * not the answer: a granted administrator still may not edit their own days,
   * and nobody may edit the owner's, so a screen drawn from
   * `mayEditHistoricalAttendance` by itself would offer a control the service
   * then refuses — which reads as the feature being broken rather than as a
   * boundary being kept. `mayCorrect` is the same predicate `assertMayCorrect`
   * throws on, called here rather than copied, so the two cannot drift.
   *
   * A **courtesy**, exactly as `canMarkAttendance` and `canIssue` are.
   * `editHistoricalDay` asks all of this again against the row, and refuses
   * today's date whatever this said.
   */
  async mayEditHistoricalDayFor(
    actor: PopulationActor,
    target: { id: string; role: Role },
  ): Promise<boolean> {
    return mayCorrect(actor, target) && (await mayEditHistoricalAttendance(actor));
  },

  /**
   * Grants or withdraws the right to correct days that have already gone. The
   * super admin's alone, gated in the route that calls it.
   */
  setHistoricalEditPermission(adminId: string, allowed: boolean) {
    return employeeRepository.setHistoricalAttendancePermission(adminId, allowed);
  },

  /**
   * Moves a **past** day between `PRESENT`, `ABSENT` and `ON_LEAVE`.
   *
   * The correction feature `markPresentFor` could not be: that one is a grace
   * period, bounded by `hrMarkWindowMinutes` and travelling in one direction
   * only, for somebody whose phone failed this afternoon. This is the register
   * being put right weeks later, in whichever direction it is wrong.
   *
   * Four things keep it from being a hole in everything above it:
   *
   * - **It is its own grant.** `canEditHistoricalAttendance`, read from the row,
   *   deliberately not `canMarkAttendance` — deleting a check-in the geofence
   *   proved is a different power from writing one it missed.
   * - **It judges the day by building the roster**, never by asking its own
   *   questions, exactly as `markPresentFor` does. Closures, the working week,
   *   remote periods, the future and `NO_RECORD` all reach here already settled
   *   by `describeDay`, so this screen cannot come to disagree with the one
   *   beside it. A hand-written "is this a working day" check here would be the
   *   second opinion, and the second opinion is the one that rots.
   * - **It only ever touches today's past.** `isHistoricalDate` refuses today
   *   and everything after it, so the live check-in flow, the warning sweep and
   *   the hr-mark window are all untouched by this existing.
   * - **Every successful move writes an audit row**, and the statuses on it are
   *   the ones the roster actually reported — not what the client claimed, since
   *   the schema has no field for that.
   *
   * Nothing here is a status update, because there is no status column to
   * update: `AttendanceStatus` has one value and absence is the lack of a row.
   * Every transition is therefore a create or a delete, which is what
   * `planAttendanceEdit` turns the pair into.
   */
  async editHistoricalDay(
    actor: PopulationActor,
    input: AttendanceEditInput,
  ): Promise<AttendanceEditResult> {
    if (!(await mayEditHistoricalAttendance(actor))) {
      throw new ForbiddenError(
        actor.role === "ADMIN"
          ? "You do not have permission to edit past attendance. Ask your super administrator to enable it."
          : "Only administrators can edit attendance records.",
      );
    }

    // Refused before anything is read. Today has an editor already — the
    // hr-mark window — and reaching it from here would hand the same people an
    // unbounded version of that permission by a second door.
    if (!isHistoricalDate(input.date, todayUtc())) {
      throw new ValidationError("Only days that have already finished can be edited here.", {
        date: `${toIsoDate(input.date)} is not in the past. Today's attendance is corrected from the roster while the marking window is open.`,
      });
    }

    // The whole judgement, from the one place that makes it — and the account
    // alongside it purely for its `role`, which the roster does not carry.
    const [{ entries }, target] = await Promise.all([
      buildRoster(input.date, { employeeId: input.employeeId }),
      employeeRepository.findById(input.employeeId),
    ]);

    const entry = entries[0];

    if (!entry || !target) throw new NotFoundError("That person is not on the roster.");

    // Seniority before anything about the day, and the same rule attendance
    // corrections already use: a granted administrator reaches employees and
    // administrators alike, nobody edits their own day, nobody edits the owner's.
    assertMayCorrect(actor, target);

    const from = entry.status;

    // The calendar's own statuses, refused in the roster's words. `refusalFor`
    // covers CLOSED, NON_WORKING, REMOTE, UPCOMING and NO_RECORD; the only
    // statuses it passes are exactly the three that are editable, so this cannot
    // fall out of step with `EDITABLE_DAY_STATUSES` without failing loudly.
    if (!isEditableDayStatus(from)) {
      throw new ConflictError(
        refusalFor(from, input.date) ?? `${toIsoDate(input.date)} cannot be edited.`,
      );
    }

    const plan = planAttendanceEdit(from, input.status);

    // A move to the status the day already holds. Refused rather than waved
    // through as a success, so a double-click cannot write a second audit row
    // recording a change that changed nothing.
    if (isNoOp(plan)) {
      throw new ConflictError(
        `${entry.employee.name} already reads as ${dayStatusLabel(from).toLowerCase()} on ${toIsoDate(input.date)}.`,
      );
    }

    const policy = await attendancePolicyService.get();

    // **Every refusal happens before the first write.** These three deletes and
    // creates span two tables, and the layering keeps `prisma` in the
    // repositories, so there is no transaction to roll one back — the same
    // constraint the reset documents. What stands in for it is checking
    // everything first: a request that is going to be refused is refused while
    // the record is still exactly as it was found.
    //
    // The allowance is the one that bit. It used to be asked inside
    // `bookCorrectedLeave`, which runs *after* the check-in is removed, so a
    // `PRESENT → ON_LEAVE` over the monthly limit deleted the check-in, threw,
    // and left the day reading ABSENT with no audit row to explain it.
    if (plan.needsLeave) await assertLeaveAllowance(input.employeeId, input.date);

    // Removals first, so nothing races its own replacement: `describeDay` reads
    // a check-in above leave, and writing the new fact before clearing the old
    // one would leave a moment where the day held both.
    if (plan.removesCheckIn) {
      await attendanceRepository.deleteForEmployeeOnDate(input.employeeId, input.date);
    }

    if (plan.removesLeave) {
      await leaveRepository.deleteForEmployeeOnDate(input.employeeId, input.date);
    }

    if (plan.needsLeave) {
      await bookCorrectedLeave(input.employeeId, input.date);
    }

    if (plan.needsCheckIn) {
      await attendanceRepository.createManual({
        employeeId: input.employeeId,
        date: input.date,
        // **The day's own cutoff, not the moment somebody pressed the button.**
        //
        // There is no arrival time to ask for — that is the whole of the
        // one-click requirement — so this is the only honest instant available.
        // `now()` was the defect `markEmployeePresentSchema` documents, and on a
        // day three weeks gone it is worse than arbitrary: it would record an
        // arrival at whatever o'clock the correction happened to be made.
        //
        // The cutoff pairs with `lateBasisMinutes` below to mean exactly "here,
        // and not late", which is the minimum claim a correction makes and the
        // only one it has evidence for. Lateness is a separate accusation and
        // this feature does not have the information to make it — an
        // administrator who does knows the arrival time and has the roster's own
        // dialog to enter it in.
        checkInAt: cutoffInstant(input.date, policy.cutoffMinutes),
        lateBasisMinutes: policy.cutoffMinutes,
        markedById: actor.id,
        reason: null,
      });
    }

    // Written after the tables have moved, so a failure above leaves no audit
    // row claiming something that did not happen. The reverse ordering — claim
    // first, as the holiday and complaint notices do — is right when the risk is
    // a *duplicate side effect* nothing can recall, like an email. Here the risk
    // is a false record, and nothing this writes leaves the building.
    const record = await attendanceEditRepository.record({
      employeeId: input.employeeId,
      date: input.date,
      previousStatus: from,
      newStatus: input.status,
      // Null rather than an empty string when nothing was said, so the log can
      // tell a correction nobody explained from one explained with a blank.
      note: input.note ?? null,
      editedById: actor.id,
      // Frozen by value: an administrator later promoted must not have every
      // past act of theirs retitled. Same argument as `consecutiveMissed`.
      editorRole: actor.role,
    });

    // Re-read through the roster rather than assumed, so what comes back is what
    // the next page load will show. If some other fact about the day moved
    // underneath this — a closure declared mid-request — the caller is told the
    // truth rather than the intention.
    const [after] = (await buildRoster(input.date, { employeeId: input.employeeId })).entries;

    return {
      status: after?.status ?? input.status,
      attendance: after?.attendance ?? null,
      previousStatus: from,
      record,
    };
  },

  /**
   * The attendance change log.
   *
   * **Gated in the route, not here**, and gated on the super admin alone — the
   * looser-guard-with-the-real-check-behind-it split every other admin surface
   * uses, inverted, because this one has no delegable half. Reading who changed
   * what for whom is oversight of the administrators, which is the owner's job
   * and nobody else's; an administrator able to audit the audit would be the
   * boundary running backwards.
   */
  listEdits(query: AttendanceEditQuery) {
    return attendanceEditRepository.list(query);
  },

  /** One person's corrections, newest first — for their profile and report. */
  editsForEmployee(employeeId: string, take = 20) {
    return attendanceEditRepository.listForEmployee(employeeId, take);
  },

  /** Where one person stands today — what the attendance screen opens on. */
  async todayFor(employeeId: string): Promise<TodayState> {
    const date = todayUtc();

    const [attendance, officeClosed, onLeaveIds, remoteAssignment, checkIns, policy] = await Promise.all([
      attendanceRepository.findByEmployeeAndDate(employeeId, date),
      officeClosedOn(date),
      leaveRepository.employeeIdsOnApprovedLeave(date),
      remoteWorkRepository.findCoveringDay(employeeId, date),
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
      isRemote: remoteAssignment !== null,
      isFuture: false,
      holdsRecord: dayHoldsRecord(checkIns, onLeaveIds.length),
      // Always false, and it costs a query to prove otherwise. Today cannot
      // precede the creation of an account that is signed in and asking, so the
      // boundary has nothing to say here — passed explicitly rather than left
      // to a default, so `describeDay` keeps every caller stating every fact.
      beforeEmployment: false,
    });

    // The same function `markPresent` refuses with, rather than a ternary of its
    // own. It used to be one, and it did not mention the working week at all —
    // so the card offered a button on a Saturday and the endpoint accepted it.
    // One rule read by both is what stops the screen and the server describing
    // one morning differently.
    const refusal = selfCheckInRefusal({ officeClosed, isWorkingDay, onLeave });
    const blockedReason = attendance ? null : refusal;

    return {
      date,
      attendance,
      status,
      // **A day outside the working week is blocked, and this note used to say
      // the opposite.** The old rule let anybody record a Saturday on the
      // reasoning that the week decides who is *expected* rather than who is
      // *permitted*. Every other surface here had already answered that the
      // other way — `describeDay` calls the day `NON_WORKING`, `refusalFor`
      // refuses an administrator recording it, `editHistoricalDay` refuses it,
      // and no report counts it — so the check-in button was the one door onto a
      // day the rest of the system says holds no attendance. See
      // `src/lib/self-check-in.ts`.
      //
      // **A remote day is still not blocked, and the distinction survives.**
      // Remote genuinely does decide who is expected rather than who is
      // permitted: it is an arrangement about a person on an ordinary working
      // day, not a statement that the day is not one. Somebody arranged to work
      // from home who nonetheless walks into the office was there, the geofence
      // can prove it, and refusing them would have the system calling a fact it
      // could verify a mistake. The check-in then outranks the remote status in
      // `describeDay` and the day reads PRESENT, which is true. What it never
      // becomes is a requirement — nothing chases them for skipping it, and
      // `remote` below is what lets the card say so instead of showing a bare
      // button.
      canMark: !attendance && refusal === null,
      blockedReason,
      cutoffMinutes: policy.cutoffMinutes,
      isWorkingDay,
      remote: remoteAssignment
        ? {
            periodLabel: describeRemotePeriod(remoteAssignment),
            reason: remoteAssignment.reason,
            permanent: remoteAssignment.endDate === null,
          }
        : null,
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
    actor: PopulationActor,
  ): Promise<{
    date: Date;
    officeClosed: boolean;
    isWorkingDay: boolean;
    items: RosterEntry[];
    total: number;
    summary: AttendanceSummary;
  }> {
    // The whole actor rather than its role: the population filter is a delegable
    // grant read from the row, so the id is what settles it. See
    // `populationService.assertMayFilter` — the CSV export reaches it through
    // this same call, which is why it is not asserted in either route.
    await populationService.assertMayFilter(actor, query.population);

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

    // `LATE` narrows within PRESENT rather than matching a day status, because
    // it is not one — see `attendanceRosterQuerySchema`.
    const filtered =
      query.status === "ALL"
        ? entries
        : query.status === "LATE"
          ? entries.filter((e) => lateMinutesOf(e.attendance) > 0)
          : entries.filter((e) => e.status === query.status);
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
   * A thin call through `historiesFor` rather than a query of its own, so a
   * single person and a hundred of them are decided by one piece of code. The
   * `in [id]` this produces costs nothing over the equality it replaced, and the
   * alternative — two implementations of the same day walk — is the shape that
   * lets the assistant and the report come to describe one date differently.
   */
  async historyFor(employeeId: string, from: Date, to: Date): Promise<DayRecord[]> {
    const histories = await buildHistories([employeeId], from, to);
    return histories.get(employeeId) ?? [];
  },

  /**
   * Several people's day-by-day histories across a range, in one set of queries.
   *
   * The stretched form of `rosterEntries` in both directions: that one is
   * everybody on one day, `historyFor` was one person across many days, and this
   * is the rectangle. It exists so a month's report for the whole company is six
   * bulk queries rather than `buildRoster` called thirty-one times — and, far
   * more importantly, so every one of those cells is still decided by
   * `describeDay`. Absence is computed in exactly the one place it always was;
   * what changed is how the facts it needs are fetched, never the rule.
   *
   * `holdsRecord` is asked **company-wide per day**, which is why the two grouped
   * date queries are not scoped to the people being asked about: whether a day
   * was one the system was watching is a fact about the day, not about them.
   * Narrowing it to the selection would turn a report on one department that
   * happened to be away into a day on which nothing had happened.
   */
  historiesFor(employeeIds: string[], from: Date, to: Date): Promise<Map<string, DayRecord[]>> {
    return buildHistories(employeeIds, from, to);
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

    // Counted through the *same* `resetScope` the delete is driven by, rather than
    // by rebuilding the bound beside it. The number in this dialog is a promise
    // about what the next call will remove, and two expressions of one rule is
    // how the promise comes to be broken — a bounded delete beside an unbounded
    // count is exactly the shape that offered to clear future leave.
    const scope = resetScope(query.range, date ?? undefined);
    const countIn = <T>(on: (d: Date) => T, upTo: (d: Date) => T): T =>
      "on" in scope ? on(scope.on) : upTo(scope.upTo);

    const [count, leaveCount, warningCount, warningsForToday, warning] = await Promise.all([
      !tables.attendance
        ? null
        : countIn(attendanceRepository.countOnDate, attendanceRepository.countUpTo),
      !tables.leaves ? null : countIn(leaveRepository.countOnDate, leaveRepository.countUpTo),
      !tables.warnings
        ? null
        : countIn(attendanceWarningRepository.countOnDate, attendanceWarningRepository.countUpTo),
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
    const scope = resetScope(input.range, input.range === "DATE" ? input.date : undefined);

    const [removed, removedLeaves, removedWarnings] = await Promise.all([
      tables.attendance ? attendanceRepository.deleteMany(scope) : 0,
      tables.leaves ? leaveRepository.deleteMany(scope) : 0,
      tables.warnings ? attendanceWarningRepository.deleteMany(scope) : 0,
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
