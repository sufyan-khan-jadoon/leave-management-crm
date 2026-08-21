/**
 * A person's days, bucketed for the trend chart.
 *
 * **This adds nothing up that the server did not already decide.** Every day it
 * counts arrives carrying the verdict `describeDay` gave it; all this does is
 * choose how many of them share a column. With every record type included and
 * nothing narrowing the report — which is exactly what the employee report is,
 * see `employee-report.schema.ts` — the buckets sum to the same present, absent,
 * leave and remote figures the tiles show, because both are counting the same
 * verdicts. That is by construction rather than by coincidence, and it is why
 * this takes the day walk rather than issuing a query of its own.
 *
 * Free of Prisma and of React so it reads and tests alone, exactly as
 * `report-period.ts` and `leave-spells.ts` beside it do.
 */
import { addUtcDays, toIsoDate } from "@/lib/date";

/** How finely the trend is cut. Chosen from the length of the period, not asked for. */
export type TrendGranularity = "DAY" | "WEEK" | "MONTH";

export type TrendBucket = {
  /** First day the bucket covers — its key, and what the axis is labelled from. */
  start: Date;
  present: number;
  absent: number;
  onLeave: number;
  remote: number;
};

/** One day, reduced to the only thing bucketing looks at. */
export type TrendDay = { date: Date; status: string };

/**
 * How finely to cut a period of this length.
 *
 * A month of daily columns is readable; a year of them is 365 bars two pixels
 * wide, which is a texture rather than a chart. The thresholds are where the
 * columns stop being individually readable at a normal card width — about six
 * weeks of days, and about a year and a half of weeks, which the report's own
 * 366-day bound means is never reached.
 */
export function trendGranularityFor(dayCount: number): TrendGranularity {
  if (dayCount <= 45) return "DAY";
  if (dayCount <= 130) return "WEEK";
  return "MONTH";
}

/**
 * Which bucket a date belongs to, as that bucket's first day.
 *
 * Weeks start on Monday, matching `employee-report-range.ts` — two different
 * ideas of where a week begins on one screen would put the "this week" preset
 * and the chart's own columns out of step with each other.
 */
function bucketStart(date: Date, granularity: TrendGranularity): Date {
  if (granularity === "DAY") return date;
  if (granularity === "WEEK") return addUtcDays(date, -((date.getUTCDay() + 6) % 7));

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * The chart's columns, in order.
 *
 * Buckets holding nothing at all still appear: a fortnight of closures in the
 * middle of a quarter is a gap in the record, and a chart that closed up over it
 * would show a continuous line where there was none.
 */
export function bucketTrend(days: readonly TrendDay[], granularity: TrendGranularity): TrendBucket[] {
  const buckets = new Map<string, TrendBucket>();

  for (const day of days) {
    const start = bucketStart(day.date, granularity);
    const key = toIsoDate(start);

    const bucket =
      buckets.get(key) ?? { start, present: 0, absent: 0, onLeave: 0, remote: 0 };

    if (day.status === "PRESENT") bucket.present += 1;
    else if (day.status === "ABSENT") bucket.absent += 1;
    else if (day.status === "ON_LEAVE") bucket.onLeave += 1;
    else if (day.status === "REMOTE") bucket.remote += 1;
    // Everything else — closures, weekly days off, empty days, the future — is
    // counted nowhere, for the reason `recordTypeOf` prints no row for them: they
    // are the absence of a record, and a bar for them would put the calendar's
    // shape into a chart about what somebody did.

    buckets.set(key, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}
