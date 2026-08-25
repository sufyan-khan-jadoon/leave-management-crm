/**
 * Whether somebody may record their own attendance today, and why not.
 *
 * Free of Prisma so the ordering can be read — and tested — on its own, exactly
 * as `geo.ts`, `working-days.ts`, `lateness.ts`, `employment.ts` and
 * `holiday-notice.ts` are. It reads no row, no clock and no configuration: the
 * caller resolves the three facts from the database and this decides what they
 * come to.
 *
 * ## Why it exists
 *
 * `markPresent` used to ask about a declared closure and then go straight to the
 * geofence, so **the ordinary working week never reached the check-in path at
 * all**. Somebody standing inside the office on a Saturday was marked present:
 * the fence agreed they were there, and nothing downstream of it had an opinion
 * about what day it was. The dashboard card already refused the same day —
 * `todayFor` computed its own `canMark` from its own ternary — so the screen and
 * the endpoint behind it disagreed, and the endpoint is the one that decides.
 *
 * **That was a deliberate rule once, and it is deliberately reversed now.** The
 * working notes used to argue that the week governs who is *expected* and who is
 * *chased* rather than who is *permitted*, on the reasoning that somebody who
 * comes in on a Saturday should be able to record it. What that missed is that
 * every other surface in the system had already settled the question the other
 * way: `describeDay` calls the day `NON_WORKING`, `refusalFor` refuses an
 * administrator recording it *in those words*, `editHistoricalDay` refuses it
 * too, and no report counts it. A day the whole rest of the codebase says holds
 * no attendance is not a day the check-in button should be able to write one on.
 *
 * ## One rule, both surfaces
 *
 * `markPresent` throws on it and `todayFor` renders it. That is the point of
 * putting it here rather than in either: the card saying "today is a day off"
 * while the endpoint accepted a hand-written POST is the shape of the defect
 * this closes, and two copies of the ordering is how it would come back. The
 * card is the courtesy; the service is the rule — the same split `ProfileForm`
 * and `updateOwnProfile` make.
 *
 * ## The order, and why it is this order
 *
 * Closure, then the ordinary week, then leave — **`describeDay`'s own order**,
 * deliberately, so the reason given for refusing a day can never be a different
 * one from the reason the roster gives for the same day. A declared closure
 * outranks the week because it is the more specific fact ("closed for Eid" tells
 * you more than "it's a Sunday"), and the week outranks leave because a day off
 * booked across a weekend cost nobody anything.
 *
 * Nothing about *time of day* appears here, and that is not an omission. This
 * project has no working hours that judge anybody: `openingMinutes` and
 * `closingMinutes` are hours the company publishes, and the cutoff is the
 * deadline the warning sweep and lateness are measured from — never a gate on
 * recording a day. Somebody arriving at 07:40 or 21:00 on a working day records
 * it exactly as anybody else does, and turning one of those settings into a
 * refusal is a decision that deserves its own argument rather than arriving as a
 * side effect of this one.
 */

/** What the database says about today, for this one person. */
export type SelfCheckInFacts = {
  /** A `Holiday` row for the date — the office is shut for everybody. */
  officeClosed: boolean;
  /** Whether the date is inside `AttendancePolicy.workingDays`. */
  isWorkingDay: boolean;
  /** Whether this person holds approved leave on the date. */
  onLeave: boolean;
};

/**
 * Why this person cannot record today themselves, or `null` when they can.
 *
 * A sentence rather than a code, because both callers show it to the person it
 * is about: the endpoint as the message on a `ConflictError`, the dashboard card
 * as the notice where the button would be. Each one leads with the fact and then
 * says the consequence, because "you cannot mark attendance" without "and the
 * day costs you nothing" is the sentence that sends somebody to find an
 * administrator to ask.
 *
 * Deliberately says nothing about *where* anybody is. Being inside the office is
 * a separate question judged separately, and — the whole point of this
 * function — judged **after** this one: a day off is a fact about the calendar,
 * and no amount of standing in the right place changes what day it is.
 */
export function selfCheckInRefusal(facts: SelfCheckInFacts): string | null {
  if (facts.officeClosed) {
    return "The office is closed today, so there is no attendance to mark. The day costs nobody a leave.";
  }

  if (!facts.isWorkingDay) {
    return "Today is a day off, so attendance cannot be marked. Nobody is expected in, and the day costs nobody a leave.";
  }

  if (facts.onLeave) {
    return "You are on approved leave today, so there is no attendance to mark.";
  }

  return null;
}
