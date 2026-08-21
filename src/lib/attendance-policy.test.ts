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
  cutoffOutrunsSweep,
  describeHrMarkWindow,
  describeOfficeHours,
  friendlyTimeLabel,
  hasCutoffPassed,
  hrMarkWindowExpiresAt,
  isAfterClosing,
  isHrMarkWindow,
  isTimeOfDay,
  isWithinHrMarkWindow,
  MINUTES_IN_DAY,
  minutesToTimeLabel,
  ordinal,
  timeLabelToMinutes,
  WARNING_SWEEP_MINUTES,
} from "@/lib/attendance-policy";
import { MAX_HR_MARK_WINDOW_MINUTES } from "@/lib/constants";

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

/**
 * The cutoff that outruns the only sweep of the day.
 *
 * Found in production: the sweep is pinned to 17:05 Karachi in `vercel.json` and
 * the cutoff is a setting, so moving it later leaves every run returning
 * `before-cutoff` and nobody ever warned — with an empty warnings table looking
 * exactly like a company where nobody missed a day. These numbers are tied to
 * that cron line and have to move with it.
 */
describe("cutoffOutrunsSweep", () => {
  it("puts the sweep at 17:05, matching `5 12 * * *` UTC in vercel.json", () => {
    expect(WARNING_SWEEP_MINUTES).toBe(17 * 60 + 5);
    // The other direction: that moment is what the cron actually fires at.
    expect(cutoffInstant(day("2026-08-10"), WARNING_SWEEP_MINUTES).toISOString()).toBe(
      "2026-08-10T12:05:00.000Z",
    );
  });

  it("is false for any cutoff the sweep would reach", () => {
    for (const minutes of [0, 9 * 60, FIVE_PM, 16 * 60, 17 * 60 + 4]) {
      expect(cutoffOutrunsSweep(minutes), String(minutes)).toBe(false);
    }
  });

  it("is false at exactly the sweep, because hasCutoffPassed compares with <=", () => {
    expect(cutoffOutrunsSweep(WARNING_SWEEP_MINUTES)).toBe(false);
    // The reason equality is safe, asserted rather than assumed.
    expect(
      hasCutoffPassed(day("2026-08-10"), WARNING_SWEEP_MINUTES, new Date("2026-08-10T12:05:00.000Z")),
    ).toBe(true);
  });

  it("is true from the minute after the sweep onwards", () => {
    for (const minutes of [17 * 60 + 6, 18 * 60, 20 * 60, MINUTES_IN_DAY - 1]) {
      expect(cutoffOutrunsSweep(minutes), String(minutes)).toBe(true);
    }
  });

  it("is what a cutoff past the sweep actually costs: the sweep declines", () => {
    const sixPm = 18 * 60;
    expect(cutoffOutrunsSweep(sixPm)).toBe(true);
    // 12:05 UTC is when the sweep runs; an 18:00 Karachi cutoff is 13:00 UTC,
    // so the deadline has not passed and the sweep writes to nobody.
    expect(hasCutoffPassed(day("2026-08-10"), sixPm, new Date("2026-08-10T12:05:00.000Z"))).toBe(false);
  });

  it("takes the sweep time as an argument, so a moved cron can be checked", () => {
    const ninePm = 21 * 60;
    expect(cutoffOutrunsSweep(18 * 60, ninePm)).toBe(false);
    expect(cutoffOutrunsSweep(21 * 60 + 1, ninePm)).toBe(true);
  });
});

/**
 * The far edge of an arrival an administrator may record by hand.
 *
 * Asked only of a typed time, never of a geofenced check-in — the building
 * reporting somebody at 21:00 is proof, and the schema is explicit that nothing
 * judges a real check-in by the clock. A typed 21:00 is a claim about a time the
 * office was shut, and that is the one kind there is no reason to accept.
 */
describe("isAfterClosing", () => {
  const SEVEN_PM = 19 * 60;

  it("accepts anything up to and including the closing minute", () => {
    for (const minutes of [0, 9 * 60, 13 * 60, 18 * 60 + 59, SEVEN_PM]) {
      expect(isAfterClosing(minutes, SEVEN_PM), String(minutes)).toBe(false);
    }
  });

  it("refuses the minute after, and everything past it", () => {
    expect(isAfterClosing(SEVEN_PM + 1, SEVEN_PM)).toBe(true);
    expect(isAfterClosing(20 * 60 + 30, SEVEN_PM)).toBe(true);
    expect(isAfterClosing(23 * 60 + 59, SEVEN_PM)).toBe(true);
  });

  /**
   * Nothing is refused for being early. Arriving before the doors officially
   * open is ordinary, and the opening time is a published courtesy this file is
   * careful elsewhere not to turn into a verdict.
   */
  it("never refuses an early arrival", () => {
    expect(isAfterClosing(0, SEVEN_PM)).toBe(false);
    expect(isAfterClosing(6 * 60, SEVEN_PM)).toBe(false);
  });

  /**
   * The configuration worth knowing about: when the deadline to appear and the
   * closing time are the same minute — which is what the shipped defaults say —
   * every late arrival is also after closing, so none can be recorded by hand.
   * That is coherent rather than broken, but it is surprising enough to pin.
   */
  it("leaves no recordable window when the cutoff equals closing", () => {
    const both = 17 * 60;

    // On time, so recordable.
    expect(isAfterClosing(both, both)).toBe(false);
    // Any lateness at all is now also past closing.
    expect(isAfterClosing(both + 1, both)).toBe(true);
  });

  it("leaves a window whenever the office closes after the deadline", () => {
    const cutoff = 13 * 60;
    const closing = 19 * 60;

    expect(isAfterClosing(cutoff + 15, closing)).toBe(false);
    expect(isAfterClosing(closing, closing)).toBe(false);
    expect(isAfterClosing(closing + 1, closing)).toBe(true);
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

/**
 * The window a delegated administrator has to record somebody present.
 *
 * Every instant below is UTC and the cutoff is 5:00 PM Karachi = 12:00 UTC, for
 * the reason the file header gives: a rule that started reading the server's
 * local clock would keep passing on a laptop set to Pakistan time and would be
 * five hours wrong in production. These run under `TZ=America/New_York` in CI.
 */
describe("hrMarkWindowExpiresAt", () => {
  it("is the cutoff plus the window, on the company's clock", () => {
    // 5:00 PM Karachi + 20 min = 5:20 PM Karachi = 12:20 UTC.
    expect(hrMarkWindowExpiresAt(day("2026-08-14"), FIVE_PM, 20).toISOString()).toBe(
      "2026-08-14T12:20:00.000Z",
    );
  });

  it("puts a zero window exactly on the cutoff", () => {
    expect(hrMarkWindowExpiresAt(day("2026-08-14"), FIVE_PM, 0).toISOString()).toBe(
      "2026-08-14T12:00:00.000Z",
    );
  });

  it("carries past midnight rather than wrapping back to the same morning", () => {
    // A cutoff of 11:50 PM Karachi on the 14th is 18:50 UTC on the 14th; thirty
    // minutes later is 19:20 UTC, which is 00:20 on the 15th in Karachi. Adding
    // to the *instant* is what gets that right — adding to the minutes-of-day
    // and re-anchoring would have wrapped it to 00:20 on the 14th, sixteen
    // hours before the window was supposed to open.
    expect(hrMarkWindowExpiresAt(day("2026-08-14"), 23 * 60 + 50, 30).toISOString()).toBe(
      "2026-08-14T19:20:00.000Z",
    );
  });
});

describe("isWithinHrMarkWindow", () => {
  const date = day("2026-08-14");
  /** 5:00 PM Karachi on the 14th, in UTC. */
  const at = (utc: string) => new Date(`2026-08-14T${utc}:00.000Z`);

  it("allows a mark inside the window — cutoff 5:00 PM, window 20, now 5:10 PM", () => {
    // Test 1 of the specification. 5:10 PM Karachi = 12:10 UTC.
    expect(isWithinHrMarkWindow(date, FIVE_PM, 20, at("12:10"))).toBe(true);
  });

  it("refuses a mark after the window — now 5:21 PM", () => {
    // Test 2. 12:21 UTC.
    expect(isWithinHrMarkWindow(date, FIVE_PM, 20, at("12:21"))).toBe(false);
  });

  it("treats the exact expiry as closed, not as one last minute", () => {
    // Test 3. The boundary is strict: at 5:20 PM the permission is over.
    expect(isWithinHrMarkWindow(date, FIVE_PM, 20, at("12:20"))).toBe(false);
    // And one millisecond before it is not.
    expect(isWithinHrMarkWindow(date, FIVE_PM, 20, new Date(at("12:20").getTime() - 1))).toBe(true);
  });

  it("makes the duration actually configurable", () => {
    // Test 4. The same instant is inside a 30-minute window and outside a
    // 10-minute one, which is the whole claim the setting makes.
    const quarterPast = at("12:15");

    expect(isWithinHrMarkWindow(date, FIVE_PM, 10, quarterPast)).toBe(false);
    expect(isWithinHrMarkWindow(date, FIVE_PM, 30, quarterPast)).toBe(true);

    // And each closes at its own edge rather than at a shared one.
    expect(isWithinHrMarkWindow(date, FIVE_PM, 10, at("12:09"))).toBe(true);
    expect(isWithinHrMarkWindow(date, FIVE_PM, 30, at("12:29"))).toBe(true);
    expect(isWithinHrMarkWindow(date, FIVE_PM, 30, at("12:30"))).toBe(false);
  });

  it("is open before the cutoff, because the window is a far edge and not a slot", () => {
    // The ordinary case: correcting a day while it is still running. A rule that
    // only permitted marking *after* the deadline would refuse this for no
    // reason anybody could act on.
    expect(isWithinHrMarkWindow(date, FIVE_PM, 20, at("06:00"))).toBe(true);
  });

  it("closes a zero window the instant the cutoff falls", () => {
    // Documented meaning of 0: no time past the deadline, not "switched off".
    expect(isWithinHrMarkWindow(date, FIVE_PM, 0, at("11:59"))).toBe(true);
    expect(isWithinHrMarkWindow(date, FIVE_PM, 0, at("12:00"))).toBe(false);
  });

  it("refuses a date whose window closed on a previous day", () => {
    // This is what stops the window being sat out by waiting until tomorrow and
    // correcting yesterday. Same clock time, a day later.
    expect(isWithinHrMarkWindow(day("2026-08-13"), FIVE_PM, 20, at("12:10"))).toBe(false);
  });

  it("is decided by the company's calendar day, not the server's", () => {
    // 00:30 on the 15th in Karachi is 19:30 UTC on the *14th*. The 14th's window
    // shut hours ago; a rule comparing UTC dates would still call it open.
    expect(isWithinHrMarkWindow(date, FIVE_PM, 20, at("19:30"))).toBe(false);
  });
});

describe("isHrMarkWindow", () => {
  it("accepts the range the panel offers, zero included", () => {
    for (const minutes of [0, 5, 10, 15, 20, 30, 60, MAX_HR_MARK_WINDOW_MINUTES]) {
      expect(isHrMarkWindow(minutes)).toBe(true);
    }
  });

  it("refuses negatives, fractions and anything past the ceiling", () => {
    expect(isHrMarkWindow(-1)).toBe(false);
    expect(isHrMarkWindow(20.5)).toBe(false);
    expect(isHrMarkWindow(MAX_HR_MARK_WINDOW_MINUTES + 1)).toBe(false);
    expect(isHrMarkWindow(Number.NaN)).toBe(false);
  });
});

describe("describeHrMarkWindow", () => {
  it("says what zero means rather than printing '0 minutes'", () => {
    expect(describeHrMarkWindow(0)).toBe("no time past the cutoff");
  });

  it("reads naturally either side of an hour", () => {
    expect(describeHrMarkWindow(1)).toBe("1 minute");
    expect(describeHrMarkWindow(20)).toBe("20 minutes");
    expect(describeHrMarkWindow(60)).toBe("1 hour");
    expect(describeHrMarkWindow(90)).toBe("1 hour 30 minutes");
    expect(describeHrMarkWindow(121)).toBe("2 hours 1 minute");
  });
});
