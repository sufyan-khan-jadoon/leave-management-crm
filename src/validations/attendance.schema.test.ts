import { describe, expect, it } from "vitest";

import {
  RESET_CONFIRMATION,
  RESET_TARGETS,
  markEmployeePresentSchema,
  resetAttendanceSchema,
} from "@/validations/attendance.schema";

/**
 * The typed confirmation, and the shape of the reset grid.
 *
 * Pure parsing, no database — the same reason `working-days` and `geo` are
 * tested here and the services around them are not.
 *
 * These exist because an exact-literal `confirm` refused a lowercase `reset`
 * by leaving the button disabled and saying nothing, which is indistinguishable
 * from a reset that ran and did nothing. The word is a ceremony meant to make
 * somebody stop and type on purpose; the shift key was never part of it.
 */
describe("resetAttendanceSchema", () => {
  const allTime = (confirm: string) =>
    resetAttendanceSchema.safeParse({ range: "ALL_TIME", target: "ALL", confirm });

  it("accepts the confirmation however it was capitalised", () => {
    for (const word of ["RESET", "reset", "Reset", "rEsEt"]) {
      expect(allTime(word).success, word).toBe(true);
    }
  });

  it("accepts it with surrounding whitespace, which a paste brings along", () => {
    expect(allTime("  reset  ").success).toBe(true);
    expect(allTime("\treset\n").success).toBe(true);
  });

  it("still refuses anything that is not the word", () => {
    for (const word of ["", " ", "RESE", "RESETT", "reset all", "delete", "RE SET"]) {
      expect(allTime(word).success, JSON.stringify(word)).toBe(false);
    }
  });

  it("normalises the parsed value, so the service never re-trims it", () => {
    const parsed = allTime("  reset ");
    expect(parsed.success && parsed.data.range === "ALL_TIME" && parsed.data.confirm).toBe(
      RESET_CONFIRMATION,
    );
  });

  /**
   * The grid itself: every target is offered for one date and for all time, and
   * the two ranges differ only in the ceremony. Looping rather than writing
   * eight cases out, because a combination somebody forgot to add is exactly the
   * failure this is meant to catch.
   */
  describe("every target, in both ranges", () => {
    it("takes a single day with a date and no ceremony", () => {
      for (const target of RESET_TARGETS) {
        expect(
          resetAttendanceSchema.safeParse({ range: "DATE", target, date: "2026-08-11" }).success,
          target,
        ).toBe(true);
      }
    });

    it("takes all time with the word, in any case", () => {
      for (const target of RESET_TARGETS) {
        expect(
          resetAttendanceSchema.safeParse({ range: "ALL_TIME", target, confirm: "reset" }).success,
          target,
        ).toBe(true);
      }
    });

    it("refuses all time without the word", () => {
      for (const target of RESET_TARGETS) {
        expect(resetAttendanceSchema.safeParse({ range: "ALL_TIME", target }).success, target).toBe(
          false,
        );
        expect(
          resetAttendanceSchema.safeParse({ range: "ALL_TIME", target, confirm: "yes" }).success,
          target,
        ).toBe(false);
      }
    });

    it("refuses a single day with no date", () => {
      for (const target of RESET_TARGETS) {
        expect(resetAttendanceSchema.safeParse({ range: "DATE", target }).success, target).toBe(
          false,
        );
      }
    });
  });

  /**
   * The two fields cannot be smuggled across. A date on an all-time reset would
   * silently mean nothing, and a confirmation on a single day would suggest a
   * ceremony that branch deliberately does not have.
   */
  it("refuses a date smuggled into an all-time reset", () => {
    expect(
      resetAttendanceSchema.safeParse({
        range: "ALL_TIME",
        target: "ALL",
        confirm: RESET_CONFIRMATION,
        date: "2026-08-11",
      }).success,
    ).toBe(false);
  });

  it("refuses a confirmation on the day branch, which has no ceremony", () => {
    expect(
      resetAttendanceSchema.safeParse({
        range: "DATE",
        target: "ATTENDANCE",
        date: "2026-08-11",
        confirm: RESET_CONFIRMATION,
      }).success,
    ).toBe(false);
  });

  it("refuses a range or a target it has never heard of", () => {
    expect(resetAttendanceSchema.safeParse({ range: "MONTH", target: "ALL" }).success).toBe(false);
    expect(
      resetAttendanceSchema.safeParse({ range: "DATE", target: "EVERYTHING", date: "2026-08-11" })
        .success,
    ).toBe(false);
    expect(resetAttendanceSchema.safeParse({ range: "DATE", date: "2026-08-11" }).success).toBe(
      false,
    );
  });

  /**
   * The shape this replaced. A stale client still sending the flat scope must be
   * refused outright rather than parsed into some neighbouring meaning — the old
   * `ALL_TIME` scope and the new `ALL_TIME` range are not the same request, and
   * one silently read as the other would delete more than was asked for.
   */
  it("refuses the flat scope the grid replaced", () => {
    for (const scope of ["DATE", "ATTENDANCE", "LEAVES", "ABSENCES", "ALL_TIME"]) {
      expect(
        resetAttendanceSchema.safeParse({ scope, confirm: RESET_CONFIRMATION, date: "2026-08-11" })
          .success,
        scope,
      ).toBe(false);
    }
  });
});

/**
 * The body behind "Mark present".
 *
 * The wire, not the two ends — the lesson `admin-chat.schema.test.ts` records,
 * where a client posting its display fields at a `strictObject` failed in
 * production because every check had been driven against the service directly.
 * This schema is strict for the same reason `markAttendanceSchema` is, and the
 * reason is stronger here: that one refuses a client's verdict about a position,
 * and this one refuses a client's verdict about everything.
 */
describe("markEmployeePresentSchema", () => {
  const valid = { employeeId: "cmsjdvtj50002ky04grbvudgv", date: "2026-08-11" };

  it("accepts what the dialog actually sends", () => {
    const parsed = markEmployeePresentSchema.parse({ ...valid, reason: "phone battery died" });

    expect(parsed.employeeId).toBe(valid.employeeId);
    expect(parsed.reason).toBe("phone battery died");
    // Normalised to UTC midnight like every other calendar date here.
    expect(parsed.date.toISOString()).toBe("2026-08-11T00:00:00.000Z");
  });

  it("accepts an omitted reason, as null", () => {
    expect(markEmployeePresentSchema.parse(valid).reason).toBeNull();
  });

  // A blank or whitespace reason is the same as none. Storing "   " would read
  // as a reason having been given.
  it("treats a blank reason as none", () => {
    for (const reason of ["", "   "]) {
      expect(markEmployeePresentSchema.parse({ ...valid, reason }).reason).toBeNull();
    }
  });

  it("requires the date, rather than defaulting to today", () => {
    expect(markEmployeePresentSchema.safeParse({ employeeId: valid.employeeId }).success).toBe(false);
  });

  it("requires somebody to mark", () => {
    expect(markEmployeePresentSchema.safeParse({ date: valid.date }).success).toBe(false);
    expect(markEmployeePresentSchema.safeParse({ ...valid, employeeId: "  " }).success).toBe(false);
  });

  /**
   * The strictness earning its keep. None of these is a field the client may
   * decide: a status other than PRESENT cannot be produced, a check-in time is
   * not known for a day somebody failed to check in, and a position is the one
   * thing this whole path exists because nobody has.
   */
  it("refuses a client trying to supply its own verdict", () => {
    for (const extra of [
      { status: "ABSENT" },
      { status: "PRESENT" },
      { checkInAt: "2026-08-11T09:00:00.000Z" },
      { latitude: 33.6, longitude: 73.0 },
      { distanceMeters: 0 },
      { markedById: "cmsjdvtj50002ky04grbvudgv" },
    ]) {
      expect(markEmployeePresentSchema.safeParse({ ...valid, ...extra }).success, JSON.stringify(extra)).toBe(
        false,
      );
    }
  });

  it("refuses a reason longer than the column expects", () => {
    expect(markEmployeePresentSchema.safeParse({ ...valid, reason: "x".repeat(281) }).success).toBe(false);
  });
});
