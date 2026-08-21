/**
 * The remote-work rules, tested as calendar arithmetic rather than as an endpoint.
 *
 * Every anchor is a real date with its weekday named in a comment, so a reader
 * can check the fixture against a calendar rather than trusting it. 2026-08-21
 * is a Friday, which is the reference point for most of these.
 *
 * Dates are built at UTC midnight, the convention the whole app stores calendar
 * days in, and the suite runs under a timezone that is not the company's — a
 * rule that quietly reached for the server's local clock would fail here rather
 * than in production.
 */
import { describe, expect, it } from "vitest";

import { toIsoDate } from "@/lib/date";
import {
  addUtcCalendarMonths,
  coversDate,
  describeRemotePeriod,
  isCurrentlyRemote,
  periodsOverlap,
  remoteDayCount,
  remoteWorkState,
  resolveRemotePeriod,
  revocationEndDate,
  REMOTE_WORK_TYPE,
} from "@/lib/remote-work";

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Friday. */
const TODAY = day("2026-08-21");

function iso(period: { startDate: Date; endDate: Date | null }): [string, string | null] {
  return [toIsoDate(period.startDate), period.endDate ? toIsoDate(period.endDate) : null];
}

describe("resolveRemotePeriod", () => {
  it("covers today alone for TODAY", () => {
    expect(iso(resolveRemotePeriod(REMOTE_WORK_TYPE.TODAY, TODAY))).toEqual(["2026-08-21", "2026-08-21"]);
  });

  it("covers tomorrow alone for TOMORROW, and does not include today", () => {
    expect(iso(resolveRemotePeriod(REMOTE_WORK_TYPE.TOMORROW, TODAY))).toEqual(["2026-08-22", "2026-08-22"]);
  });

  // Seven days inclusive: Fri 21 through Thu 27, ending on the day before the
  // same weekday it started. Six added, not seven — the off-by-one that would
  // quietly give everybody an eighth day.
  it("covers seven days including today for WEEK", () => {
    const period = resolveRemotePeriod(REMOTE_WORK_TYPE.WEEK, TODAY);

    expect(iso(period)).toEqual(["2026-08-21", "2026-08-27"]);
    expect(remoteDayCount(period)).toBe(7);
  });

  it("covers a calendar month for MONTH, ending the day before the same date", () => {
    expect(iso(resolveRemotePeriod(REMOTE_WORK_TYPE.MONTH, TODAY))).toEqual(["2026-08-21", "2026-09-20"]);
  });

  it("clamps MONTH to the shorter month rather than rolling into the next one", () => {
    // 31 January + one month is 28 February, so the period ends on the 27th.
    expect(iso(resolveRemotePeriod(REMOTE_WORK_TYPE.MONTH, day("2026-01-31")))).toEqual([
      "2026-01-31",
      "2026-02-27",
    ]);
  });

  it("respects a leap year when clamping", () => {
    // 2028 is a leap year: 31 January + one month is 29 February.
    expect(iso(resolveRemotePeriod(REMOTE_WORK_TYPE.MONTH, day("2028-01-31")))).toEqual([
      "2028-01-31",
      "2028-02-28",
    ]);
  });

  it("crosses a year boundary for MONTH", () => {
    expect(iso(resolveRemotePeriod(REMOTE_WORK_TYPE.MONTH, day("2026-12-15")))).toEqual([
      "2026-12-15",
      "2027-01-14",
    ]);
  });

  it("takes both dates verbatim for CUSTOM", () => {
    const period = resolveRemotePeriod(REMOTE_WORK_TYPE.CUSTOM, TODAY, {
      startDate: day("2026-08-25"),
      endDate: day("2026-09-15"),
    });

    expect(iso(period)).toEqual(["2026-08-25", "2026-09-15"]);
    expect(remoteDayCount(period)).toBe(22);
  });

  it("has no end date for UNTIL_REVOKED", () => {
    expect(iso(resolveRemotePeriod(REMOTE_WORK_TYPE.UNTIL_REVOKED, TODAY))).toEqual(["2026-08-21", null]);
  });
});

describe("addUtcCalendarMonths", () => {
  it("keeps the day of the month when the target month is long enough", () => {
    expect(toIsoDate(addUtcCalendarMonths(day("2026-03-15"), 1))).toBe("2026-04-15");
  });

  it("clamps 31 January to the end of February", () => {
    expect(toIsoDate(addUtcCalendarMonths(day("2026-01-31"), 1))).toBe("2026-02-28");
  });

  it("clamps 31 March to 30 April", () => {
    expect(toIsoDate(addUtcCalendarMonths(day("2026-03-31"), 1))).toBe("2026-04-30");
  });
});

describe("coversDate", () => {
  const closed = { startDate: day("2026-08-21"), endDate: day("2026-08-31") };
  const open = { startDate: day("2026-08-21"), endDate: null };

  it("includes both ends", () => {
    expect(coversDate(closed, day("2026-08-21"))).toBe(true);
    expect(coversDate(closed, day("2026-08-31"))).toBe(true);
  });

  it("excludes the day before and the day after", () => {
    expect(coversDate(closed, day("2026-08-20"))).toBe(false);
    expect(coversDate(closed, day("2026-09-01"))).toBe(false);
  });

  it("covers every day from the start when there is no end", () => {
    expect(coversDate(open, day("2026-08-20"))).toBe(false);
    expect(coversDate(open, day("2026-08-21"))).toBe(true);
    expect(coversDate(open, day("2030-01-01"))).toBe(true);
  });

  // The shape revocation-before-start produces. An instruction that never took
  // effect must cover nothing at all.
  it("covers nothing when the end precedes the start", () => {
    const empty = { startDate: day("2026-08-25"), endDate: day("2026-08-24") };

    for (const date of ["2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26"]) {
      expect(coversDate(empty, day(date))).toBe(false);
    }
  });
});

describe("remoteWorkState", () => {
  it("is ACTIVE inside an open period", () => {
    expect(
      remoteWorkState({ startDate: day("2026-08-01"), endDate: null, revokedAt: null }, TODAY),
    ).toBe("ACTIVE");
  });

  it("is ACTIVE on the first and last day of a closed period", () => {
    const period = { startDate: day("2026-08-21"), endDate: day("2026-08-21"), revokedAt: null };
    expect(remoteWorkState(period, TODAY)).toBe("ACTIVE");
  });

  it("is SCHEDULED before it starts", () => {
    expect(
      remoteWorkState({ startDate: day("2026-08-22"), endDate: day("2026-08-30"), revokedAt: null }, TODAY),
    ).toBe("SCHEDULED");
  });

  it("is EXPIRED the day after it ends", () => {
    expect(
      remoteWorkState({ startDate: day("2026-08-01"), endDate: day("2026-08-20"), revokedAt: null }, TODAY),
    ).toBe("EXPIRED");
  });

  // Revocation is asserted about the assignment, so it outranks every reading of
  // the calendar — including a period whose dates would still say ACTIVE.
  it("is REVOKED whatever the dates say", () => {
    expect(
      remoteWorkState(
        { startDate: day("2026-08-01"), endDate: null, revokedAt: new Date("2026-08-10T09:00:00Z") },
        TODAY,
      ),
    ).toBe("REVOKED");
  });

  it("only counts an ACTIVE period as currently remote", () => {
    expect(isCurrentlyRemote({ startDate: day("2026-08-01"), endDate: null, revokedAt: null }, TODAY)).toBe(true);
    expect(
      isCurrentlyRemote({ startDate: day("2026-08-22"), endDate: null, revokedAt: null }, TODAY),
    ).toBe(false);
  });
});

describe("revocationEndDate", () => {
  it("closes a running period today, keeping the days already served", () => {
    const period = { startDate: day("2026-08-01"), endDate: day("2026-08-31") };
    expect(toIsoDate(revocationEndDate(period, TODAY))).toBe("2026-08-21");
    expect(coversDate({ ...period, endDate: revocationEndDate(period, TODAY) }, day("2026-08-10"))).toBe(true);
    expect(coversDate({ ...period, endDate: revocationEndDate(period, TODAY) }, day("2026-08-22"))).toBe(false);
  });

  it("closes a permanent period today too", () => {
    expect(toIsoDate(revocationEndDate({ startDate: day("2026-01-01"), endDate: null }, TODAY))).toBe(
      "2026-08-21",
    );
  });

  it("empties a period that has not started yet", () => {
    expect(toIsoDate(revocationEndDate({ startDate: day("2026-08-25"), endDate: day("2026-09-15") }, TODAY))).toBe(
      "2026-08-24",
    );
  });

  // Revoking must never lengthen anything: an already-finished period keeps the
  // end it had rather than being pushed forward to today.
  it("never extends a period that already ended", () => {
    expect(toIsoDate(revocationEndDate({ startDate: day("2026-08-01"), endDate: day("2026-08-10") }, TODAY))).toBe(
      "2026-08-10",
    );
  });
});

describe("periodsOverlap", () => {
  const august = { startDate: day("2026-08-20"), endDate: day("2026-08-30") };

  it("catches a range starting inside an existing one", () => {
    expect(periodsOverlap(august, { startDate: day("2026-08-25"), endDate: day("2026-09-05") })).toBe(true);
  });

  it("catches a range that swallows an existing one", () => {
    expect(periodsOverlap(august, { startDate: day("2026-08-01"), endDate: day("2026-09-30") })).toBe(true);
  });

  it("catches touching at a single day on either edge", () => {
    expect(periodsOverlap(august, { startDate: day("2026-08-30"), endDate: day("2026-09-05") })).toBe(true);
    expect(periodsOverlap(august, { startDate: day("2026-08-01"), endDate: day("2026-08-20") })).toBe(true);
  });

  it("allows ranges that meet without touching", () => {
    expect(periodsOverlap(august, { startDate: day("2026-08-31"), endDate: day("2026-09-05") })).toBe(false);
    expect(periodsOverlap(august, { startDate: day("2026-08-01"), endDate: day("2026-08-19") })).toBe(false);
  });

  it("treats an open end as reaching forever", () => {
    const permanent = { startDate: day("2026-08-01"), endDate: null };

    expect(periodsOverlap(permanent, august)).toBe(true);
    expect(periodsOverlap(permanent, { startDate: day("2030-01-01"), endDate: day("2030-01-02") })).toBe(true);
    expect(periodsOverlap(permanent, { startDate: day("2026-07-01"), endDate: day("2026-07-31") })).toBe(false);
  });
});

describe("describeRemotePeriod", () => {
  it("names one day once", () => {
    expect(describeRemotePeriod({ startDate: TODAY, endDate: TODAY })).toBe("Aug 21, 2026");
  });

  it("names both ends of a range", () => {
    expect(describeRemotePeriod({ startDate: TODAY, endDate: day("2026-08-28") })).toBe(
      "Aug 21, 2026 – Aug 28, 2026",
    );
  });

  it("says what an open period means rather than leaving a blank end", () => {
    expect(describeRemotePeriod({ startDate: TODAY, endDate: null })).toBe(
      "Aug 21, 2026 onwards, until revoked",
    );
  });
});

describe("remoteDayCount", () => {
  it("counts both ends", () => {
    expect(remoteDayCount({ startDate: TODAY, endDate: TODAY })).toBe(1);
    expect(remoteDayCount({ startDate: TODAY, endDate: day("2026-08-27") })).toBe(7);
  });

  it("crosses a month boundary", () => {
    expect(remoteDayCount({ startDate: day("2026-08-25"), endDate: day("2026-09-15") })).toBe(22);
  });

  it("has no answer for an open period", () => {
    expect(remoteDayCount({ startDate: TODAY, endDate: null })).toBeNull();
  });

  it("reports an emptied period as zero rather than a negative number", () => {
    expect(remoteDayCount({ startDate: day("2026-08-25"), endDate: day("2026-08-24") })).toBe(0);
  });
});
