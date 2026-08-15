import { describe, expect, it } from "vitest";

import {
  MAX_REPORT_RANGE_DAYS,
  daysInPeriod,
  describeReportPeriod,
  isReportableRange,
  monthlyRange,
  rangeLengthInDays,
  reportPeriodSlug,
  type ReportPeriod,
} from "@/lib/report-period";
import { toIsoDate } from "@/lib/date";

/**
 * The period rules, pinned.
 *
 * The suite runs under `TZ=America/New_York` (see `vitest.config.ts`), which is
 * deliberately not the company's timezone — if any of this starts failing there,
 * something has begun reading a calendar date off the server's local clock
 * rather than treating it as UTC midnight like every other date in this system.
 */

const iso = (period: { from: Date; to: Date }) => [toIsoDate(period.from), toIsoDate(period.to)];

describe("monthlyRange", () => {
  it("covers the whole month, both ends inclusive", () => {
    expect(iso(monthlyRange(2026, 8))).toEqual(["2026-08-01", "2026-08-31"]);
  });

  it("ends on the 30th for a thirty-day month", () => {
    expect(iso(monthlyRange(2026, 4))).toEqual(["2026-04-01", "2026-04-30"]);
  });

  it("knows February in a common year", () => {
    expect(iso(monthlyRange(2026, 2))).toEqual(["2026-02-01", "2026-02-28"]);
  });

  it("knows February in a leap year", () => {
    expect(iso(monthlyRange(2024, 2))).toEqual(["2024-02-01", "2024-02-29"]);
  });

  it("does not roll off the end of the year in December", () => {
    expect(iso(monthlyRange(2026, 12))).toEqual(["2026-12-01", "2026-12-31"]);
  });

  it("starts the year cleanly in January", () => {
    expect(iso(monthlyRange(2026, 1))).toEqual(["2026-01-01", "2026-01-31"]);
  });

  it("produces UTC midnight, not a local midnight shifted into the previous day", () => {
    const { from, to } = monthlyRange(2026, 8);

    expect(from.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });
});

describe("rangeLengthInDays", () => {
  it("counts one day for a single date, not zero", () => {
    const day = new Date("2026-08-16T00:00:00.000Z");
    expect(rangeLengthInDays(day, day)).toBe(1);
  });

  it("counts both ends of a range", () => {
    expect(
      rangeLengthInDays(new Date("2026-08-01T00:00:00.000Z"), new Date("2026-08-15T00:00:00.000Z")),
    ).toBe(15);
  });

  it("counts a whole month", () => {
    const { from, to } = monthlyRange(2026, 8);
    expect(rangeLengthInDays(from, to)).toBe(31);
  });

  it("is zero for a backwards range rather than negative", () => {
    expect(
      rangeLengthInDays(new Date("2026-08-15T00:00:00.000Z"), new Date("2026-08-01T00:00:00.000Z")),
    ).toBe(0);
  });
});

describe("isReportableRange", () => {
  it("accepts a single day", () => {
    const day = new Date("2026-08-16T00:00:00.000Z");
    expect(isReportableRange(day, day)).toBe(true);
  });

  it("refuses a backwards range", () => {
    expect(
      isReportableRange(new Date("2026-08-15T00:00:00.000Z"), new Date("2026-08-01T00:00:00.000Z")),
    ).toBe(false);
  });

  it("accepts exactly the maximum and refuses one day more", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const atLimit = new Date(from.getTime() + (MAX_REPORT_RANGE_DAYS - 1) * 86_400_000);
    const overLimit = new Date(from.getTime() + MAX_REPORT_RANGE_DAYS * 86_400_000);

    expect(rangeLengthInDays(from, atLimit)).toBe(MAX_REPORT_RANGE_DAYS);
    expect(isReportableRange(from, atLimit)).toBe(true);
    expect(isReportableRange(from, overLimit)).toBe(false);
  });

  it("accepts a full leap year, which is what the limit exists to allow", () => {
    expect(
      isReportableRange(new Date("2024-01-01T00:00:00.000Z"), new Date("2024-12-31T00:00:00.000Z")),
    ).toBe(true);
  });
});

describe("describeReportPeriod", () => {
  const period = (kind: ReportPeriod["kind"], from: string, to: string): ReportPeriod => ({
    kind,
    from: new Date(`${from}T00:00:00.000Z`),
    to: new Date(`${to}T00:00:00.000Z`),
  });

  it("names the month for a monthly period", () => {
    expect(describeReportPeriod(period("MONTHLY", "2026-08-01", "2026-08-31"))).toBe("August 2026");
  });

  it("names the day for a single-day period", () => {
    expect(describeReportPeriod(period("DAILY", "2026-08-16", "2026-08-16"))).toBe("16 August 2026");
  });

  it("names both ends of a custom range", () => {
    expect(describeReportPeriod(period("CUSTOM", "2026-08-01", "2026-08-15"))).toBe(
      "1 August 2026 to 15 August 2026",
    );
  });

  // A custom range of one day is still one day, and "16 August to 16 August"
  // reads as a mistake rather than as a period.
  it("collapses a custom range that holds a single day", () => {
    expect(describeReportPeriod(period("CUSTOM", "2026-08-16", "2026-08-16"))).toBe("16 August 2026");
  });
});

describe("reportPeriodSlug", () => {
  it("is a single date for one day", () => {
    expect(
      reportPeriodSlug({
        kind: "DAILY",
        from: new Date("2026-08-16T00:00:00.000Z"),
        to: new Date("2026-08-16T00:00:00.000Z"),
      }),
    ).toBe("2026-08-16");
  });

  it("names both ends for a range", () => {
    expect(
      reportPeriodSlug({
        kind: "MONTHLY",
        ...monthlyRange(2026, 8),
      }),
    ).toBe("2026-08-01_2026-08-31");
  });
});

describe("daysInPeriod", () => {
  it("walks every day of a month, in order, both ends included", () => {
    const days = daysInPeriod({ kind: "MONTHLY", ...monthlyRange(2026, 8) });

    expect(days).toHaveLength(31);
    expect(toIsoDate(days[0])).toBe("2026-08-01");
    expect(toIsoDate(days[30])).toBe("2026-08-31");
  });

  it("crosses a month boundary without losing or repeating a day", () => {
    const days = daysInPeriod({
      kind: "CUSTOM",
      from: new Date("2026-01-30T00:00:00.000Z"),
      to: new Date("2026-02-02T00:00:00.000Z"),
    });

    expect(days.map(toIsoDate)).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
  });

  it("crosses a leap day", () => {
    const days = daysInPeriod({
      kind: "CUSTOM",
      from: new Date("2024-02-28T00:00:00.000Z"),
      to: new Date("2024-03-01T00:00:00.000Z"),
    });

    expect(days.map(toIsoDate)).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
  });

  it("holds one day for a single-day period", () => {
    const day = new Date("2026-08-16T00:00:00.000Z");
    expect(daysInPeriod({ kind: "DAILY", from: day, to: day }).map(toIsoDate)).toEqual(["2026-08-16"]);
  });

  it("holds nothing for a backwards range rather than looping", () => {
    expect(
      daysInPeriod({
        kind: "CUSTOM",
        from: new Date("2026-08-15T00:00:00.000Z"),
        to: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).toEqual([]);
  });
});
