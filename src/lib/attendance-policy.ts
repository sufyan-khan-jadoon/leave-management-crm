/**
 * When the working day ends, which days are working days at all, and how a run
 * of missed ones is counted.
 *
 * Kept free of Prisma and of the database so the rules can be read — and tested —
 * on their own, exactly as `holiday-notice.ts` is. `attendance-warning.service.ts`
 * decides what to do with the answers.
 */
import { appZoneInstant } from "@/lib/date";

/** 1 = Monday … 7 = Sunday, matching ISO-8601 rather than `Date.getUTCDay()`. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAY_NAMES: Record<IsoWeekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export const MINUTES_IN_DAY = 24 * 60;

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

/** Whether the ordinary week expects anybody in on this date. */
export function isWorkingWeekday(date: Date, workingDays: number[]): boolean {
  return workingDays.includes(isoWeekday(date));
}

/** "17:00" ⇄ 1020. The form speaks the first, every comparison speaks the second. */
export function minutesToTimeLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeLabelToMinutes(label: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(label.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** A twelve-hour reading for the letter and the screens, e.g. "5:00 PM". */
export function friendlyTimeLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;

  return `${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/**
 * The instant the day's cutoff falls, on the company's clock.
 *
 * Measured through `appZoneInstant` rather than by adding an offset: a server in
 * UTC reaches "17:00" five hours after Pakistan does, which is the difference
 * between warning people the same evening and warning them about a deadline that
 * has not arrived.
 */
export function cutoffInstant(day: Date, cutoffMinutes: number): Date {
  return appZoneInstant(day, Math.floor(cutoffMinutes / 60), cutoffMinutes % 60);
}

/** Whether today's deadline to mark attendance has already gone. */
export function hasCutoffPassed(day: Date, cutoffMinutes: number, now: Date = new Date()): boolean {
  return cutoffInstant(day, cutoffMinutes).getTime() <= now.getTime();
}

/**
 * What one past day says about somebody, for the purpose of counting a run.
 *
 * `skip` is the interesting one: a day the office was shut, or that they had
 * booked off, is neither a miss nor a rebuttal of one. Letting it break the run
 * would reset the count every public holiday; letting it count would bill people
 * for days nobody expected them.
 */
export type DayVerdict = "missed" | "present" | "skip";

/**
 * How many working days in a row have been missed, most recent first.
 *
 * `days[0]` is the day being warned about, so the answer is never below 1 for a
 * day that was actually missed. Counting stops at the first day they turned up:
 * that is what ends a run, and nothing before it is this letter's business.
 */
export function countConsecutiveMissed(days: DayVerdict[]): number {
  let count = 0;

  for (const verdict of days) {
    if (verdict === "present") break;
    if (verdict === "missed") count += 1;
    // "skip" passes straight through, neither counting nor ending the run.
  }

  return count;
}

/** "3rd", "1st" — how the letter refers to the run without sounding generated. */
export function ordinal(value: number): string {
  const remainderTen = value % 10;
  const remainderHundred = value % 100;

  if (remainderTen === 1 && remainderHundred !== 11) return `${value}st`;
  if (remainderTen === 2 && remainderHundred !== 12) return `${value}nd`;
  if (remainderTen === 3 && remainderHundred !== 13) return `${value}rd`;

  return `${value}th`;
}
