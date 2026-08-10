/**
 * The attendance-warning rules, tested against the company's clock rather than
 * the server's.
 *
 * `APP_TIME_ZONE` is Asia/Karachi (UTC+5) — the zone all of Pakistan keeps,
 * Islamabad included — so 17:00 there is 12:00 UTC. Every expectation below is
 * written in UTC on purpose: if the cutoff ever starts reading the server's
 * local clock these numbers stop lining up, which is the bug worth catching. It
 * is invisible on a laptop already set to Pakistan time and shows up in
 * production as warning letters five hours early.
 */
import { describe, expect, it } from "vitest";

import {
  countConsecutiveMissed,
  cutoffInstant,
  describeOfficeHours,
  friendlyTimeLabel,
  hasCutoffPassed,
  isTimeOfDay,
  MINUTES_IN_DAY,
  minutesToTimeLabel,
  ordinal,
  timeLabelToMinutes,
} from "@/lib/attendance-policy";

const FIVE_PM = 17 * 60;

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

// `isoWeekday` and `isWorkingWeekday` moved to `working-days.ts` when the
// working week grew to govern leave as well as attendance; they are covered in
// `working-days.test.ts`.

describe("cutoffInstant", () => {
  it("is 5pm on the company's clock, not the server's", () => {
    // 17:00 in Karachi (UTC+5) is 12:00 UTC.
    expect(cutoffInstant(day("2026-08-10"), FIVE_PM).toISOString()).toBe("2026-08-10T12:00:00.000Z");
  });

  it("handles a cutoff with minutes", () => {
    // 09:30 Karachi = 04:30 UTC.
    expect(cutoffInstant(day("2026-08-10"), 9 * 60 + 30).toISOString()).toBe("2026-08-10T04:30:00.000Z");
  });

  it("handles a cutoff early enough to land on the same UTC day", () => {
    // 03:00 Karachi = 22:00 UTC the previous day.
    expect(cutoffInstant(day("2026-08-10"), 3 * 60).toISOString()).toBe("2026-08-09T22:00:00.000Z");
  });
});

describe("hasCutoffPassed", () => {
  it("is false a minute before 5pm in Pakistan", () => {
    expect(hasCutoffPassed(day("2026-08-10"), FIVE_PM, new Date("2026-08-10T11:59:00.000Z"))).toBe(false);
  });

  it("is true exactly at 5pm", () => {
    expect(hasCutoffPassed(day("2026-08-10"), FIVE_PM, new Date("2026-08-10T12:00:00.000Z"))).toBe(true);
  });

  it("is true at the moment the sweep runs, 17:05", () => {
    expect(hasCutoffPassed(day("2026-08-10"), FIVE_PM, new Date("2026-08-10T12:05:00.000Z"))).toBe(true);
  });

  it("is still false at noon UTC-morning, which is 5pm only for a UTC server", () => {
    // 07:00 UTC is midday in Karachi — nowhere near the cutoff. A rule reading
    // the server's clock would already have fired.
    expect(hasCutoffPassed(day("2026-08-10"), FIVE_PM, new Date("2026-08-10T07:00:00.000Z"))).toBe(false);
  });
});

describe("countConsecutiveMissed", () => {
  it("counts a single missed day as one", () => {
    expect(countConsecutiveMissed(["missed"])).toBe(1);
  });

  it("counts a run", () => {
    expect(countConsecutiveMissed(["missed", "missed", "missed"])).toBe(3);
  });

  it("stops at the day they turned up", () => {
    expect(countConsecutiveMissed(["missed", "missed", "present", "missed"])).toBe(2);
  });

  it("passes straight through a closure without breaking the run", () => {
    // Missed Monday, office shut Friday, missed Thursday — still a run of two.
    expect(countConsecutiveMissed(["missed", "skip", "missed", "present"])).toBe(2);
  });

  it("passes straight through approved leave without counting it", () => {
    expect(countConsecutiveMissed(["missed", "skip", "skip", "present"])).toBe(1);
  });

  it("does not count a run of skips as misses", () => {
    expect(countConsecutiveMissed(["skip", "skip", "skip"])).toBe(0);
  });

  it("is zero when they were present on the day itself", () => {
    expect(countConsecutiveMissed(["present", "missed", "missed"])).toBe(0);
  });
});

describe("time labels", () => {
  it("round-trips 5pm", () => {
    expect(minutesToTimeLabel(FIVE_PM)).toBe("17:00");
    expect(timeLabelToMinutes("17:00")).toBe(FIVE_PM);
  });

  it("round-trips a time with minutes", () => {
    expect(minutesToTimeLabel(9 * 60 + 30)).toBe("09:30");
    expect(timeLabelToMinutes("09:30")).toBe(9 * 60 + 30);
  });

  it("rejects nonsense rather than guessing", () => {
    expect(timeLabelToMinutes("25:00")).toBeNull();
    expect(timeLabelToMinutes("17:99")).toBeNull();
    expect(timeLabelToMinutes("evening")).toBeNull();
    expect(timeLabelToMinutes("")).toBeNull();
  });

  it("reads back in twelve-hour form for the letter", () => {
    expect(friendlyTimeLabel(FIVE_PM)).toBe("5:00 PM");
    expect(friendlyTimeLabel(9 * 60 + 30)).toBe("9:30 AM");
    expect(friendlyTimeLabel(0)).toBe("12:00 AM");
    expect(friendlyTimeLabel(12 * 60)).toBe("12:00 PM");
  });
});

describe("isTimeOfDay", () => {
  it("accepts every minute of a real day, and the boundaries", () => {
    expect(isTimeOfDay(0)).toBe(true);
    expect(isTimeOfDay(MINUTES_IN_DAY - 1)).toBe(true);
    expect(isTimeOfDay(FIVE_PM)).toBe(true);
  });

  it("refuses anything that is not a minute on a clock", () => {
    expect(isTimeOfDay(-1)).toBe(false);
    expect(isTimeOfDay(MINUTES_IN_DAY)).toBe(false);
    expect(isTimeOfDay(9.5)).toBe(false);
    expect(isTimeOfDay(Number.NaN)).toBe(false);
  });
});

describe("describeOfficeHours", () => {
  it("reads as the sentence the assistant says out loud", () => {
    expect(describeOfficeHours(9 * 60, FIVE_PM)).toBe("9:00 AM to 5:00 PM");
    expect(describeOfficeHours(8 * 60 + 30, 16 * 60)).toBe("8:30 AM to 4:00 PM");
  });

  it("spans noon and midnight without losing the meridiem", () => {
    expect(describeOfficeHours(0, 12 * 60)).toBe("12:00 AM to 12:00 PM");
    expect(describeOfficeHours(12 * 60, MINUTES_IN_DAY - 1)).toBe("12:00 PM to 11:59 PM");
  });
});

describe("ordinal", () => {
  it("handles the ordinary cases", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
  });

  it("handles the teens, which are the ones that catch people out", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
  });
});
