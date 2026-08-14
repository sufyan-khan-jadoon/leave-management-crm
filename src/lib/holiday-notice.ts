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
  /** The day is over. There is nobody left to tell. */
  | { action: "skip"; reason: "already-passed" };

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
 * A closure declared *for today* is announced immediately, and its due moment is
 * `now` rather than a noon that has already gone by. It cannot warn anybody in
 * advance, which is what this rule used to skip it for — but "closed tomorrow"
 * and "closed today" are two different messages, and only the first of them is
 * useless once the day has arrived. Somebody who has not yet set off for the
 * office is exactly the person an announcement is for, so the answer was to say
 * the right thing rather than to say nothing. `officeClosedTemplate` words
 * itself from the same fact.
 *
 * Only a day that is genuinely *over* is skipped. The date still closes the
 * office either way — the announcement is a courtesy, not the thing itself.
 */
export function planHolidayNotice(day: Date, now: Date = new Date()): HolidayNoticePlan {
  const today = todayUtc().getTime();

  if (day.getTime() < today) {
    return { action: "skip", reason: "already-passed" };
  }

  // Due the moment it was declared. Storing noon-the-day-before here instead
  // would put a due time in the row that had already passed when the row was
  // written, which reads as an announcement running late rather than one made
  // on the spot.
  if (day.getTime() === today) {
    return { action: "send", dueAt: now };
  }

  const dueAt = noticeDueAt(day);

  return dueAt.getTime() <= now.getTime() ? { action: "send", dueAt } : { action: "schedule", dueAt };
}
