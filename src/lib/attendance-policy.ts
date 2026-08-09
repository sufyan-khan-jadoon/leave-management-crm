/**
 * When the working day ends, and how a run of missed ones is counted.
 *
 * Kept free of Prisma and of the database so the rules can be read — and tested —
 * on their own, exactly as `holiday-notice.ts` is. `attendance-warning.service.ts`
 * decides what to do with the answers.
 *
 * Which days are working days at all is deliberately *not* here any more: the
 * working week governs leave as well as attendance, so it outgrew this file and
 * lives in `working-days.ts` as the one rule both read.
 */
import { appZoneInstant } from "@/lib/date";

export const MINUTES_IN_DAY = 24 * 60;

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
