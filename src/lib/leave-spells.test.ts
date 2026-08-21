import { describe, expect, it } from "vitest";

import { toIsoDate } from "@/lib/date";
import { groupLeaveSpells, type LeaveSpellDay } from "@/lib/leave-spells";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Leave days as `bookLeave` writes them: one row per working day. */
const leave = (iso: string, reason = "Family wedding"): LeaveSpellDay => ({
  date: day(iso),
  reason,
  status: "APPROVED",
});

/** The weekly days off around the August 2026 weeks these cases use. */
const weekends = new Set(
  ["2026-08-15", "2026-08-16", "2026-08-22", "2026-08-23", "2026-08-29", "2026-08-30"],
);

const shape = (spells: ReturnType<typeof groupLeaveSpells>) =>
  spells.map((spell) => [toIsoDate(spell.from), toIsoDate(spell.to), spell.days]);

describe("groupLeaveSpells", () => {
  it("holds nothing when there is nothing", () => {
    expect(groupLeaveSpells([], weekends)).toEqual([]);
  });

  it("reads one day as a spell of one", () => {
    expect(shape(groupLeaveSpells([leave("2026-08-19")], weekends))).toEqual([
      ["2026-08-19", "2026-08-19", 1],
    ]);
  });

  it("joins consecutive days", () => {
    const spells = groupLeaveSpells(
      [leave("2026-08-19"), leave("2026-08-20"), leave("2026-08-21")],
      weekends,
    );

    expect(shape(spells)).toEqual([["2026-08-19", "2026-08-21", 3]]);
  });

  it("spans a weekend without counting it", () => {
    // Friday and the Monday after: one spell, and **two** days rather than four.
    // The count is the rows, so this file never has to know what a weekend costs.
    const spells = groupLeaveSpells([leave("2026-08-21"), leave("2026-08-24")], weekends);

    expect(shape(spells)).toEqual([["2026-08-21", "2026-08-24", 2]]);
  });

  it("ends the spell at the last leave day, not at the weekend it spanned", () => {
    const [spell] = groupLeaveSpells([leave("2026-08-21"), leave("2026-08-24")], weekends);
    expect(toIsoDate(spell.to)).toBe("2026-08-24");
  });

  it("breaks on a working day back in the office", () => {
    // Nothing bridges the 20th, so this is two separate absences.
    const spells = groupLeaveSpells([leave("2026-08-19"), leave("2026-08-21")], weekends);

    expect(shape(spells)).toEqual([
      ["2026-08-19", "2026-08-19", 1],
      ["2026-08-21", "2026-08-21", 1],
    ]);
  });

  it("breaks when the reason changes, however the dates read", () => {
    const spells = groupLeaveSpells(
      [leave("2026-08-19", "Family wedding"), leave("2026-08-20", "Medical appointment")],
      weekends,
    );

    expect(shape(spells)).toEqual([
      ["2026-08-19", "2026-08-19", 1],
      ["2026-08-20", "2026-08-20", 1],
    ]);
    expect(spells.map((spell) => spell.reason)).toEqual(["Family wedding", "Medical appointment"]);
  });

  it("bridges a declared closure exactly as it bridges a weekend", () => {
    // An office closure on the Thursday: the days either side are one spell of
    // two, and the closure costs nobody a day — which is why it is not counted.
    const bridged = new Set([...weekends, "2026-08-20"]);
    const spells = groupLeaveSpells([leave("2026-08-19"), leave("2026-08-21")], bridged);

    expect(shape(spells)).toEqual([["2026-08-19", "2026-08-21", 2]]);
  });

  it("orders days it was handed out of order", () => {
    const spells = groupLeaveSpells(
      [leave("2026-08-21"), leave("2026-08-19"), leave("2026-08-20")],
      weekends,
    );

    expect(shape(spells)).toEqual([["2026-08-19", "2026-08-21", 3]]);
  });

  it("never merges across a gap wider than the days off inside it", () => {
    // A fortnight apart, with two weekends between — but working days too.
    const spells = groupLeaveSpells([leave("2026-08-19"), leave("2026-09-02")], weekends);
    expect(spells).toHaveLength(2);
  });
});
