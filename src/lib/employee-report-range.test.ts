import { describe, expect, it } from "vitest";

import { resolveEmployeeReportPreset } from "@/lib/employee-report-range";
import { toIsoDate } from "@/lib/date";
import { isReportableRange, rangeLengthInDays } from "@/lib/report-period";

/**
 * The date presets, pinned.
 *
 * Every case is built from a UTC instant and asserted as an ISO calendar date,
 * so this passes under `TZ=America/New_York` exactly as `working-days.test.ts`
 * and `holiday-notice.test.ts` do. If it ever starts failing there, something in
 * `employee-report-range.ts` has begun trusting the server's local clock.
 */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const span = (iso: string, preset: Parameters<typeof resolveEmployeeReportPreset>[0]) => {
  const period = resolveEmployeeReportPreset(preset, day(iso));
  return [toIsoDate(period.from), toIsoDate(period.to)];
};

describe("resolveEmployeeReportPreset", () => {
  it("reads today as a single day", () => {
    expect(span("2026-08-21", "TODAY")).toEqual(["2026-08-21", "2026-08-21"]);
    expect(span("2028-02-29", "TODAY")).toEqual(["2028-02-29", "2028-02-29"]);
  });

  it("runs the week Monday to Sunday, whichever day it is asked on", () => {
    // 2026-08-21 is a Friday; the week around it is the 17th to the 23rd.
    expect(span("2026-08-17", "THIS_WEEK")).toEqual(["2026-08-17", "2026-08-23"]);
    expect(span("2026-08-21", "THIS_WEEK")).toEqual(["2026-08-17", "2026-08-23"]);
    // Sunday is the *end* of its week, not the start of the next one.
    expect(span("2026-08-23", "THIS_WEEK")).toEqual(["2026-08-17", "2026-08-23"]);
    expect(span("2026-08-24", "THIS_WEEK")).toEqual(["2026-08-24", "2026-08-30"]);
  });

  it("spans a week even across a month boundary", () => {
    expect(span("2026-09-01", "THIS_WEEK")).toEqual(["2026-08-31", "2026-09-06"]);
    expect(span("2027-01-01", "THIS_WEEK")).toEqual(["2026-12-28", "2027-01-03"]);
  });

  it("runs a month from the first to the last day", () => {
    expect(span("2026-08-21", "THIS_MONTH")).toEqual(["2026-08-01", "2026-08-31"]);
    // Asked on the first and on the last, which is where an off-by-one shows.
    expect(span("2026-08-01", "THIS_MONTH")).toEqual(["2026-08-01", "2026-08-31"]);
    expect(span("2026-08-31", "THIS_MONTH")).toEqual(["2026-08-01", "2026-08-31"]);
    expect(span("2026-02-10", "THIS_MONTH")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(span("2028-02-10", "THIS_MONTH")).toEqual(["2028-02-01", "2028-02-29"]);
  });

  it("steps the previous month back over a year boundary", () => {
    expect(span("2026-08-21", "PREVIOUS_MONTH")).toEqual(["2026-07-01", "2026-07-31"]);
    expect(span("2026-01-15", "PREVIOUS_MONTH")).toEqual(["2025-12-01", "2025-12-31"]);
    expect(span("2026-01-01", "PREVIOUS_MONTH")).toEqual(["2025-12-01", "2025-12-31"]);
    expect(span("2028-03-05", "PREVIOUS_MONTH")).toEqual(["2028-02-01", "2028-02-29"]);
  });

  it("runs the year whole, and a leap year still fits the report bound", () => {
    expect(span("2026-08-21", "THIS_YEAR")).toEqual(["2026-01-01", "2026-12-31"]);

    const leap = resolveEmployeeReportPreset("THIS_YEAR", day("2028-06-01"));
    expect([toIsoDate(leap.from), toIsoDate(leap.to)]).toEqual(["2028-01-01", "2028-12-31"]);
    expect(rangeLengthInDays(leap.from, leap.to)).toBe(366);
    // MAX_REPORT_RANGE_DAYS is 366 exactly, so a leap year is the longest thing
    // the picker can ask for and is accepted rather than refused at the boundary.
    expect(isReportableRange(leap.from, leap.to)).toBe(true);
  });

  it("words each preset as the period kind that describes it best", () => {
    expect(resolveEmployeeReportPreset("TODAY", day("2026-08-21")).kind).toBe("DAILY");
    expect(resolveEmployeeReportPreset("THIS_MONTH", day("2026-08-21")).kind).toBe("MONTHLY");
    expect(resolveEmployeeReportPreset("PREVIOUS_MONTH", day("2026-08-21")).kind).toBe("MONTHLY");
    expect(resolveEmployeeReportPreset("THIS_WEEK", day("2026-08-21")).kind).toBe("CUSTOM");
    expect(resolveEmployeeReportPreset("THIS_YEAR", day("2026-08-21")).kind).toBe("CUSTOM");
  });

  it("keeps every preset within the range a report will accept", () => {
    for (const preset of ["TODAY", "THIS_WEEK", "THIS_MONTH", "PREVIOUS_MONTH", "THIS_YEAR"] as const) {
      const period = resolveEmployeeReportPreset(preset, day("2028-02-29"));
      expect(isReportableRange(period.from, period.to)).toBe(true);
    }
  });
});
