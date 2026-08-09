/**
 * The working-day rules, tested as calendar arithmetic rather than as an endpoint.
 *
 * Every anchor below is a real 2026 date with its weekday named in a comment, so
 * a reader can check the fixture against a calendar rather than trusting it.
 * 2026-08-10 is a Monday, which makes that week the reference point for most of
 * these: Mon 10, Tue 11, Wed 12, Thu 13, Fri 14, Sat 15, Sun 16, Mon 17.
 *
 * Dates are built at UTC midnight, the convention the whole app stores calendar
 * days in. That is the point of the timezone cases at the bottom: a rule that
 * quietly used the server's local clock would shift a day for anyone west of
 * Greenwich, and 2026-08-14 has to stay the 14th everywhere.
 */
import { describe, expect, it } from "vitest";

import {
  calendarDaysBetween,
  countWorkingDays,
  dayKind,
  describeWeekdays,
  isWorkingDay,
  isWorkingWeekday,
  isoWeekday,
  makeSchedule,
  splitByDayKind,
  weeklyOffDays,
  weeklyOnlySchedule,
  workingDaysBetween,
} from "@/lib/working-days";

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Monday to Friday, the default the app ships with. */
const MON_TO_FRI = [1, 2, 3, 4, 5];

/** Mon–Thu and Saturday worked, Friday and Sunday off — the brief's other org. */
const FRI_SUN_OFF = [1, 2, 3, 4, 6];

const weekdaysOnly = weeklyOnlySchedule(MON_TO_FRI);

function withClosures(workingDays: number[], ...closures: string[]) {
  return makeSchedule(workingDays, closures.map(day));
}

describe("isoWeekday", () => {
  it("calls Monday 1 and Sunday 7", () => {
    expect(isoWeekday(day("2026-08-10"))).toBe(1);
    expect(isoWeekday(day("2026-08-15"))).toBe(6);
    expect(isoWeekday(day("2026-08-16"))).toBe(7);
  });
});

describe("isWorkingWeekday", () => {
  it("expects people in on a Monday", () => {
    expect(isWorkingWeekday(day("2026-08-10"), MON_TO_FRI)).toBe(true);
  });

  it("does not expect anyone on Saturday or Sunday", () => {
    expect(isWorkingWeekday(day("2026-08-15"), MON_TO_FRI)).toBe(false);
    expect(isWorkingWeekday(day("2026-08-16"), MON_TO_FRI)).toBe(false);
  });

  it("honours a six-day week when configured", () => {
    expect(isWorkingWeekday(day("2026-08-15"), [1, 2, 3, 4, 5, 6])).toBe(true);
    expect(isWorkingWeekday(day("2026-08-16"), [1, 2, 3, 4, 5, 6])).toBe(false);
  });

  it("makes no assumption that the weekend is Saturday and Sunday", () => {
    // Friday off, Saturday worked. Nothing in the rule privileges one week over
    // another — this is the whole reason the days are configuration.
    expect(isWorkingWeekday(day("2026-08-14"), FRI_SUN_OFF)).toBe(false);
    expect(isWorkingWeekday(day("2026-08-15"), FRI_SUN_OFF)).toBe(true);
    expect(isWorkingWeekday(day("2026-08-16"), FRI_SUN_OFF)).toBe(false);
  });
});

describe("dayKind", () => {
  it("calls an ordinary Tuesday a working day", () => {
    expect(dayKind(day("2026-08-11"), weekdaysOnly)).toBe("WORKING");
  });

  it("calls a Saturday a weekly day off", () => {
    expect(dayKind(day("2026-08-15"), weekdaysOnly)).toBe("WEEKLY_OFF");
  });

  it("calls a declared closure closed", () => {
    expect(dayKind(day("2026-08-14"), withClosures(MON_TO_FRI, "2026-08-14"))).toBe("CLOSED");
  });

  it("reports a closure falling on an already-off weekday as closed", () => {
    // The specific fact outranks the standing one. It changes nothing about the
    // cost — both are non-working — but "closed for Independence Day" is what
    // the screens should say, not "it was a Saturday anyway".
    expect(dayKind(day("2026-08-15"), withClosures(MON_TO_FRI, "2026-08-15"))).toBe("CLOSED");
  });
});

describe("countWorkingDays — the cases from the brief, Sat/Sun off", () => {
  const cases: Array<[string, string, string, number]> = [
    ["Mon → Mon", "2026-08-10", "2026-08-10", 1],
    ["Fri → Fri", "2026-08-14", "2026-08-14", 1],
    ["Sat → Sat", "2026-08-15", "2026-08-15", 0],
    ["Fri → Mon", "2026-08-14", "2026-08-17", 2],
    ["Thu → Mon", "2026-08-13", "2026-08-17", 3],
    ["Sat → Sun", "2026-08-15", "2026-08-16", 0],
  ];

  for (const [label, from, to, expected] of cases) {
    it(`${label} = ${expected}`, () => {
      expect(countWorkingDays(day(from), day(to), weekdaysOnly)).toBe(expected);
    });
  }
});

describe("countWorkingDays — range shapes", () => {
  it("includes both ends of the range", () => {
    // Mon 10 to Fri 14 inclusive is the whole working week.
    expect(countWorkingDays(day("2026-08-10"), day("2026-08-14"), weekdaysOnly)).toBe(5);
  });

  it("starts on a working day and ends on a day off", () => {
    // Thu 13 → Sun 16: Thu and Fri only.
    expect(countWorkingDays(day("2026-08-13"), day("2026-08-16"), weekdaysOnly)).toBe(2);
  });

  it("starts on a day off and ends on a working day", () => {
    // Sat 15 → Tue 18: Mon and Tue only.
    expect(countWorkingDays(day("2026-08-15"), day("2026-08-18"), weekdaysOnly)).toBe(2);
  });

  it("spans multiple weekends", () => {
    // Fri 14 → Mon 24 holds two weekends: Fri, Mon–Fri, Mon = 7.
    expect(countWorkingDays(day("2026-08-14"), day("2026-08-24"), weekdaysOnly)).toBe(7);
  });

  it("counts a full fortnight as ten days", () => {
    expect(countWorkingDays(day("2026-08-10"), day("2026-08-23"), weekdaysOnly)).toBe(10);
  });

  it("is zero for a backwards range rather than an error", () => {
    expect(countWorkingDays(day("2026-08-17"), day("2026-08-10"), weekdaysOnly)).toBe(0);
  });

  it("follows a week that rests on Friday and Sunday", () => {
    // Thu 13 → Mon 17 under Fri/Sun off: Thu, Sat, Mon = 3.
    expect(countWorkingDays(day("2026-08-13"), day("2026-08-17"), weeklyOnlySchedule(FRI_SUN_OFF))).toBe(3);
  });

  it("counts every day when the whole week is worked", () => {
    const everyDay = weeklyOnlySchedule([1, 2, 3, 4, 5, 6, 7]);
    expect(countWorkingDays(day("2026-08-10"), day("2026-08-16"), everyDay)).toBe(7);
  });
});

describe("countWorkingDays — custom days off", () => {
  it("drops a midweek closure: Mon → Thu with Wednesday off is 3", () => {
    // The brief's example, exactly: Mon and Tue working, Wed a custom day off,
    // Thu working.
    const schedule = withClosures(MON_TO_FRI, "2026-08-12");
    expect(countWorkingDays(day("2026-08-10"), day("2026-08-13"), schedule)).toBe(3);
  });

  it("drops several closures in one range", () => {
    // Mon 10 → Fri 14 with Tue and Thu closed leaves Mon, Wed, Fri.
    const schedule = withClosures(MON_TO_FRI, "2026-08-11", "2026-08-13");
    expect(countWorkingDays(day("2026-08-10"), day("2026-08-14"), schedule)).toBe(3);
  });

  it("costs nothing extra when a closure lands on an already non-working day", () => {
    // Independence Day on the Saturday takes nothing further off the count: the
    // week had already ruled that day out, and a day cannot be skipped twice.
    const schedule = withClosures(MON_TO_FRI, "2026-08-15");
    expect(countWorkingDays(day("2026-08-13"), day("2026-08-17"), schedule)).toBe(3);
  });

  it("can empty a range entirely", () => {
    const schedule = withClosures(MON_TO_FRI, "2026-08-13", "2026-08-14", "2026-08-17");
    expect(countWorkingDays(day("2026-08-13"), day("2026-08-17"), schedule)).toBe(0);
  });

  it("ignores closures outside the range", () => {
    const schedule = withClosures(MON_TO_FRI, "2026-09-14");
    expect(countWorkingDays(day("2026-08-10"), day("2026-08-14"), schedule)).toBe(5);
  });
});

describe("countWorkingDays — crossing boundaries", () => {
  it("crosses the end of a month", () => {
    // Mon 31 Aug → Fri 4 Sep is one ordinary working week split across two months.
    expect(countWorkingDays(day("2026-08-31"), day("2026-09-04"), weekdaysOnly)).toBe(5);
  });

  it("crosses the end of a year", () => {
    // Mon 28 Dec 2026 → Mon 4 Jan 2027: Mon–Thu 28–31, Fri 1 Jan, then Mon 4.
    expect(countWorkingDays(day("2026-12-28"), day("2027-01-04"), weekdaysOnly)).toBe(6);
  });

  it("crosses a year with New Year's Day closed", () => {
    const schedule = withClosures(MON_TO_FRI, "2027-01-01");
    expect(countWorkingDays(day("2026-12-28"), day("2027-01-04"), schedule)).toBe(5);
  });

  it("handles a leap day", () => {
    // 29 Feb 2028 is a Tuesday. Mon 28 → Wed 1 Mar is three working days, and
    // the leap day is not skipped or double-counted.
    expect(countWorkingDays(day("2028-02-28"), day("2028-03-01"), weekdaysOnly)).toBe(3);
    expect(calendarDaysBetween(day("2028-02-28"), day("2028-03-01"))).toHaveLength(3);
  });
});

describe("isWorkingDay", () => {
  it("needs both the week and the calendar to agree", () => {
    const schedule = withClosures(MON_TO_FRI, "2026-08-14");

    expect(isWorkingDay(day("2026-08-13"), schedule)).toBe(true);
    expect(isWorkingDay(day("2026-08-14"), schedule)).toBe(false);
    expect(isWorkingDay(day("2026-08-15"), schedule)).toBe(false);
  });
});

describe("workingDaysBetween", () => {
  it("returns the days themselves, in order", () => {
    const days = workingDaysBetween(day("2026-08-13"), day("2026-08-17"), weekdaysOnly);

    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-08-13",
      "2026-08-14",
      "2026-08-17",
    ]);
  });

  it("keeps every date at UTC midnight", () => {
    for (const date of workingDaysBetween(day("2026-08-10"), day("2026-08-17"), weekdaysOnly)) {
      expect(date.toISOString()).toMatch(/T00:00:00\.000Z$/);
    }
  });
});

describe("splitByDayKind", () => {
  it("sorts a requested range into what each day turned out to be", () => {
    // Thu 13 → Mon 17, with Friday closed for a holiday.
    const schedule = withClosures(MON_TO_FRI, "2026-08-14");
    const range = calendarDaysBetween(day("2026-08-13"), day("2026-08-17"));

    const split = splitByDayKind(range, schedule);
    const iso = (dates: Date[]) => dates.map((d) => d.toISOString().slice(0, 10));

    expect(iso(split.working)).toEqual(["2026-08-13", "2026-08-17"]);
    expect(iso(split.closed)).toEqual(["2026-08-14"]);
    expect(iso(split.weeklyOff)).toEqual(["2026-08-15", "2026-08-16"]);
  });

  it("accounts for every day it was given", () => {
    const range = calendarDaysBetween(day("2026-08-10"), day("2026-08-24"));
    const split = splitByDayKind(range, withClosures(MON_TO_FRI, "2026-08-19"));

    expect(split.working.length + split.weeklyOff.length + split.closed.length).toBe(range.length);
  });
});

describe("timezone safety", () => {
  it("keeps 2026-08-14 the 14th regardless of how the range was walked", () => {
    // The failure this guards against is a range built with local-time
    // arithmetic, which slides a day for anyone behind UTC. Asserting the ISO
    // string rather than the timestamp is what makes it catch that.
    const days = calendarDaysBetween(day("2026-08-13"), day("2026-08-15"));

    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ]);
  });

  it("matches a closure by calendar date, not by instant", () => {
    // A closure fetched with a stray time component must still close its day.
    const schedule = makeSchedule(MON_TO_FRI, [new Date("2026-08-14T18:30:00.000Z")]);
    expect(dayKind(day("2026-08-14"), schedule)).toBe("CLOSED");
  });
});

describe("weeklyOffDays", () => {
  it("is the complement of the working days", () => {
    expect(weeklyOffDays(MON_TO_FRI)).toEqual([6, 7]);
    expect(weeklyOffDays(FRI_SUN_OFF)).toEqual([5, 7]);
    expect(weeklyOffDays([1, 2, 3, 4, 5, 6, 7])).toEqual([]);
  });
});

describe("describeWeekdays", () => {
  it("reads as a sentence", () => {
    expect(describeWeekdays([6, 7])).toBe("Saturday and Sunday");
    expect(describeWeekdays([5])).toBe("Friday");
    expect(describeWeekdays([5, 7])).toBe("Friday and Sunday");
    expect(describeWeekdays([1, 5, 7])).toBe("Monday, Friday and Sunday");
  });

  it("says something rather than nothing for an empty week", () => {
    expect(describeWeekdays([])).toBe("no days");
  });
});
