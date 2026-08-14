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
import { MAX_HR_MARK_WINDOW_MINUTES, MIN_HR_MARK_WINDOW_MINUTES } from "@/lib/constants";
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
 * Whether a stored minutes-after-midnight value is a real time of day.
 *
 * One question asked by the cutoff, the opening and the closing alike, so a new
 * time-of-day setting cannot arrive with a looser idea of what a clock is.
 */
export function isTimeOfDay(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0 && minutes < MINUTES_IN_DAY;
}

/**
 * The office hours as a sentence, e.g. "9:00 AM to 5:00 PM".
 *
 * Written here rather than in the assistant so the panel, the screens and the
 * chat reply all quote the hours in one wording — the reply is read out to
 * employees, and two phrasings of one fact is how they come to disagree.
 */
export function describeOfficeHours(openingMinutes: number, closingMinutes: number): string {
  return `${friendlyTimeLabel(openingMinutes)} to ${friendlyTimeLabel(closingMinutes)}`;
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
 * The instant a delegated administrator stops being able to record somebody
 * present for `day`.
 *
 * Derived from the day's own cutoff rather than from when anybody opened a
 * screen, which is the whole security property: the deadline is a fact about the
 * date, so refreshing the page, signing out and back in, or leaving a tab open
 * overnight all arrive at the same answer. Nothing about it is stored, and
 * nothing needs to be — `cutoffInstant` reads the company's clock through
 * `appZoneInstant`, so a server in UTC computes the same moment a server in
 * Karachi does.
 *
 * A window of zero puts the expiry exactly on the cutoff, which is coherent
 * rather than degenerate: recording stays possible until the deadline and stops
 * when it falls. See `MIN_HR_MARK_WINDOW_MINUTES`.
 */
export function hrMarkWindowExpiresAt(day: Date, cutoffMinutes: number, windowMinutes: number): Date {
  return new Date(cutoffInstant(day, cutoffMinutes).getTime() + windowMinutes * 60_000);
}

/**
 * Whether that window is still open.
 *
 * **Strictly before the expiry.** At exactly `cutoff + window` the permission is
 * over — a boundary that "counts as inside" is one that has to be re-argued at
 * every call site, and the configured expiry is more useful as a promise that
 * nothing lands on it than as one more minute nobody asked for.
 *
 * Note what this deliberately does *not* ask: whether the cutoff has passed at
 * all. Before the deadline the window is trivially open, which is right — the
 * ordinary case is an administrator correcting a day while it is still running,
 * and a rule that only permitted marking *after* the cutoff would refuse that
 * for no reason. The window is a far edge, not a slot.
 *
 * A date in the past is refused for free: its cutoff, and therefore its expiry,
 * is long gone. That is the point rather than a side effect — a window somebody
 * could sit out by waiting until tomorrow and correcting yesterday would not be
 * a window at all.
 */
export function isWithinHrMarkWindow(
  day: Date,
  cutoffMinutes: number,
  windowMinutes: number,
  now: Date = new Date(),
): boolean {
  return now.getTime() < hrMarkWindowExpiresAt(day, cutoffMinutes, windowMinutes).getTime();
}

/**
 * Whether a stored window is a usable one.
 *
 * Asked by the policy service as well as the schema, for the reason the cutoff's
 * own `isTimeOfDay` check is asked twice: a nonsensical value here would not
 * fail loudly, it would quietly decide that nobody may correct anything.
 */
export function isHrMarkWindow(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= MIN_HR_MARK_WINDOW_MINUTES &&
    minutes <= MAX_HR_MARK_WINDOW_MINUTES
  );
}

/**
 * "14:32" — a duration counting down, as a clock reads.
 *
 * Minutes and seconds even past an hour ("75:04" rather than "1:15:04"), because
 * the thing being counted is a grace period bounded at four hours and the reader
 * is watching it run out. A field that changes width when it crosses an hour
 * makes the number jump about while somebody is watching it.
 *
 * Floors at zero rather than counting negatives: an expired window has no time
 * left, and "-00:07" invites the reader to wonder whether it is still usable.
 */
export function formatWindowCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * "20 minutes", "1 hour 30 minutes" — the window as a phrase.
 *
 * Its own wording rather than `describeLateness`: that one is an accusation
 * about a person and ends in "late", and this is a duration of permission.
 */
export function describeHrMarkWindow(minutes: number): string {
  if (minutes === 0) return "no time past the cutoff";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;

  return rest === 0 ? hourPart : `${hourPart} ${rest} minute${rest === 1 ? "" : "s"}`;
}

/**
 * Whether an arrival falls after the office shut for the day.
 *
 * Asked **only** of a time an administrator has typed, never of a geofenced
 * check-in, and that asymmetry is the argument rather than an oversight. A
 * check-in at 21:00 is the building reporting that somebody was standing in it
 * at 21:00 — proof, and the schema says in as many words that nothing judges a
 * real check-in by the clock. An administrator entering 21:00 is making a claim
 * with nothing behind it, and a claim about a time the office was not open is
 * the one kind there is no reason to accept.
 *
 * The closing minute itself is inside. Somebody walking in as the doors are
 * locked did arrive at the office, and refusing the boundary would make the
 * published closing time mean one minute earlier than it says.
 *
 * **Nothing is refused for being too early.** Only the closing edge is checked,
 * because arriving before the doors officially open is ordinary and is not what
 * was asked about — and because the opening time is a published courtesy, which
 * this file is careful elsewhere not to turn into a verdict.
 */
export function isAfterClosing(minutesOfDay: number, closingMinutes: number): boolean {
  return minutesOfDay > closingMinutes;
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
