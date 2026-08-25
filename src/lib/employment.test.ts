/**
 * The attendance boundary, tested as calendar arithmetic rather than as an
 * endpoint — the same shape as `working-days.test.ts` beside it.
 *
 * Every anchor is a real 2026 date with its weekday named in a comment, so a
 * reader can check the fixture against a calendar rather than trusting it. The
 * scenario throughout is the one that produced the defect: somebody registered
 * on **2026-08-22**, a Saturday, who had been reading as `ABSENT` for the five
 * working days before it.
 *
 * `APP_TIME_ZONE` is Asia/Karachi (UTC+5, no daylight saving). The zone cases at
 * the bottom are the point of the file: `createdAt` is an *instant*, and reading
 * it as a UTC date would start somebody's register a day early for every account
 * created before 05:00 local — which is the one thing an attendance floor must
 * never do. The suite passes under `TZ=America/New_York`; if it ever starts
 * failing there, something has begun trusting the server's clock.
 */
import { describe, expect, it } from "vitest";

import { attendanceStartOf, isBeforeEmployment } from "@/lib/employment";

/** A calendar day at UTC midnight, the convention the whole app stores days in. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** An instant, as `Employee.createdAt` actually arrives. */
function instant(iso: string): Date {
  return new Date(iso);
}

describe("attendanceStartOf", () => {
  it("takes the calendar day the account was created on", () => {
    // 09:30 in Karachi on Saturday 22 August.
    expect(attendanceStartOf(instant("2026-08-22T04:30:00.000Z"))).toEqual(day("2026-08-22"));
  });

  it("normalises to midnight, so the time of day never leaks into a comparison", () => {
    const start = attendanceStartOf(instant("2026-08-22T18:45:12.345Z"));

    expect(start.getUTCHours()).toBe(0);
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCSeconds()).toBe(0);
    expect(start.getUTCMilliseconds()).toBe(0);
  });

  /**
   * The off-by-one this function exists for.
   *
   * 2026-08-21T20:00Z is already 01:00 on the 22nd in Karachi, so somebody who
   * registered at one in the morning belongs to the 22nd. Reading the instant as
   * a UTC date would call it the 21st and hand them one invented absence — the
   * exact bug, one day smaller.
   */
  it("reads the instant on the company's clock, not the server's", () => {
    expect(attendanceStartOf(instant("2026-08-21T20:00:00.000Z"))).toEqual(day("2026-08-22"));
    expect(attendanceStartOf(instant("2026-08-21T19:00:00.000Z"))).toEqual(day("2026-08-22"));
    // One minute earlier is still the 21st in Karachi: 23:59.
    expect(attendanceStartOf(instant("2026-08-21T18:59:00.000Z"))).toEqual(day("2026-08-21"));
  });

  it("carries a registration over a month boundary", () => {
    // 00:30 on 1 September in Karachi, while UTC still reads 31 August.
    expect(attendanceStartOf(instant("2026-08-31T19:30:00.000Z"))).toEqual(day("2026-09-01"));
  });

  it("carries a registration over a year boundary", () => {
    expect(attendanceStartOf(instant("2026-12-31T19:30:00.000Z"))).toEqual(day("2027-01-01"));
  });

  it("handles 29 February in a leap year", () => {
    expect(attendanceStartOf(instant("2028-02-29T06:00:00.000Z"))).toEqual(day("2028-02-29"));
  });
});

describe("isBeforeEmployment", () => {
  // Saturday 22 August 2026 — the registration in the reported defect.
  const start = attendanceStartOf(instant("2026-08-22T04:30:00.000Z"));

  /**
   * The acceptance criterion, stated as five dates.
   *
   * Mon 17 to Fri 21 August 2026 are the five working days the roster was
   * calling `ABSENT` for somebody whose account did not exist on any of them.
   */
  it("rules out every day before the registration", () => {
    for (const iso of ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"]) {
      expect(isBeforeEmployment(day(iso), start)).toBe(true);
    }
  });

  it("reaches back indefinitely, not merely to the start of the month", () => {
    expect(isBeforeEmployment(day("2026-07-31"), start)).toBe(true);
    expect(isBeforeEmployment(day("2025-08-22"), start)).toBe(true);
    expect(isBeforeEmployment(day("2019-01-01"), start)).toBe(true);
  });

  /**
   * Strictly before, and the registration day itself is theirs.
   *
   * That strictness is what hands the day back to the ordinary rules: 22 August
   * 2026 is a Saturday, so `describeDay` reads it as `NON_WORKING` for the
   * reason it does for everybody else, rather than this boundary having an
   * opinion about the day's kind. Registering on a closure works the same way.
   */
  it("admits the registration day itself", () => {
    expect(isBeforeEmployment(day("2026-08-22"), start)).toBe(false);
  });

  it("admits every day after it", () => {
    // Sunday, then the first working Monday, then a fortnight on.
    expect(isBeforeEmployment(day("2026-08-23"), start)).toBe(false);
    expect(isBeforeEmployment(day("2026-08-24"), start)).toBe(false);
    expect(isBeforeEmployment(day("2026-09-07"), start)).toBe(false);
  });

  /**
   * The long-standing employee, who must be left entirely alone.
   *
   * Everything in a report about somebody registered years ago sits after their
   * boundary, so not one of their historical days changes meaning.
   */
  it("says nothing about anybody registered long ago", () => {
    const veteran = attendanceStartOf(instant("2023-03-06T05:00:00.000Z"));

    for (const iso of ["2023-03-06", "2024-02-29", "2026-08-17", "2026-08-21", "2026-12-31"]) {
      expect(isBeforeEmployment(day(iso), veteran)).toBe(false);
    }
  });

  it("leaves somebody registered today with nothing behind them to answer for", () => {
    const today = day("2026-08-22");
    const registeredToday = attendanceStartOf(instant("2026-08-22T09:00:00.000Z"));

    expect(isBeforeEmployment(today, registeredToday)).toBe(false);
    expect(isBeforeEmployment(day("2026-08-21"), registeredToday)).toBe(true);
  });

  /** Midway through a month: the earlier half is out, the later half is in. */
  it("cuts a month at the registration date", () => {
    const midMonth = attendanceStartOf(instant("2026-08-14T07:00:00.000Z"));

    const before = ["2026-08-01", "2026-08-13"].filter((iso) =>
      isBeforeEmployment(day(iso), midMonth),
    );
    const after = ["2026-08-14", "2026-08-31"].filter(
      (iso) => !isBeforeEmployment(day(iso), midMonth),
    );

    expect(before).toHaveLength(2);
    expect(after).toHaveLength(2);
  });
});
