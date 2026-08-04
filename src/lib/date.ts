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

/** Current wall-clock time in the company's timezone, e.g. "3:16 AM". */
export function currentTimeInAppZone(locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
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
