/**
 * When somebody's attendance record begins.
 *
 * Free of Prisma so it can be read — and tested — on its own, exactly as
 * `geo.ts`, `working-days.ts`, `lateness.ts`, `remote-work.ts` and
 * `holiday-notice.ts` are. `attendance.service.ts` decides what to do with the
 * answer; nothing here reads a row or writes one.
 *
 * ## Why this exists
 *
 * Absence is derived rather than stored — see `AttendanceDayStatus` — which is
 * what lets a withdrawn closure hand a day back with nothing to migrate. The
 * cost of deriving it is that the derivation runs over *every* date in the
 * range, including dates the person had no part in: somebody who registered on
 * 22 August read as `ABSENT` for the 17th through the 21st, because a working
 * day with no check-in and no leave is exactly what absence is defined as, and
 * nothing in the walk knew the account had not existed yet.
 *
 * That is an accusation with nothing behind it, and it is the same class of
 * mistake `NO_RECORD` was introduced for one level up: a day nobody was watching
 * is not a day somebody failed to turn up on. The difference is that here there
 * *is* a stored fact that separates the two — the account's own creation
 * instant — so it can be named precisely rather than inferred from an empty
 * table.
 *
 * ## Why `createdAt` and not `joiningDate`
 *
 * `joiningDate` is the more natural-sounding candidate and it is the wrong one.
 * It is a **profile field the employee fills in themselves**, nullable, and
 * editable from `/profile` — so pinning the register to it would hand every
 * employee a way out of it: set a joining date in the future and every absence
 * disappears. It is also routinely *earlier* than the account, since somebody
 * who has worked here for three years still registers on the day the system
 * reaches them, and using it would reinstate the very absences this removes.
 *
 * `createdAt` is server-set, immutable, never null, and is what the requirement
 * means by "registration date". The warning sweep's separate use of
 * `joiningDate` to shorten a streak is left exactly as it was: shortening the
 * number quoted in a letter is not the same power as excusing a day.
 */
import { appZoneDay } from "@/lib/date";

/**
 * The first calendar day this account can hold attendance for.
 *
 * The registration instant read on the **company's** clock, not the server's —
 * an account created at 02:00 in Karachi has a `createdAt` whose UTC date is the
 * day before, and starting somebody's register a day early is precisely the
 * off-by-one this boundary exists to prevent.
 *
 * Computed once per person rather than per cell: `appZoneDay` goes through
 * `Intl`, and a month's report for a hundred people is three thousand cells.
 */
export function attendanceStartOf(registeredAt: Date): Date {
  return appZoneDay(registeredAt);
}

/**
 * Whether a calendar day falls before somebody was on the books at all.
 *
 * Strictly before: the registration day itself is theirs, and the ordinary rules
 * apply to it from that moment. Somebody who registers on a Saturday, or on a
 * day the office is closed, is not marked absent for it — but for the reason
 * everybody else is not, which `describeDay` already settles.
 */
export function isBeforeEmployment(day: Date, attendanceStart: Date): boolean {
  return day.getTime() < attendanceStart.getTime();
}
