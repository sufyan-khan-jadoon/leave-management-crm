/**
 * The self-check-in eligibility rule, tested as the ordering it is.
 *
 * All eight combinations of the three facts are enumerated rather than sampled,
 * for the reason `attendance-edit.test.ts` enumerates its nine ordered pairs and
 * `complaint-status.test.ts` its sixteen: the point of deriving the answer from
 * three booleans is that no combination can be silently unhandled, and a test
 * that picks a few is a test that would not notice.
 *
 * Location is **absent from this file entirely**, and that absence is the
 * headline. `selfCheckInRefusal` cannot be handed a position, a distance or a
 * verdict about one, so there is no argument anybody could pass that would let a
 * day off through — which is the whole of the bug this closes, expressed as a
 * type rather than as a check somebody has to remember.
 */
import { describe, expect, it } from "vitest";

import { selfCheckInRefusal, type SelfCheckInFacts } from "@/lib/self-check-in";

/** An ordinary working day with nothing standing in the way. */
const WORKING: SelfCheckInFacts = { officeClosed: false, isWorkingDay: true, onLeave: false };

describe("selfCheckInRefusal", () => {
  it("allows an ordinary working day", () => {
    expect(selfCheckInRefusal(WORKING)).toBeNull();
  });

  /**
   * The reported defect. 2026-08-22 is a Saturday, outside the seeded
   * Monday-to-Friday week, and it was being recorded as present because the
   * check-in path asked the geofence and never asked the calendar.
   */
  it("refuses a weekly day off", () => {
    const refusal = selfCheckInRefusal({ ...WORKING, isWorkingDay: false });

    expect(refusal).not.toBeNull();
    expect(refusal).toMatch(/day off/i);
    expect(refusal).toMatch(/cannot be marked/i);
  });

  it("refuses a declared office closure", () => {
    expect(selfCheckInRefusal({ ...WORKING, officeClosed: true })).toMatch(/closed/i);
  });

  it("refuses somebody on approved leave", () => {
    expect(selfCheckInRefusal({ ...WORKING, onLeave: true })).toMatch(/leave/i);
  });

  /**
   * A one-off closure declared on a date that is *already* a weekly day off.
   * Both are true, and the closure is the more specific fact — "closed for Eid"
   * tells somebody more than "it's a Sunday". This is `describeDay`'s own
   * ordering, and the two must never name different reasons for one date.
   */
  it("names the closure first when a closure lands on a weekly day off", () => {
    expect(selfCheckInRefusal({ officeClosed: true, isWorkingDay: false, onLeave: false })).toMatch(
      /closed/i,
    );
  });

  it("names the day off ahead of leave, matching the roster", () => {
    expect(selfCheckInRefusal({ officeClosed: false, isWorkingDay: false, onLeave: true })).toMatch(
      /day off/i,
    );
  });

  /**
   * Every combination, so a fourth fact added later cannot leave one unhandled.
   * Exactly one of the eight is allowed, and it is the one where all three say
   * the day is ordinary.
   */
  it("allows exactly one of the eight combinations", () => {
    const allowed: SelfCheckInFacts[] = [];

    for (const officeClosed of [false, true]) {
      for (const isWorkingDay of [false, true]) {
        for (const onLeave of [false, true]) {
          const facts = { officeClosed, isWorkingDay, onLeave };
          if (selfCheckInRefusal(facts) === null) allowed.push(facts);
        }
      }
    }

    expect(allowed).toEqual([WORKING]);
  });

  /**
   * The security property, stated as a property rather than as a scenario: the
   * answer is a function of the three calendar facts and of nothing else. A
   * caller cannot widen it by passing anything extra, because there is nothing
   * extra to pass — being inside the office is judged separately, and afterwards.
   */
  it("refuses a day off however many times it is asked", () => {
    const dayOff = { ...WORKING, isWorkingDay: false };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(selfCheckInRefusal(dayOff)).not.toBeNull();
    }
  });
});
