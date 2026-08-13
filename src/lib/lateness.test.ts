import { describe, expect, it } from "vitest";

import { appZoneMinutesOfDay, appZoneInstant, toUtcDay } from "@/lib/date";
import { describeLateness, isLate, minutesLate } from "@/lib/lateness";

/**
 * How late a check-in was.
 *
 * Pure arithmetic over minutes-after-midnight, so it is tested here rather than
 * against a database, exactly as `geo`, `working-days` and `holiday-notice` are.
 *
 * The worked cases below are the ones the feature was specified with. They are
 * pinned rather than described because the interesting property is not that the
 * subtraction works — it is *which* time the subtraction is against. Lateness
 * here is measured from `cutoffMinutes`, the deadline to have appeared, and not
 * from `openingMinutes`, the hours the company publishes. Someone arriving at
 * 09:15 is therefore on time, which is deliberate and is asserted below so that
 * changing the basis cannot pass silently.
 */
const CUTOFF = 17 * 60; // 17:00, the default cutoff.
const at = (hour: number, minute = 0) => hour * 60 + minute;

describe("minutesLate", () => {
  it("is zero before the deadline", () => {
    expect(minutesLate(at(16, 55), CUTOFF)).toBe(0);
    expect(minutesLate(at(9), CUTOFF)).toBe(0);
    expect(minutesLate(at(0), CUTOFF)).toBe(0);
  });

  it("is zero exactly on the deadline", () => {
    expect(minutesLate(at(17), CUTOFF)).toBe(0);
  });

  it("counts every minute past it", () => {
    expect(minutesLate(at(17, 1), CUTOFF)).toBe(1);
    expect(minutesLate(at(17, 15), CUTOFF)).toBe(15);
    expect(minutesLate(at(17, 30), CUTOFF)).toBe(30);
    expect(minutesLate(at(23, 59), CUTOFF)).toBe(419);
  });

  /**
   * Arriving early is not a quantity. A negative figure would flow into sums and
   * averages as a credit against somebody else's tardiness.
   */
  it("never goes negative, however early", () => {
    expect(minutesLate(at(6), CUTOFF)).toBe(0);
    expect(minutesLate(0, CUTOFF)).toBe(0);
    expect(minutesLate(at(16, 59), CUTOFF)).toBe(0);
  });

  /**
   * The basis being a parameter is the whole of why a past day keeps its answer.
   * Same arrival, two deadlines, two figures — which is what freezing
   * `lateBasisMinutes` onto the row buys.
   */
  it("follows the basis it is given, not a fixed one", () => {
    expect(minutesLate(at(17, 15), at(17))).toBe(15);
    expect(minutesLate(at(17, 15), at(18))).toBe(0);
    expect(minutesLate(at(17, 15), at(9))).toBe(495);
  });

  // The choice of basis, pinned. Against the published opening time this same
  // arrival would read 495 minutes; against the cutoff it reads 15.
  it("is measured from the cutoff, not the opening time", () => {
    const arrival = at(17, 15);

    expect(minutesLate(arrival, CUTOFF)).toBe(15);
    expect(minutesLate(arrival, at(9))).toBe(495);
    expect(minutesLate(at(9, 15), CUTOFF)).toBe(0);
  });
});

describe("isLate", () => {
  it("treats the deadline itself as on time", () => {
    expect(isLate(at(17), CUTOFF)).toBe(false);
    expect(isLate(at(16, 59), CUTOFF)).toBe(false);
    expect(isLate(at(17, 1), CUTOFF)).toBe(true);
  });
});

describe("describeLateness", () => {
  it("says nothing at all when nobody was late", () => {
    expect(describeLateness(0)).toBeNull();
    expect(describeLateness(-5)).toBeNull();
  });

  it("reads in minutes below an hour", () => {
    expect(describeLateness(1)).toBe("1 min late");
    expect(describeLateness(15)).toBe("15 min late");
    expect(describeLateness(59)).toBe("59 min late");
  });

  it("breaks into hours past sixty, so the figure stays readable", () => {
    expect(describeLateness(60)).toBe("1 hr late");
    expect(describeLateness(75)).toBe("1 hr 15 min late");
    expect(describeLateness(495)).toBe("8 hr 15 min late");
  });
});

/**
 * The half that is not arithmetic: an instant has to become a reading on the
 * *company's* clock before it can be compared with a setting stored in the
 * company's minutes. A server in UTC reads 17:15 Karachi as 12:15, which would
 * report fifteen minutes of lateness as none at all.
 *
 * This suite passes under `TZ=America/New_York`; if it ever starts failing
 * there, something has begun trusting the server's clock.
 */
describe("reading an instant on the company's clock", () => {
  const day = toUtcDay("2026-08-11");

  it("round-trips a wall-clock time through an instant", () => {
    for (const [hour, minute] of [
      [9, 0],
      [16, 59],
      [17, 0],
      [17, 15],
      [23, 59],
    ]) {
      const instant = appZoneInstant(day, hour, minute);
      expect(appZoneMinutesOfDay(instant), `${hour}:${minute}`).toBe(at(hour, minute));
    }
  });

  it("computes the specified example end to end", () => {
    // Cutoff 5:00 PM, arrival 5:15 PM, and the answer is 15 whatever the server
    // is set to.
    const arrival = appZoneInstant(day, 17, 15);
    expect(minutesLate(appZoneMinutesOfDay(arrival), CUTOFF)).toBe(15);
  });

  it("does not charge the recording time to the employee", () => {
    // The case the requirement calls out: arrived 17:15, recorded 17:20.
    const arrived = appZoneInstant(day, 17, 15);
    const recorded = appZoneInstant(day, 17, 20);

    expect(minutesLate(appZoneMinutesOfDay(arrived), CUTOFF)).toBe(15);
    expect(minutesLate(appZoneMinutesOfDay(recorded), CUTOFF)).toBe(20);
    // Which is why the arrival time is a field rather than a default.
    expect(appZoneMinutesOfDay(arrived)).not.toBe(appZoneMinutesOfDay(recorded));
  });
});
