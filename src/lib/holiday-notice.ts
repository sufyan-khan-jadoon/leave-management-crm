/**
 * When the office-closed announcement goes out, and whether there is any point
 * sending it at all.
 *
 * Kept free of Prisma and of the database so the rule can be read — and tested —
 * on its own. `holiday.service.ts` decides what to do with the answer.
 */
import { HOLIDAY_NOTICE_HOUR } from "@/lib/constants";
import { addUtcDays, appZoneInstant, todayUtc } from "@/lib/date";

export type HolidayNoticePlan =
  /** The moment to announce it has already come: say so now. */
  | { action: "send"; dueAt: Date }
  /** Still in the future: leave it for the sweep to pick up. */
  | { action: "schedule"; dueAt: Date }
  /** Nothing useful left to announce in advance. */
  | { action: "skip"; reason: "starts-today-or-earlier" };

/**
 * The instant the announcement is due: noon on the day before the closure, on
 * the company's clock. A different moment in UTC depending on the zone, which
 * is exactly why it is computed rather than assumed.
 */
export function noticeDueAt(day: Date): Date {
  return appZoneInstant(addUtcDays(day, -1), HOLIDAY_NOTICE_HOUR);
}

/**
 * What to do about announcing a closure on `day`.
 *
 * The rule is one line — announce at noon the day before, or immediately if that
 * moment has already passed — but both halves of it have to be judged on the
 * company's clock. A server in UTC reaches "noon" five hours after Karachi does,
 * which is the difference between telling people the afternoon before and
 * telling them nothing at all.
 *
 * A closure that starts today or earlier is skipped rather than sent late: a
 * message announcing that the office will be closed tomorrow is worse than
 * silence when the office is closed *now*, and everyone it would reach can
 * already see the day marked closed. The date still closes the office either
 * way — the announcement is a courtesy, not the thing itself.
 */
export function planHolidayNotice(day: Date, now: Date = new Date()): HolidayNoticePlan {
  if (day.getTime() <= todayUtc().getTime()) {
    return { action: "skip", reason: "starts-today-or-earlier" };
  }

  const dueAt = noticeDueAt(day);

  return dueAt.getTime() <= now.getTime() ? { action: "send", dueAt } : { action: "schedule", dueAt };
}
