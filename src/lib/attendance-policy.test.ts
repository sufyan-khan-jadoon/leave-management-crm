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
  friendlyTimeLabel,
  hasCutoffPassed,
  isWorkingWeekday,
  isoWeekday,
  minutesToTimeLabel,
  ordinal,
  timeLabelToMinutes,
} from "@/lib/attendance-policy";

const FIVE_PM = 17 * 60;

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe("isoWeekday", () => {
  it("calls Monday 1 and Sunday 7", () => {
    // 2026-08-10 is a Monday.
    expect(isoWeekday(day("2026-08-10"))).toBe(1);
    expect(isoWeekday(day("2026-08-15"))).toBe(6);
    expect(isoWeekday(day("2026-08-16"))).toBe(7);
  });
});

describe("isWorkingWeekday", () => {
  const monToFri = [1, 2, 3, 4, 5];

  it("expects people in on a Monday", () => {
    expect(isWorkingWeekday(day("2026-08-10"), monToFri)).toBe(true);
  });

  it("does not expect anyone on Saturday or Sunday", () => {
    expect(isWorkingWeekday(day("2026-08-15"), monToFri)).toBe(false);
    expect(isWorkingWeekday(day("2026-08-16"), monToFri)).toBe(false);
  });

  it("honours a six-day week when configured", () => {
    expect(isWorkingWeekday(day("2026-08-15"), [1, 2, 3, 4, 5, 6])).toBe(true);
    expect(isWorkingWeekday(day("2026-08-16"), [1, 2, 3, 4, 5, 6])).toBe(false);
  });
});

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
