/**
 * The date presets one person's report is read through.
 *
 * Free of Prisma so it reads and tests alone, exactly as `report-period.ts`
 * beside it does — and it resolves *into* a `ReportPeriod`, which is the point.
 * Nothing downstream learns that a period was described as "this month": the day
 * walk, the summaries, the calendar and the three exports all ask about an
 * inclusive `from`/`to` pair, and this is the one place a preset becomes one.
 *
 * **A preset carries no dates, and that is deliberate.** The browser sends the
 * word; the server works out what it means against the company's calendar day.
 * A client a timezone away — or one whose clock is a day out — would otherwise
 * post "this month" as its own idea of the month and get a report starting
 * yesterday. It is the same argument `remote-work.schema.ts` makes for refusing
 * a fixed duration that arrives carrying its own dates, and the schema refuses
 * this the same way rather than ignoring the extra fields.
 *
 * `CUSTOM` is the exception that proves it: two dates somebody typed *are* the
 * instruction, so they travel, and `reportRequestSchema`'s own bounds apply.
 */
import { addUtcDays } from "@/lib/date";
import type { ReportPeriod } from "@/lib/report-period";

/**
 * The ranges the screen offers.
 *
 * `THIS_YEAR` is the longest and still fits `MAX_REPORT_RANGE_DAYS` — 366 is a
 * leap year exactly, which is why that bound was chosen at 366 rather than 365
 * and why nothing here needs to clamp.
 */
export const EMPLOYEE_REPORT_RANGES = [
  "TODAY",
  "THIS_WEEK",
  "THIS_MONTH",
  "PREVIOUS_MONTH",
  "THIS_YEAR",
  "CUSTOM",
] as const;

export type EmployeeReportRange = (typeof EMPLOYEE_REPORT_RANGES)[number];

/** Every range but the one somebody types the dates for themselves. */
export type EmployeeReportPreset = Exclude<EmployeeReportRange, "CUSTOM">;

export const EMPLOYEE_REPORT_RANGE_LABELS: Record<EmployeeReportRange, string> = {
  TODAY: "Today",
  THIS_WEEK: "This week",
  THIS_MONTH: "This month",
  PREVIOUS_MONTH: "Previous month",
  THIS_YEAR: "This year",
  CUSTOM: "Custom range",
};

/**
 * The first day of the calendar week `day` falls in — **Monday**.
 *
 * Deliberately *not* the first day of the configured working week. Those are
 * different questions: `AttendancePolicy.workingDays` says which days are
 * worked, and a company resting Friday and Sunday has no "first" day in any
 * useful sense. More to the point, a week that started wherever the policy
 * happened to point would silently re-cut every past report the moment somebody
 * changed the working week — the same trap "the working week is not applied
 * backwards" describes for leave. Monday is the ISO convention and the one the
 * `en-GB` formatting everywhere else in this app already assumes.
 *
 * Which days inside that week are worked is still entirely the policy's
 * business: they come back from `describeDay` as `NON_WORKING` and cost nobody
 * anything, exactly as they do on every other screen.
 */
function startOfIsoWeek(day: Date): Date {
  // getUTCDay is 0 for Sunday; shifting by six makes Monday the zero.
  return addUtcDays(day, -((day.getUTCDay() + 6) % 7));
}

/**
 * A preset, resolved against the day it is being asked on.
 *
 * `today` is passed in rather than read from the clock so this can be driven
 * across month, year and leap boundaries without waiting for one — the same
 * shape `holiday-notice.ts` and `remote-work.ts` take. Callers pass
 * `todayUtc()`, which is the company's calendar day rather than the server's.
 *
 * The `kind` each preset resolves to is chosen so `describeReportPeriod` words
 * it correctly for free: a month reads as "August 2026", a single day reads as
 * that day, and the two that are neither read as a range.
 */
export function resolveEmployeeReportPreset(preset: EmployeeReportPreset, today: Date): ReportPeriod {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  switch (preset) {
    case "TODAY":
      return { kind: "DAILY", from: today, to: today };

    case "THIS_WEEK": {
      const from = startOfIsoWeek(today);
      return { kind: "CUSTOM", from, to: addUtcDays(from, 6) };
    }

    case "THIS_MONTH":
      return {
        kind: "MONTHLY",
        from: new Date(Date.UTC(year, month, 1)),
        // Day zero of the next month is the last day of this one.
        to: new Date(Date.UTC(year, month + 1, 0)),
      };

    case "PREVIOUS_MONTH":
      // `Date.UTC` normalises a month of -1 into December of the year before, so
      // January needs no special case.
      return {
        kind: "MONTHLY",
        from: new Date(Date.UTC(year, month - 1, 1)),
        to: new Date(Date.UTC(year, month, 0)),
      };

    case "THIS_YEAR":
      return {
        kind: "CUSTOM",
        from: new Date(Date.UTC(year, 0, 1)),
        to: new Date(Date.UTC(year, 11, 31)),
      };
  }
}
