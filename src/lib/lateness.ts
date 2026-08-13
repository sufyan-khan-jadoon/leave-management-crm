/**
 * How late a check-in was, and nothing else.
 *
 * Kept free of Prisma so it can be read and tested on its own, exactly as
 * `geo.ts`, `holiday-notice.ts` and `working-days.ts` are. One rule, one
 * function, so no surface can arrive at a different number for the same row.
 *
 * **Lateness is measured against `AttendancePolicy.cutoffMinutes`** — the time by
 * which somebody must have appeared, and the same deadline the warning sweep
 * uses. It is deliberately *not* measured against `openingMinutes`. Those are
 * the hours the company publishes, and the schema says in as many words not to
 * reach for them to judge anybody: doing so would turn a published courtesy into
 * a verdict, and would silently reclassify every check-in after 9am in the
 * system's history as late.
 *
 * The consequence of using the cutoff is worth stating rather than discovering:
 * somebody arriving at 09:15 is **not** late, and neither is somebody arriving at
 * 16:59. Only arrivals past the deadline register at all. That is what makes this
 * safe to add to a system that has never judged anybody by the clock — it accuses
 * only the people who missed the deadline outright, who are exactly the people an
 * administrator is correcting the record for.
 */

/**
 * Minutes late, floored at zero.
 *
 * `basisMinutes` is the cutoff the day was judged by, read from the row rather
 * than from today's policy — see `Attendance.lateBasisMinutes`. Passing it in
 * rather than reading it here is what keeps this function pure and what lets a
 * past day keep reporting the lateness it was actually judged by.
 *
 * Never negative. Arriving early is not a quantity this system has any use for,
 * and a negative "lateness" would flow into sums and averages downstream as a
 * credit against somebody else's tardiness.
 */
export function minutesLate(minutesOfDay: number, basisMinutes: number): number {
  return Math.max(0, minutesOfDay - basisMinutes);
}

/** Whether a check-in counts as late at all. Zero is on time, including exactly on the deadline. */
export function isLate(minutesOfDay: number, basisMinutes: number): boolean {
  return minutesLate(minutesOfDay, basisMinutes) > 0;
}

/**
 * "15 min late", "1 hr 15 min late" — one wording, used by every surface.
 *
 * Hours appear past sixty minutes because "495 min late" is a number somebody
 * has to do arithmetic on before it means anything, and the whole point of the
 * figure is to be read at a glance.
 *
 * Returns null when there is nothing to say, so callers render nothing rather
 * than "0 min late", which reads as a complaint about somebody who was on time.
 */
export function describeLateness(lateMinutes: number): string | null {
  if (lateMinutes <= 0) return null;
  if (lateMinutes < 60) return `${lateMinutes} min late`;

  const hours = Math.floor(lateMinutes / 60);
  const minutes = lateMinutes % 60;

  return minutes === 0 ? `${hours} hr late` : `${hours} hr ${minutes} min late`;
}
