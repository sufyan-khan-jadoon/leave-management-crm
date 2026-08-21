/**
 * The historical-editing rules, tested on their own.
 *
 * `planAttendanceEdit` is enumerated over all nine ordered pairs rather than
 * tested by example — the whole point of deriving the plan from two booleans is
 * that no combination can be silently unhandled, and only enumeration proves it.
 */
import { describe, expect, it } from "vitest";

import {
  EDITABLE_DAY_STATUSES,
  isEditableDayStatus,
  isHistoricalDate,
  isNoOp,
  planAttendanceEdit,
  type EditableDayStatus,
} from "@/lib/attendance-edit";
import type { AttendanceDayStatus } from "@/types";

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe("EDITABLE_DAY_STATUSES", () => {
  it("is exactly the three statuses a person can hold", () => {
    expect([...EDITABLE_DAY_STATUSES]).toEqual(["PRESENT", "ABSENT", "ON_LEAVE"]);
  });

  /**
   * The five exclusions, each for a reason stated elsewhere in the codebase:
   * closures and the working week belong to the calendar, remote is
   * attendance-exempt, the future has not happened, and an unwatched day would
   * accuse every colleague at once if one row were written into it.
   */
  it("refuses every status that belongs to the calendar rather than the person", () => {
    const notEditable: AttendanceDayStatus[] = [
      "CLOSED",
      "NON_WORKING",
      "REMOTE",
      "UPCOMING",
      "NO_RECORD",
    ];

    for (const status of notEditable) {
      expect(isEditableDayStatus(status), status).toBe(false);
    }
  });

  it("accepts the three that are", () => {
    for (const status of EDITABLE_DAY_STATUSES) {
      expect(isEditableDayStatus(status), status).toBe(true);
    }
  });
});

/**
 * Strictly before today, because today already has an editor — the hr-mark
 * window — and reaching it from here would hand the same people an unbounded
 * version of that permission by a second door.
 */
describe("isHistoricalDate", () => {
  const today = day("2026-08-22");

  it("accepts yesterday and everything before it", () => {
    expect(isHistoricalDate(day("2026-08-21"), today)).toBe(true);
    expect(isHistoricalDate(day("2026-07-31"), today)).toBe(true);
    expect(isHistoricalDate(day("2025-01-01"), today)).toBe(true);
  });

  it("refuses today itself", () => {
    expect(isHistoricalDate(today, today)).toBe(false);
  });

  it("refuses tomorrow and beyond", () => {
    expect(isHistoricalDate(day("2026-08-23"), today)).toBe(false);
    expect(isHistoricalDate(day("2027-01-01"), today)).toBe(false);
  });

  it("crosses a month and a year boundary without special-casing either", () => {
    expect(isHistoricalDate(day("2025-12-31"), day("2026-01-01"))).toBe(true);
    expect(isHistoricalDate(day("2026-01-01"), day("2025-12-31"))).toBe(false);
  });
});

describe("planAttendanceEdit", () => {
  /**
   * All nine ordered pairs. The three diagonals are no-ops and every other cell
   * writes something, which is the invariant the service depends on when it
   * refuses a move to the status a day already holds.
   */
  it("makes every same-status pair a no-op and no others", () => {
    for (const from of EDITABLE_DAY_STATUSES) {
      for (const to of EDITABLE_DAY_STATUSES) {
        expect(isNoOp(planAttendanceEdit(from, to)), `${from} -> ${to}`).toBe(from === to);
      }
    }
  });

  it("turns an absent day present by writing a check-in and nothing else", () => {
    expect(planAttendanceEdit("ABSENT", "PRESENT")).toEqual({
      needsCheckIn: true,
      removesCheckIn: false,
      needsLeave: false,
      removesLeave: false,
    });
  });

  /**
   * Absence is the *lack* of a row, so this is a delete rather than a status
   * update — there is no status column to move, `AttendanceStatus` having one
   * value.
   */
  it("turns a present day absent by removing the check-in", () => {
    expect(planAttendanceEdit("PRESENT", "ABSENT")).toEqual({
      needsCheckIn: false,
      removesCheckIn: true,
      needsLeave: false,
      removesLeave: false,
    });
  });

  /**
   * The transition that touches both tables, and the one that hands the
   * allowance back: clearing the leave is what stops the day costing them a day
   * they did not take.
   */
  it("turns a leave day present by clearing the leave and writing the check-in", () => {
    expect(planAttendanceEdit("ON_LEAVE", "PRESENT")).toEqual({
      needsCheckIn: true,
      removesCheckIn: false,
      needsLeave: false,
      removesLeave: true,
    });
  });

  it("turns a leave day absent by clearing the leave alone", () => {
    expect(planAttendanceEdit("ON_LEAVE", "ABSENT")).toEqual({
      needsCheckIn: false,
      removesCheckIn: false,
      needsLeave: false,
      removesLeave: true,
    });
  });

  it("turns a present day into leave by removing the check-in and booking it", () => {
    expect(planAttendanceEdit("PRESENT", "ON_LEAVE")).toEqual({
      needsCheckIn: false,
      removesCheckIn: true,
      needsLeave: true,
      removesLeave: false,
    });
  });

  it("turns an absent day into leave by booking it alone", () => {
    expect(planAttendanceEdit("ABSENT", "ON_LEAVE")).toEqual({
      needsCheckIn: false,
      removesCheckIn: false,
      needsLeave: true,
      removesLeave: false,
    });
  });

  /**
   * The two tables are never asked to do contradictory things in one move. A
   * plan that both wrote and removed a check-in would leave the day's meaning
   * depending on which ran last.
   */
  it("never both writes and removes the same record", () => {
    for (const from of EDITABLE_DAY_STATUSES) {
      for (const to of EDITABLE_DAY_STATUSES) {
        const plan = planAttendanceEdit(from, to);

        expect(plan.needsCheckIn && plan.removesCheckIn, `${from} -> ${to}`).toBe(false);
        expect(plan.needsLeave && plan.removesLeave, `${from} -> ${to}`).toBe(false);
      }
    }
  });

  /**
   * The plan is a function of the destination as much as the source: whatever a
   * day was, asking for PRESENT must leave a check-in behind and no leave in the
   * way, because `describeDay` reads the check-in first and the leave third.
   */
  it("always leaves the day able to read as the status that was asked for", () => {
    for (const from of EDITABLE_DAY_STATUSES) {
      for (const to of EDITABLE_DAY_STATUSES) {
        const plan = planAttendanceEdit(from, to);
        const hasCheckIn = plan.needsCheckIn || (from === "PRESENT" && !plan.removesCheckIn);
        const hasLeave = plan.needsLeave || (from === "ON_LEAVE" && !plan.removesLeave);

        const reads: EditableDayStatus = hasCheckIn ? "PRESENT" : hasLeave ? "ON_LEAVE" : "ABSENT";

        expect(reads, `${from} -> ${to}`).toBe(to);
      }
    }
  });
});
