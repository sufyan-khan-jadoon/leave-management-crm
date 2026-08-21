/**
 * What a historical day may be moved to, and what moving it actually costs.
 *
 * Free of Prisma and of the database so the rules can be read — and tested — on
 * their own, exactly as `geo.ts`, `working-days.ts`, `lateness.ts` and
 * `holiday-notice.ts` are. `attendance.service.ts` decides what to do with the
 * answers; nothing here reads a row or writes one.
 */
import type { AttendanceDayStatus } from "@/types";

/**
 * The three statuses a day can be moved **between**.
 *
 * Deliberately a subset of `AttendanceDayStatus` rather than all of it, and each
 * exclusion is a rule this codebase already states somewhere else:
 *
 * - `CLOSED` and `NON_WORKING` are facts about the *calendar*, not about a
 *   person. A day the office was shut costs nobody a leave and accuses nobody,
 *   and asserting attendance on it would be one date with two accounts of
 *   itself. Withdraw the closure and the day comes back on its own.
 * - `REMOTE` is attendance-exempt by construction. There is no wrong record to
 *   correct — shorten or revoke the period instead.
 * - `UPCOMING` has not happened. This feature corrects history.
 * - `NO_RECORD` is the admission that the system was not watching. Writing one
 *   row into such a day would flip every colleague to `ABSENT` in a single act.
 *
 * All five are refused as *sources* as well as targets, so the editing control
 * never appears on a day whose meaning belongs to the calendar rather than to
 * the person.
 */
export const EDITABLE_DAY_STATUSES = ["PRESENT", "ABSENT", "ON_LEAVE"] as const;

export type EditableDayStatus = (typeof EDITABLE_DAY_STATUSES)[number];

export function isEditableDayStatus(status: AttendanceDayStatus): status is EditableDayStatus {
  return (EDITABLE_DAY_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether a date is genuinely in the past on the company's calendar.
 *
 * **Strictly before today, and the strictness is the whole separation of
 * concerns.** Today already has an editor: `markPresentFor`, bounded by
 * `hrMarkWindowMinutes`, which exists so a delegated administrator can fix an
 * afternoon's check-in and *stops* being able to once the grace period runs out.
 * If historical editing reached today it would hand the same people an
 * unbounded version of that permission by another door, and the window would
 * mean nothing.
 *
 * Both dates are UTC-midnight calendar days derived from `APP_TIME_ZONE`, never
 * from the server's clock — `todayUtc()` is what the caller passes in.
 */
export function isHistoricalDate(date: Date, today: Date): boolean {
  return date.getTime() < today.getTime();
}

/**
 * What has to happen to the tables for a day to read as `to` instead of `from`.
 *
 * Expressed as two independent intentions rather than a branch per pair, because
 * the statuses are derived: `describeDay` reads a check-in first and approved
 * leave third, so "make the day read PRESENT" is always "there must be a
 * check-in, and there must not be leave in the way". Nine ordered pairs collapse
 * to two booleans, and a tenth status added later cannot leave a combination
 * silently unhandled.
 *
 * Note what falls out for free: `ON_LEAVE → PRESENT` clears the leave *and*
 * writes the check-in, so the day stops costing the employee a day of their
 * allowance — which is right, because they worked it.
 */
export type AttendanceEditPlan = {
  /** Write a check-in for the day, if one is not already there. */
  needsCheckIn: boolean;
  /** Remove the check-in, if one is there. */
  removesCheckIn: boolean;
  /** Write approved leave for the day. */
  needsLeave: boolean;
  /** Remove any approved leave standing on the day. */
  removesLeave: boolean;
};

export function planAttendanceEdit(
  from: EditableDayStatus,
  to: EditableDayStatus,
): AttendanceEditPlan {
  return {
    needsCheckIn: to === "PRESENT" && from !== "PRESENT",
    removesCheckIn: to !== "PRESENT" && from === "PRESENT",
    needsLeave: to === "ON_LEAVE" && from !== "ON_LEAVE",
    removesLeave: to !== "ON_LEAVE" && from === "ON_LEAVE",
  };
}

/**
 * Whether a plan would actually touch anything.
 *
 * A move to the status a day already holds is refused rather than treated as a
 * success, mirroring `complaint-status.ts` refusing the no-op: it is what stops
 * a double-clicked button writing a second audit row saying a day went from
 * `PRESENT` to `PRESENT`. An audit full of changes that changed nothing is an
 * audit nobody reads.
 */
export function isNoOp(plan: AttendanceEditPlan): boolean {
  return !plan.needsCheckIn && !plan.removesCheckIn && !plan.needsLeave && !plan.removesLeave;
}
