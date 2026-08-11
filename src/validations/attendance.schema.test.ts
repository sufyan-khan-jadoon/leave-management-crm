import { describe, expect, it } from "vitest";

import {
  RESET_CONFIRMATION,
  RESET_TARGETS,
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
