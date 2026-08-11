import { describe, expect, it } from "vitest";

import { RESET_CONFIRMATION, resetAttendanceSchema } from "@/validations/attendance.schema";

/**
 * The typed confirmation, and the shape of the two resets.
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
  const allTime = (confirm: string) => resetAttendanceSchema.safeParse({ scope: "ALL_TIME", confirm });

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

  it("refuses an all-time reset with no confirmation at all", () => {
    expect(resetAttendanceSchema.safeParse({ scope: "ALL_TIME" }).success).toBe(false);
  });

  it("normalises the parsed value, so the service never re-trims it", () => {
    const parsed = allTime("  reset ");
    expect(parsed.success && parsed.data.scope === "ALL_TIME" && parsed.data.confirm).toBe(
      RESET_CONFIRMATION,
    );
  });

  it("refuses a date smuggled into an all-time reset", () => {
    expect(
      resetAttendanceSchema.safeParse({
        scope: "ALL_TIME",
        confirm: RESET_CONFIRMATION,
        date: "2026-08-11",
      }).success,
    ).toBe(false);
  });

  it("takes a single day without a confirmation, and requires its date", () => {
    expect(resetAttendanceSchema.safeParse({ scope: "DATE", date: "2026-08-11" }).success).toBe(true);
    expect(resetAttendanceSchema.safeParse({ scope: "DATE" }).success).toBe(false);
  });

  it("refuses a confirmation on the day branch, which has no ceremony", () => {
    expect(
      resetAttendanceSchema.safeParse({
        scope: "DATE",
        date: "2026-08-11",
        confirm: RESET_CONFIRMATION,
      }).success,
    ).toBe(false);
  });

  it("refuses a scope it has never heard of", () => {
    expect(resetAttendanceSchema.safeParse({ scope: "EVERYTHING" }).success).toBe(false);
  });
});
