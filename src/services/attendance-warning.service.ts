import { Role } from "@prisma/client";

import {
  countConsecutiveMissed,
  hasCutoffPassed,
  isWorkingWeekday,
  type DayVerdict,
} from "@/lib/attendance-policy";
import { addUtcDays, todayUtc, toIsoDate } from "@/lib/date";
import { attendanceRepository } from "@/repositories/attendance.repository";
import { attendanceWarningRepository } from "@/repositories/attendance-warning.repository";
import { employeeRepository } from "@/repositories/employee.repository";
import { holidayRepository } from "@/repositories/holiday.repository";
import { leaveRepository } from "@/repositories/leave.repository";
import { attendancePolicyService } from "@/services/attendance-policy.service";
import { attendanceService } from "@/services/attendance.service";
import { emailService } from "@/services/email/email.service";

/**
 * How far back a run of missed days is counted.
 *
 * A cap rather than "since they joined": the number in the letter is meant to
 * describe a current pattern, and one query over a fixed window keeps the sweep
 * a handful of round trips whatever the history behind it.
 */
const LOOKBACK_DAYS = 45;

/**
 * Who a warning letter is ever addressed to.
 *
 * The super admin is deliberately absent. They are held to the attendance rules
 * like anyone — they still read as absent on the roster — but an automated
 * letter telling the owner of the system to explain themselves has nobody behind
 * it, and there is no one senior to act on it.
 */
const WARNABLE_ROLES: Role[] = [Role.EMPLOYEE, Role.ADMIN];

export type WarningSweep = {
  /** Why a sweep did nothing, when it did nothing. */
  outcome: "sent" | "disabled" | "not-a-working-day" | "office-closed" | "before-cutoff";
  date: string;
  considered: number;
  warned: number;
  /** Rows another sweep had already claimed by the time we reached them. */
  claimedElsewhere: number;
  failed: number;
};

/**
 * Warns everybody who did not turn up today, once the day's deadline has gone.
 *
 * Safe to run as often as you like and safe to run twice at once: each person's
 * letter is claimed before it is written, so repeats find nothing left to claim.
 * That is what makes the cron frequency a knob rather than a correctness
 * question — daily today, hourly if the plan ever allows it, same behaviour.
 */
export async function dispatchAttendanceWarnings(now: Date = new Date()): Promise<WarningSweep> {
  const date = todayUtc();
  const base: Omit<WarningSweep, "outcome"> = {
    date: toIsoDate(date),
    considered: 0,
    warned: 0,
    claimedElsewhere: 0,
    failed: 0,
  };

  const policy = await attendancePolicyService.get();

  if (!policy.warningsEnabled) return { ...base, outcome: "disabled" };

  // The ordinary week comes first: on a Sunday nobody was expected, so there is
  // no deadline to have missed and nothing to count.
  if (!isWorkingWeekday(date, policy.workingDays)) return { ...base, outcome: "not-a-working-day" };

  // Then the declared closure, which outranks the ordinary week. Asked before
  // anything decides who was absent, exactly as marking attendance does.
  const closedToday = await holidayRepository.closedDatesAmong([date]);
  if (closedToday.length > 0) return { ...base, outcome: "office-closed" };

  // Then the clock. A sweep that fires early does nothing rather than warning
  // people who still have hours left to arrive.
  if (!hasCutoffPassed(date, policy.cutoffMinutes, now)) return { ...base, outcome: "before-cutoff" };

  // Reuses the roster the admin screen reads, so "absent" cannot mean one thing
  // on the screen and another in somebody's inbox. It already excludes anyone
  // present, on approved leave, or covered by a closure.
  const { entries } = await attendanceService.rosterEntries(date, { roles: WARNABLE_ROLES });
  const absentees = entries.filter((entry) => entry.status === "ABSENT");

  const alreadyWarned = new Set(await attendanceWarningRepository.employeeIdsWarnedOn(date));
  const pending = absentees.filter((entry) => !alreadyWarned.has(entry.employee.id));

  const sweep: WarningSweep = { ...base, outcome: "sent", considered: pending.length };
  if (pending.length === 0) return sweep;

  const streaks = await countStreaks(
    pending.map((entry) => entry.employee.id),
    date,
    policy.workingDays,
  );

  for (const entry of pending) {
    const consecutive = streaks.get(entry.employee.id) ?? 1;

    // The claim is the insert. A loser here means another sweep is already
    // writing this person's letter, so there is nothing left to do about them.
    const claimed = await attendanceWarningRepository.claim(entry.employee.id, date, consecutive);

    if (!claimed) {
      sweep.claimedElsewhere += 1;
      continue;
    }

    const delivered = await emailService.sendAttendanceWarning(entry.employee.email, {
      name: entry.employee.name,
      date,
      cutoffMinutes: policy.cutoffMinutes,
      consecutiveMissed: consecutive,
    });

    if (delivered) {
      await attendanceWarningRepository.markSent(claimed.id);
      sweep.warned += 1;
    } else {
      // The row stays, with `sentAt` null. It is not retried: the claim already
      // says this day was swept, and a retry that cannot tell "never sent" from
      // "sent, logging failed" is how somebody gets warned twice.
      sweep.failed += 1;
    }
  }

  return sweep;
}

/**
 * How many working days in a row each of these people has now missed.
 *
 * Built from three range queries rather than a walk per person per day, then
 * decided in memory by the pure rule in `attendance-policy.ts`. A day the office
 * was shut, a day off the ordinary week, and a day of approved leave all read as
 * `skip` — none of them is a miss, and none of them ends a run either.
 */
async function countStreaks(
  employeeIds: string[],
  date: Date,
  workingDays: number[],
): Promise<Map<string, number>> {
  const earliest = addUtcDays(date, -LOOKBACK_DAYS);

  const [attendance, leaves, closures, joiningDates] = await Promise.all([
    attendanceRepository.listForEmployeesBetween(employeeIds, earliest, date),
    leaveRepository.approvedForEmployeesBetween(employeeIds, earliest, date),
    holidayRepository.closedDatesBetween(earliest, addUtcDays(date, 1)),
    employeeRepository.joiningDatesFor(employeeIds),
  ]);

  const key = (id: string, day: Date) => `${id}|${toIsoDate(day)}`;
  const present = new Set(attendance.map((row) => key(row.employeeId, row.date)));
  const onLeave = new Set(leaves.map((row) => key(row.employeeId, row.leaveDate)));
  const closed = new Set(closures.map((day) => toIsoDate(day)));

  const streaks = new Map<string, number>();

  for (const employeeId of employeeIds) {
    const joined = joiningDates.get(employeeId) ?? null;
    const verdicts: DayVerdict[] = [];

    for (let offset = 0; offset <= LOOKBACK_DAYS; offset += 1) {
      const day = addUtcDays(date, -offset);

      // Nothing before somebody's first day is theirs to have missed.
      if (joined && day.getTime() < joined.getTime()) break;

      if (!isWorkingWeekday(day, workingDays) || closed.has(toIsoDate(day))) {
        verdicts.push("skip");
        continue;
      }

      if (onLeave.has(key(employeeId, day))) {
        verdicts.push("skip");
        continue;
      }

      verdicts.push(present.has(key(employeeId, day)) ? "present" : "missed");
    }

    streaks.set(employeeId, Math.max(1, countConsecutiveMissed(verdicts)));
  }

  return streaks;
}

export const attendanceWarningService = {
  dispatch: dispatchAttendanceWarnings,

  listForEmployee(employeeId: string, take = 20) {
    return attendanceWarningRepository.listForEmployee(employeeId, take);
  },
};
