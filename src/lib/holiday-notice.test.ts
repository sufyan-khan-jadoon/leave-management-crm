/**
 * The announcement rule, tested against the company's clock rather than the
 * server's.
 *
 * `APP_TIME_ZONE` is Asia/Karachi (UTC+5), so noon there is 07:00 UTC. Every
 * expectation below is written in UTC on purpose: if the rule ever starts
 * reading the server's local midnight instead of Karachi's, these numbers stop
 * lining up. That is the bug worth catching — it is invisible in development on
 * a machine already set to Pakistan time, and shows up in production as
 * announcements five hours late.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { noticeDueAt, planHolidayNotice } from "@/lib/holiday-notice";

/** A calendar day, the way the rest of the app stores one. */
function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Pins "now" so "today" is deterministic wherever this runs. */
function freeze(instant: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("noticeDueAt", () => {
  it("is noon on the company's clock the day before, not the server's", () => {
    // Monday 17 August closes -> Sunday 16 August, 12:00 in Karachi = 07:00 UTC.
    expect(noticeDueAt(day("2026-08-17")).toISOString()).toBe("2026-08-16T07:00:00.000Z");
  });

  it("steps back across a month boundary", () => {
    expect(noticeDueAt(day("2026-09-01")).toISOString()).toBe("2026-08-31T07:00:00.000Z");
  });

  it("steps back across a year boundary", () => {
    expect(noticeDueAt(day("2027-01-01")).toISOString()).toBe("2026-12-31T07:00:00.000Z");
  });
});

describe("planHolidayNotice", () => {
  it("schedules for today at noon when the day off is tomorrow and it is still morning", () => {
    // Scenario 1. Sunday 16th, 10:00 Karachi (05:00 UTC); office shuts Monday.
    freeze("2026-08-16T05:00:00.000Z");

    const plan = planHolidayNotice(day("2026-08-17"));

    expect(plan.action).toBe("schedule");
    expect(plan.action !== "skip" && plan.dueAt.toISOString()).toBe("2026-08-16T07:00:00.000Z");
  });

  it("sends immediately when the day off is tomorrow and noon has passed", () => {
    // Scenario 2. Sunday 16th, 15:00 Karachi (10:00 UTC) — the slot is gone.
    freeze("2026-08-16T10:00:00.000Z");

    expect(planHolidayNotice(day("2026-08-17")).action).toBe("send");
  });

  it("still schedules when the day off is several days away", () => {
    // Scenario 3. Saturday 8th for a closure on Monday 17th.
    freeze("2026-08-08T10:00:00.000Z");

    const plan = planHolidayNotice(day("2026-08-17"));

    expect(plan.action).toBe("schedule");
    expect(plan.action !== "skip" && plan.dueAt.toISOString()).toBe("2026-08-16T07:00:00.000Z");
  });

  it("skips the announcement when the day off is today", () => {
    // Scenario 4. Nobody can usefully be warned about a day already underway.
    freeze("2026-08-17T05:00:00.000Z");

    expect(planHolidayNotice(day("2026-08-17"))).toEqual({
      action: "skip",
      reason: "starts-today-or-earlier",
    });
  });

  it("skips a date in the past", () => {
    freeze("2026-08-20T05:00:00.000Z");

    expect(planHolidayNotice(day("2026-08-17")).action).toBe("skip");
  });

  it("sends exactly at noon rather than waiting for the next tick", () => {
    // The boundary is inclusive: due *at* the moment means due.
    freeze("2026-08-16T07:00:00.000Z");

    expect(planHolidayNotice(day("2026-08-17")).action).toBe("send");
  });

  it("is still scheduling one second before noon", () => {
    freeze("2026-08-16T06:59:59.000Z");

    expect(planHolidayNotice(day("2026-08-17")).action).toBe("schedule");
  });

  it("treats late evening in Karachi as the same day, not the next one in UTC", () => {
    // 23:30 Karachi on the 16th is 18:30 UTC on the 16th. The closure is on the
    // 17th, so this must still be an immediate send rather than a skip — a rule
    // reading UTC dates alone would agree here, but the reverse case below is
    // the one that catches it.
    freeze("2026-08-16T18:30:00.000Z");

    expect(planHolidayNotice(day("2026-08-17")).action).toBe("send");
  });

  it("treats the small hours in Karachi as today, not yesterday", () => {
    // 02:00 on the 17th in Karachi is 21:00 on the *16th* in UTC. The office
    // shuts on the 17th, so this is "today" and must skip. Reading the server's
    // UTC date would call it tomorrow and cheerfully send "closed tomorrow"
    // hours after the office had already shut.
    freeze("2026-08-16T21:00:00.000Z");

    expect(planHolidayNotice(day("2026-08-17")).action).toBe("skip");
  });
});
