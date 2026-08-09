/**
 * What counts as a working day, and how many of them a range holds.
 *
 * Two rules, in this order: the ordinary week says which weekdays anybody works
 * at all, and a declared closure overrides it for one specific date. A date is a
 * working day only when the week admits it *and* nothing has closed the office
 * on it.
 *
 * Kept free of Prisma so the rules can be read and tested on their own, exactly
 * as `geo.ts` and `holiday-notice.ts` are — `working-days.service.ts` is what
 * fetches a schedule and hands it in. Everything here takes the schedule as an
 * argument rather than reaching for it, so there is nothing to stub and no way
 * for a test to disagree with production.
 *
 * This is the single source of truth. Leave duration, the attendance roster and
 * the warning sweep all decide "is this a working day?" here and nowhere else.
 */
import { addUtcDays, toIsoDate } from "@/lib/date";

/** 1 = Monday … 7 = Sunday, matching ISO-8601 rather than `Date.getUTCDay()`. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly IsoWeekday[];

export const WEEKDAY_NAMES: Record<IsoWeekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/**
 * The organisation's schedule, resolved for some span of dates.
 *
 * `closedDates` is keyed by ISO calendar date rather than by timestamp on
 * purpose: the business rule is about calendar days, and two `Date` objects for
 * the same day compare unequal the moment one of them picks up a time
 * component. Comparing the strings cannot drift.
 *
 * A schedule only knows about the closures it was built with, so it is only
 * meaningful over the range it was fetched for. Ask the service for one that
 * covers the dates you are about to judge.
 */
export type WorkingSchedule = {
  workingDays: readonly number[];
  closedDates: ReadonlySet<string>;
};

/** Why a date is not a working day — or that it is. */
export type DayKind =
  /** The week works this day and nothing has closed the office on it. */
  | "WORKING"
  /** Outside the ordinary working week: a weekend, for most companies. */
  | "WEEKLY_OFF"
  /** A specific date the whole office is closed. Outranks the ordinary week. */
  | "CLOSED";

/**
 * ISO weekday for a calendar date.
 *
 * `getUTCDay()` calls Sunday 0, which sorts the week wrongly and makes "Mon–Fri"
 * an awkward set to write down. Shifting to 1–7 with Monday first means a
 * working week is a contiguous range.
 */
export function isoWeekday(date: Date): IsoWeekday {
  const day = date.getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/**
 * Whether the ordinary week expects anybody in on this date.
 *
 * The weekly half of the rule on its own. Callers that also have to respect
 * declared closures want `isWorkingDay`; this exists for the places that hold
 * the two apart deliberately, such as deciding whether a closure is worth
 * announcing.
 */
export function isWorkingWeekday(date: Date, workingDays: readonly number[]): boolean {
  return workingDays.includes(isoWeekday(date));
}

/** Builds a schedule from the stored week and the closures covering a span. */
export function makeSchedule(workingDays: readonly number[], closedDates: readonly Date[]): WorkingSchedule {
  return { workingDays, closedDates: new Set(closedDates.map(toIsoDate)) };
}

/** A schedule that closes nothing — the ordinary week and no more. */
export function weeklyOnlySchedule(workingDays: readonly number[]): WorkingSchedule {
  return { workingDays, closedDates: new Set<string>() };
}

/**
 * What one date amounts to.
 *
 * The closure is checked first because it is the more specific fact: "closed for
 * Eid" says more than "it is a Sunday", and a closure declared on a day that was
 * already off the ordinary week is still a closure.
 */
export function dayKind(date: Date, schedule: WorkingSchedule): DayKind {
  if (schedule.closedDates.has(toIsoDate(date))) return "CLOSED";
  return isWorkingWeekday(date, schedule.workingDays) ? "WORKING" : "WEEKLY_OFF";
}

/** Whether anybody is expected to work on this date. */
export function isWorkingDay(date: Date, schedule: WorkingSchedule): boolean {
  return dayKind(date, schedule) === "WORKING";
}

/**
 * Every calendar day from `from` to `to`, both ends included.
 *
 * Walked a day at a time through `addUtcDays` rather than by adding 86,400,000
 * milliseconds: the two agree in UTC today, but the arithmetic one is the sort
 * that quietly starts losing a day an hour if these ever become local dates.
 * A backwards range is empty rather than an error — "no days" is the honest
 * answer to a range that holds none.
 */
export function calendarDaysBetween(from: Date, to: Date): Date[] {
  const days: Date[] = [];

  for (let day = from; day.getTime() <= to.getTime(); day = addUtcDays(day, 1)) {
    days.push(day);
  }

  return days;
}

/** The working days in an inclusive range, in order. */
export function workingDaysBetween(from: Date, to: Date, schedule: WorkingSchedule): Date[] {
  return calendarDaysBetween(from, to).filter((day) => isWorkingDay(day, schedule));
}

/**
 * How many working days an inclusive range holds.
 *
 * This is the number a leave request costs. Both ends count, every day between
 * them is examined, and anything the week or a closure rules out is skipped —
 * so Friday to Monday over a Sat/Sun weekend is 2, not 4.
 */
export function countWorkingDays(from: Date, to: Date, schedule: WorkingSchedule): number {
  return workingDaysBetween(from, to, schedule).length;
}

/** A set of dates sorted into what each of them turned out to be. */
export type DaySplit = {
  working: Date[];
  weeklyOff: Date[];
  closed: Date[];
};

/**
 * Sorts a list of dates by what each one is.
 *
 * Leave needs all three answers rather than just a count: the working days are
 * what gets booked, and the other two are what the employee is told was left out
 * so a five-day request coming back as three does not read as a miscount.
 */
export function splitByDayKind(dates: readonly Date[], schedule: WorkingSchedule): DaySplit {
  const split: DaySplit = { working: [], weeklyOff: [], closed: [] };

  for (const date of dates) {
    const kind = dayKind(date, schedule);

    if (kind === "CLOSED") split.closed.push(date);
    else if (kind === "WEEKLY_OFF") split.weeklyOff.push(date);
    else split.working.push(date);
  }

  return split;
}

/** "Saturday and Sunday", "Friday" — how a set of days off reads in a sentence. */
export function describeWeekdays(days: readonly number[]): string {
  const names = [...new Set(days)]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_NAMES[day as IsoWeekday])
    .filter(Boolean);

  if (names.length === 0) return "no days";
  if (names.length === 1) return names[0];

  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The days of the week the schedule does *not* work, ascending. */
export function weeklyOffDays(workingDays: readonly number[]): IsoWeekday[] {
  return ISO_WEEKDAYS.filter((day) => !workingDays.includes(day));
}
