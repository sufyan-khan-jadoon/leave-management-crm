/**
 * Leave dates are calendar days, not instants. Every helper here normalises to
 * UTC midnight so a leave taken on the 14th reads as the 14th regardless of the
 * server's local timezone.
 *
 * Timestamps are a different matter: "created 5 minutes ago" has to read
 * against the company's wall clock, so those are formatted in APP_TIME_ZONE.
 */
import { APP_TIME_ZONE } from "@/lib/constants";

export function toUtcDay(value: Date | string): Date {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : value;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Today's calendar day in the company's timezone, as UTC midnight.
 *
 * Not `toUtcDay(new Date())`: the server runs in UTC, so for the five hours
 * after local midnight that returns yesterday's date for anyone in Pakistan —
 * which made "3 days from today" start on the wrong day.
 */
export function todayUtc(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return new Date(`${parts}T00:00:00.000Z`);
}

/**
 * What the company's wall clock reads at `instant`, expressed as if that
 * reading were UTC. Subtracting the instant gives the zone's offset.
 */
function appZoneReading(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const field = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);

  // Midnight comes back as hour 24 in some ICU versions; both mean the same day.
  return Date.UTC(field("year"), field("month") - 1, field("day"), field("hour") % 24, field("minute"), field("second"));
}

/**
 * The instant at which the company's clock reads `hour:00` on calendar day
 * `day` — the bridge between "noon on the 16th" and a moment the server can
 * compare against `Date.now()`.
 *
 * Resolved by measuring the zone's offset rather than assuming one, then
 * measuring again at the answer: an offset that changes across a daylight-saving
 * boundary is only correct once applied. Asia/Karachi has no DST today, but the
 * timezone is a setting, and this is the one calculation where being an hour out
 * means announcing a closure at the wrong time.
 */
export function appZoneInstant(day: Date, hour: number, minute = 0): Date {
  const wallClock = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute);

  const firstPass = new Date(wallClock - (appZoneReading(new Date(wallClock)) - wallClock));
  return new Date(wallClock - (appZoneReading(firstPass) - firstPass.getTime()));
}

/** Current wall-clock time in the company's timezone, e.g. "3:16 AM". */
export function currentTimeInAppZone(locale = "en-US"): string {
  return formatTimeInAppZone(new Date(), locale);
}

/**
 * The clock time of an instant, on the company's wall clock — "12:04 PM".
 *
 * The time alone, for the places that have already said which day they mean:
 * a check-in listed under its own date reads worse for repeating it, and a
 * status card saying "Attendance marked: 12:04 PM" is answering "when did they
 * get in", not "which day was that".
 */
export function formatTimeInAppZone(value: Date | string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

/** Inclusive start of the calendar month containing `date`. */
export function startOfUtcMonth(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Exclusive end of the calendar month containing `date`. */
export function endOfUtcMonth(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/** ISO calendar date (YYYY-MM-DD) with no time component. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

/** Weekday name for a calendar day, e.g. "Tuesday". */
export function utcWeekday(date: Date, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(date);
}

/**
 * `count` consecutive calendar days starting at `start`.
 *
 * Every day counts, weekends included — a four-day request books four dates
 * and draws four days of allowance regardless of where they fall.
 */
export function utcDayRange(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, offset) => addUtcDays(start, offset));
}

/** "5 Aug" or "5–8 Aug 2026" — how a booked range reads back to the employee. */
export function formatDateRange(dates: Date[], locale = "en-US"): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return "";
  if (dates.length === 1) return formatDate(first, locale);

  return `${formatDate(first, locale)} – ${formatDate(last, locale)}`;
}

export function formatDate(value: Date | string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: Date | string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function monthLabel(date: Date, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Human-friendly relative time, e.g. "3 hours ago". */
export function relativeTime(value: Date | string, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let duration = seconds;
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) return formatter.format(Math.round(duration), unit);
    duration /= amount;
  }

  return formatter.format(Math.round(duration), "year");
}

/**
 * One calendar day, or every day up to and including one.
 *
 * The shape the reset speaks in. It exists so that "how far back" is carried as
 * a value rather than as an absent filter: `deleteMany(undefined)` meant *every
 * row in the table*, which read as "all of history" and was in fact all of the
 * future too. A scope that always names a bound cannot mean that by omission.
 */
export type DayScope = { on: Date } | { upTo: Date };
