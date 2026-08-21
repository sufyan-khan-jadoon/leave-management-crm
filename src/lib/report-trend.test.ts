import { describe, expect, it } from "vitest";

import { toIsoDate } from "@/lib/date";
import { bucketTrend, trendGranularityFor, type TrendDay } from "@/lib/report-trend";

const day = (iso: string, status: string): TrendDay => ({
  date: new Date(`${iso}T00:00:00.000Z`),
  status,
});

describe("trendGranularityFor", () => {
  it("cuts short periods by day and long ones more coarsely", () => {
    expect(trendGranularityFor(1)).toBe("DAY");
    expect(trendGranularityFor(31)).toBe("DAY");
    expect(trendGranularityFor(45)).toBe("DAY");
    expect(trendGranularityFor(46)).toBe("WEEK");
    expect(trendGranularityFor(130)).toBe("WEEK");
    expect(trendGranularityFor(131)).toBe("MONTH");
    // A whole year, which is the longest a report may cover.
    expect(trendGranularityFor(366)).toBe("MONTH");
  });
});

describe("bucketTrend", () => {
  it("holds nothing when there is nothing", () => {
    expect(bucketTrend([], "DAY")).toEqual([]);
  });

  it("counts each verdict into its own series", () => {
    const [bucket] = bucketTrend(
      [
        day("2026-08-17", "PRESENT"),
        day("2026-08-18", "ABSENT"),
        day("2026-08-19", "ON_LEAVE"),
        day("2026-08-20", "REMOTE"),
      ],
      "WEEK",
    );

    expect(bucket).toMatchObject({ present: 1, absent: 1, onLeave: 1, remote: 1 });
  });

  it("counts nothing for the days that are not records", () => {
    const [bucket] = bucketTrend(
      [
        day("2026-08-17", "PRESENT"),
        day("2026-08-18", "CLOSED"),
        day("2026-08-19", "NON_WORKING"),
        day("2026-08-20", "NO_RECORD"),
        day("2026-08-21", "UPCOMING"),
      ],
      "WEEK",
    );

    // The bucket exists — the week happened — and holds one record.
    expect(bucket).toMatchObject({ present: 1, absent: 0, onLeave: 0, remote: 0 });
  });

  it("starts each week on the Monday, matching the date presets", () => {
    const buckets = bucketTrend(
      [day("2026-08-21", "PRESENT"), day("2026-08-24", "PRESENT")],
      "WEEK",
    );

    // Friday and the Monday after are two different weeks.
    expect(buckets.map((bucket) => toIsoDate(bucket.start))).toEqual([
      "2026-08-17",
      "2026-08-24",
    ]);
  });

  it("starts each month on the first", () => {
    const buckets = bucketTrend(
      [day("2026-08-31", "PRESENT"), day("2026-09-01", "ABSENT")],
      "MONTH",
    );

    expect(buckets.map((bucket) => toIsoDate(bucket.start))).toEqual(["2026-08-01", "2026-09-01"]);
    expect(buckets.map((bucket) => bucket.present)).toEqual([1, 0]);
  });

  it("keeps every day its own column at day granularity", () => {
    const buckets = bucketTrend(
      [day("2026-08-19", "PRESENT"), day("2026-08-20", "PRESENT")],
      "DAY",
    );

    expect(buckets).toHaveLength(2);
  });

  it("returns buckets in date order, whatever order it was handed them", () => {
    const buckets = bucketTrend(
      [day("2026-09-02", "PRESENT"), day("2026-07-01", "PRESENT"), day("2026-08-03", "PRESENT")],
      "MONTH",
    );

    expect(buckets.map((bucket) => toIsoDate(bucket.start))).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
  });

  /**
   * The property that matters: whatever the granularity, the series sum to the
   * same figures the report's own totals hold. Both are counting the verdicts
   * `describeDay` reached, so the chart can never contradict the tiles above it.
   */
  it("sums to the same figures at every granularity", () => {
    const days: TrendDay[] = [
      day("2026-08-03", "PRESENT"),
      day("2026-08-04", "ABSENT"),
      day("2026-08-05", "ON_LEAVE"),
      day("2026-08-06", "REMOTE"),
      day("2026-08-07", "PRESENT"),
      day("2026-08-08", "NON_WORKING"),
      day("2026-09-14", "PRESENT"),
      day("2026-09-15", "CLOSED"),
    ];

    for (const granularity of ["DAY", "WEEK", "MONTH"] as const) {
      const buckets = bucketTrend(days, granularity);
      const sum = (key: "present" | "absent" | "onLeave" | "remote") =>
        buckets.reduce((total, bucket) => total + bucket[key], 0);

      expect([sum("present"), sum("absent"), sum("onLeave"), sum("remote")]).toEqual([3, 1, 1, 1]);
    }
  });
});
