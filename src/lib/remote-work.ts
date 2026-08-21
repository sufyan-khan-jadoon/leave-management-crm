/**
 * What a remote-work period covers, and what state it is in.
 *
 * Kept free of Prisma so the rules can be read and tested on their own, exactly
 * as `geo.ts`, `working-days.ts`, `lateness.ts` and `holiday-notice.ts` are —
 * `remote-work.service.ts` is what fetches rows and hands them in. Everything
 * here takes "today" as an argument rather than reading a clock, so there is
 * nothing to stub and no way for a test to disagree with production.
 *
 * **Remote is not attendance.** A date inside an active period is
 * attendance-*exempt*: neither present, nor absent, nor leave. That rule lives
 * in `attendance.service.ts` where every other day status is decided; what lives
 * here is the narrower question of which dates a period actually covers.
 */
import { addUtcDays, formatDate, toIsoDate } from "@/lib/date";

/**
 * How a period was asked for.
 *
 * Mirrors the Prisma `RemoteWorkType` as string literals, for the reason
 * `enums.ts` gives: anything Edge-reachable cannot bundle `@prisma/client`, and
 * this file is imported by client components. The `satisfies` in `enums.ts`
 * pins the pairing; here the values are re-stated because a pure module should
 * not have to import a generated client to name a duration.
 */
export const REMOTE_WORK_TYPE = {
  TODAY: "TODAY",
  TOMORROW: "TOMORROW",
  WEEK: "WEEK",
  MONTH: "MONTH",
  CUSTOM: "CUSTOM",
  UNTIL_REVOKED: "UNTIL_REVOKED",
} as const;

export type RemoteWorkTypeValue = (typeof REMOTE_WORK_TYPE)[keyof typeof REMOTE_WORK_TYPE];

export const REMOTE_WORK_TYPE_VALUES = [
  REMOTE_WORK_TYPE.TODAY,
  REMOTE_WORK_TYPE.TOMORROW,
  REMOTE_WORK_TYPE.WEEK,
  REMOTE_WORK_TYPE.MONTH,
  REMOTE_WORK_TYPE.CUSTOM,
  REMOTE_WORK_TYPE.UNTIL_REVOKED,
] as const;

/** The one type that carries no end date. */
export function isOpenEnded(type: RemoteWorkTypeValue): boolean {
  return type === REMOTE_WORK_TYPE.UNTIL_REVOKED;
}

/** The one type an administrator supplies both dates for. */
export function isCustomRange(type: RemoteWorkTypeValue): boolean {
  return type === REMOTE_WORK_TYPE.CUSTOM;
}

/**
 * Where a period has got to.
 *
 * **Derived, never stored.** A column would need something to keep it honest —
 * a period that ended last night would sit at ACTIVE until a sweep ran, and
 * there is no sweep. The same argument `InvitationStatus` makes for having no
 * "expired" value, and `AttendanceStatus` for having no ABSENT.
 *
 * SCHEDULED is here beyond the three the brief named, and it earns its place:
 * "Tomorrow" and a custom range starting next week are assignments that exist
 * and are not yet in force, and calling either of them ACTIVE would be a lie on
 * the screen an administrator reads to find out who is remote *today*.
 */
export type RemoteWorkState = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "REVOKED";

/** The dates a period covers. `endDate` null means until revoked. */
export type RemotePeriod = {
  startDate: Date;
  endDate: Date | null;
};

/** A period along with what became of it, which is what decides its state. */
export type RemoteAssignmentDates = RemotePeriod & {
  revokedAt: Date | null;
};

/**
 * A calendar month added to a date, clamped to the shorter month.
 *
 * `addUtcMonths` in `date.ts` deliberately snaps to the first of the month,
 * which is right for the leave trend and wrong here: "one month from the 31st"
 * has to land on a real date rather than roll into the month after. 31 January
 * plus a month is 28 February (29 in a leap year), which is the reading every
 * calendar application uses and the one somebody choosing "One month" means.
 */
export function addUtcCalendarMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();

  // Day 0 of the *following* month is the last day of the target month, which is
  // how the clamp is computed without a table of month lengths or a leap rule.
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTarget)));
}

/**
 * Turns a chosen duration into the two dates that are actually stored.
 *
 * Done **once**, when the assignment is written, and never re-derived — which is
 * what makes the stored dates the single answer to "which days are exempt". A
 * type re-resolved on every read would quietly move a week-long period forward
 * every day it was looked at.
 *
 * Every option that includes today starts today, on the company's calendar:
 * `today` is what `todayUtc()` returns, so an assignment made at 01:00 in
 * Karachi covers that day and not the one UTC is still on.
 *
 * The spans are inclusive of both ends, which is the reading somebody choosing
 * "One week" means — seven days off, starting now, not seven days after today.
 */
export function resolveRemotePeriod(
  type: RemoteWorkTypeValue,
  today: Date,
  custom?: { startDate: Date; endDate: Date },
): RemotePeriod {
  switch (type) {
    case REMOTE_WORK_TYPE.TODAY:
      return { startDate: today, endDate: today };

    case REMOTE_WORK_TYPE.TOMORROW: {
      const tomorrow = addUtcDays(today, 1);
      return { startDate: tomorrow, endDate: tomorrow };
    }

    // Seven calendar days with today as the first, so it ends on the same
    // weekday it began — Friday to the following Thursday.
    case REMOTE_WORK_TYPE.WEEK:
      return { startDate: today, endDate: addUtcDays(today, 6) };

    // A calendar month rather than thirty days, so "one month from 15 August"
    // ends on 14 September regardless of how long August is.
    case REMOTE_WORK_TYPE.MONTH:
      return { startDate: today, endDate: addUtcDays(addUtcCalendarMonths(today, 1), -1) };

    case REMOTE_WORK_TYPE.CUSTOM:
      // The caller is required to supply both; the schema refuses a CUSTOM
      // request without them, so this fallback exists only to keep the function
      // total rather than as a case anything reaches.
      return custom ? { startDate: custom.startDate, endDate: custom.endDate } : { startDate: today, endDate: today };

    case REMOTE_WORK_TYPE.UNTIL_REVOKED:
      return { startDate: today, endDate: null };
  }
}

/**
 * Whether a period covers one calendar day.
 *
 * **The one coverage predicate**, and every SQL query that asks the same
 * question is written to match it exactly:
 * `startDate <= day AND (endDate IS NULL OR endDate >= day)`.
 *
 * A revoked period is *not* excluded here, deliberately. Revoking writes
 * `endDate` to the day it happened rather than erasing the row, so the days
 * somebody has already worked from home stay exempt and only the future returns
 * to the register. Excluding revoked rows would retroactively mark a fortnight
 * of legitimate remote work as absence — the false record this whole feature
 * exists to prevent.
 */
export function coversDate(period: RemotePeriod, day: Date): boolean {
  if (period.startDate.getTime() > day.getTime()) return false;
  if (period.endDate === null) return true;

  return period.endDate.getTime() >= day.getTime();
}

/**
 * Where a period stands on a given day.
 *
 * Revocation is asked first because it is a fact somebody asserted about the
 * assignment, where the other three are readings of a calendar — the same
 * ordering `describeDay` uses when it puts a check-in above everything derived.
 */
export function remoteWorkState(assignment: RemoteAssignmentDates, today: Date): RemoteWorkState {
  if (assignment.revokedAt) return "REVOKED";
  if (assignment.startDate.getTime() > today.getTime()) return "SCHEDULED";
  if (assignment.endDate && assignment.endDate.getTime() < today.getTime()) return "EXPIRED";

  return "ACTIVE";
}

/** Whether a period is exempting anybody from attendance right now. */
export function isCurrentlyRemote(assignment: RemoteAssignmentDates, today: Date): boolean {
  return remoteWorkState(assignment, today) === "ACTIVE";
}

/**
 * The `endDate` revocation writes.
 *
 * The day it happens, so everything already served stays covered — **except**
 * for a period that has not started, which is closed to an empty range one day
 * before its own start. An instruction that never took effect should cover
 * nothing, and `coversDate` returns false for every day of a range whose end
 * precedes its start, which is exactly what is wanted. That is also why nothing
 * in the database constrains `endDate >= startDate`: the rule belongs to input,
 * and `remote-work.schema.ts` is where it is enforced.
 *
 * An already-shorter end is kept rather than extended — revoking must never make
 * a period cover more days than it did a moment earlier.
 */
export function revocationEndDate(period: RemotePeriod, today: Date): Date {
  if (period.startDate.getTime() > today.getTime()) return addUtcDays(period.startDate, -1);
  if (period.endDate && period.endDate.getTime() < today.getTime()) return period.endDate;

  return today;
}

/**
 * Whether two periods share any day at all.
 *
 * Open ends are treated as reaching forever, which is what makes an
 * "until revoked" assignment collide with everything after its start — the
 * intended behaviour, since somebody permanently remote cannot also be remote
 * for a fortnight.
 *
 * Callers must exclude revoked rows themselves: a period that was called off is
 * not a conflict with a new one, however the dates read. See
 * `remoteWorkRepository.findOverlapping`.
 */
export function periodsOverlap(a: RemotePeriod, b: RemotePeriod): boolean {
  const aEndsBeforeBStarts = a.endDate !== null && a.endDate.getTime() < b.startDate.getTime();
  const bEndsBeforeAStarts = b.endDate !== null && b.endDate.getTime() < a.startDate.getTime();

  return !aEndsBeforeBStarts && !bEndsBeforeAStarts;
}

/**
 * How many calendar days a period holds, or null when it has no end.
 *
 * Calendar days rather than working days, deliberately. A remote period is a
 * statement about a stretch of the calendar — like a closure and unlike leave —
 * so counting it in working days would make the number move when the working
 * week changed. What each of those days *costs* is nothing, which is the point.
 */
export function remoteDayCount(period: RemotePeriod): number | null {
  if (period.endDate === null) return null;

  const days = Math.round((period.endDate.getTime() - period.startDate.getTime()) / 86_400_000) + 1;
  return Math.max(0, days);
}

const TYPE_LABELS: Record<RemoteWorkTypeValue, string> = {
  TODAY: "Today",
  TOMORROW: "Tomorrow",
  WEEK: "One week",
  MONTH: "One month",
  CUSTOM: "Custom range",
  UNTIL_REVOKED: "Until revoked",
};

export function remoteTypeLabel(type: RemoteWorkTypeValue): string {
  return TYPE_LABELS[type] ?? type;
}

const STATE_LABELS: Record<RemoteWorkState, string> = {
  ACTIVE: "Active",
  SCHEDULED: "Scheduled",
  EXPIRED: "Ended",
  REVOKED: "Revoked",
};

/**
 * A state, in the words the screens use.
 *
 * EXPIRED reads "Ended" rather than "Expired", which is the wording an
 * invitation would use: an invitation that expires was never taken up, where a
 * remote period that reaches its end date did exactly what it was asked to.
 */
export function remoteStateLabel(state: RemoteWorkState): string {
  return STATE_LABELS[state] ?? state;
}

/**
 * "21 Aug – 28 Aug 2026", "21 Aug 2026 onwards", or "21 Aug 2026".
 *
 * One phrasing, shared by the management table, the profile section, the
 * employee's own status card and the three emails — a period described one way
 * on screen and another in the letter about it is the same assignment read
 * twice.
 */
export function describeRemotePeriod(period: RemotePeriod): string {
  if (period.endDate === null) return `${formatDate(period.startDate)} onwards, until revoked`;
  if (toIsoDate(period.startDate) === toIsoDate(period.endDate)) return formatDate(period.startDate);

  return `${formatDate(period.startDate)} – ${formatDate(period.endDate)}`;
}
