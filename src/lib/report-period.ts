/**
 * What stretch of calendar a report covers.
 *
 * Kept free of Prisma so the rules can be read and tested on their own, exactly
 * as `geo.ts`, `lateness.ts`, `working-days.ts` and `holiday-notice.ts` are —
 * `report.service.ts` is what fetches records for the range this produces.
 *
 * Three shapes reduce to **one inclusive `from`/`to` pair**, and that reduction
 * is the whole point of the file: everything downstream — the day walk, the
 * summaries, the CSV — asks about a range and never about which of the three
 * ways somebody described it. A month is not a special case with its own
 * queries, it is a pair of dates worked out here.
 *
 * Both ends are **inclusive**, matching `calendarDaysBetween` and
 * `attendanceService.historiesFor`, which the report drives. Half-open bounds
 * are used elsewhere in this codebase for *month* arithmetic
 * (`endOfUtcMonth`), and mixing the two conventions in one calculation is how a
 * report comes to be a day short at one end.
 */
import { addUtcDays, toIsoDate } from "@/lib/date";

/** How the period was described. Kept on the resolved value so a report can say. */
export type ReportPeriodKind = "MONTHLY" | "CUSTOM" | "DAILY";

export type ReportPeriod = {
  kind: ReportPeriodKind;
  /** Inclusive first calendar day, at UTC midnight. */
  from: Date;
  /** Inclusive last calendar day, at UTC midnight. */
  to: Date;
};

/**
 * The longest range one report may cover.
 *
 * A bound rather than a policy about history: the report expands to one row per
 * person per day and holds the whole set in memory to summarise it, so the
 * product of people and days is what has to stay sane. A year and a day is
 * generous for anything an administrator actually reads, and refusing beyond it
 * is a sentence somebody can act on rather than a request that times out.
 */
export const MAX_REPORT_RANGE_DAYS = 366;

/** Months as the picker offers them: 1 = January, 12 = December. */
export const MIN_MONTH = 1;
export const MAX_MONTH = 12;

/**
 * The earliest year worth offering. Nothing enforces it beyond the picker and
 * the schema — a range is bounded by its length, not by where it starts.
 */
export const MIN_REPORT_YEAR = 2000;
export const MAX_REPORT_YEAR = 2100;

/**
 * The first and last calendar day of a month.
 *
 * `Date.UTC(year, month, 0)` is the last day of `month` when months are counted
 * from one, because day zero of the following month is the day before it. That
 * is deliberately not `endOfUtcMonth`, which is the *exclusive* start of the
 * next month: this pair is inclusive at both ends like every other range here.
 */
export function monthlyRange(year: number, month: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 0)),
  };
}

/** How many calendar days an inclusive range holds. Zero for a backwards one. */
export function rangeLengthInDays(from: Date, to: Date): number {
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return Math.max(0, days);
}

/** Whether a range is the right way round and short enough to report on. */
export function isReportableRange(from: Date, to: Date): boolean {
  const length = rangeLengthInDays(from, to);
  return length > 0 && length <= MAX_REPORT_RANGE_DAYS;
}

/**
 * How the period reads on the report and in the exported file.
 *
 * One wording for all three surfaces — the header above the table, the CSV and
 * the printed page — because a period described two ways is the beginning of a
 * report that disagrees with the copy of itself somebody archived.
 */
export function describeReportPeriod(period: ReportPeriod): string {
  if (period.kind === "DAILY") return longDate(period.from);

  if (period.kind === "MONTHLY") {
    return new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(period.from);
  }

  // A "custom" range of one day reads as that day rather than as "16 to 16".
  if (toIsoDate(period.from) === toIsoDate(period.to)) return longDate(period.from);

  return `${longDate(period.from)} to ${longDate(period.to)}`;
}

/** A filename-safe stamp for the exported file, e.g. `2026-08-01_2026-08-31`. */
export function reportPeriodSlug(period: ReportPeriod): string {
  const from = toIsoDate(period.from);
  const to = toIsoDate(period.to);

  return from === to ? from : `${from}_${to}`;
}

/**
 * Every calendar day in the period, in order.
 *
 * Walked through `addUtcDays` rather than by adding milliseconds, for the reason
 * `calendarDaysBetween` gives: the two agree in UTC and only one of them keeps
 * agreeing if these ever become local dates.
 */
export function daysInPeriod(period: ReportPeriod): Date[] {
  const days: Date[] = [];

  for (let day = period.from; day.getTime() <= period.to.getTime(); day = addUtcDays(day, 1)) {
    days.push(day);
  }

  return days;
}

function longDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
