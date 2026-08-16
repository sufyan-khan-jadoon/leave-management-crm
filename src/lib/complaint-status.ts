/**
 * What a complaint's status means, and what changing it obliges.
 *
 * Extracted from `complaint.service.ts` for the reason `geo.ts`,
 * `working-days.ts` and `email-audience.ts` were: these are the rules of the
 * feature, and a rule that can only be exercised by standing up a database and a
 * mail server is a rule nobody exercises. Everything here is a pure function of
 * two statuses and a string, so `complaint-status.test.ts` can enumerate every
 * transition — sixteen of them — and prove no pairing sends a letter it should
 * not or lets an outcome through without words against it.
 *
 * Prisma-free on purpose. The literals mirror the enum the way `enums.ts` does,
 * locked to it with `satisfies` below.
 */
import type { ComplaintStatus } from "@prisma/client";

export const COMPLAINT_STATUS = {
  PENDING: "PENDING",
  UNDER_REVIEW: "UNDER_REVIEW",
  RESOLVED: "RESOLVED",
  REJECTED: "REJECTED",
} as const satisfies Record<ComplaintStatus, ComplaintStatus>;

export type ComplaintStatusValue = (typeof COMPLAINT_STATUS)[keyof typeof COMPLAINT_STATUS];

export const COMPLAINT_STATUSES: ComplaintStatusValue[] = [
  COMPLAINT_STATUS.PENDING,
  COMPLAINT_STATUS.UNDER_REVIEW,
  COMPLAINT_STATUS.RESOLVED,
  COMPLAINT_STATUS.REJECTED,
];

/**
 * The two outcomes that close a complaint, and both owe the employee words.
 *
 * REJECTED is in here beside RESOLVED deliberately. Only the resolution email is
 * specified, so requiring text for a rejection is a judgement rather than a
 * literal reading of the brief — but a complaint refused with nothing said about
 * why is precisely what produces the next complaint, and the employee can see
 * this field either way. An outcome with no explanation against it is not an
 * outcome, it is a shrug.
 */
export const CLOSING_STATUSES: ComplaintStatusValue[] = [
  COMPLAINT_STATUS.RESOLVED,
  COMPLAINT_STATUS.REJECTED,
];

/** Whether reaching this status requires the resolution field to say something. */
export function requiresResolution(status: ComplaintStatusValue): boolean {
  return CLOSING_STATUSES.includes(status);
}

/** Whether a complaint at this status is finished with, for counting and wording. */
export function isClosed(status: ComplaintStatusValue): boolean {
  return CLOSING_STATUSES.includes(status);
}

/**
 * Whether this change of status is one the system will make.
 *
 * **Every transition between two different statuses is allowed**, and that is a
 * decision rather than an absent rule. The obvious design — RESOLVED and
 * REJECTED as terminal — breaks the case that actually happens: a complaint
 * marked resolved by mistake, or resolved and then reopened because the problem
 * came back. Refusing that would leave the row permanently wrong with no way to
 * correct it, which is the trap `Attendance` avoids by letting a day be
 * corrected at all.
 *
 * What is refused is the **no-op**: setting a complaint to the status it already
 * holds. That is not a state machine nicety — it is what stops a double-submitted
 * resolution being treated as a second act, and it means `resolvedAt` and the
 * audit fields are never rewritten by somebody pressing a button twice. The
 * once-only *email* is guaranteed separately and more strongly, by a claim in
 * the database; this is the cheap half of that defence, not the whole of it.
 */
export function isValidTransition(from: ComplaintStatusValue, to: ComplaintStatusValue): boolean {
  return from !== to;
}

/**
 * Whether moving between these two states should send the employee their letter.
 *
 * Answers only "is this an arrival at RESOLVED" — it deliberately knows nothing
 * about whether a letter has already gone. That question is settled against the
 * database by claiming `resolutionNoticeClaimedAt`, because it is a fact about a
 * row rather than about a pair of statuses, and because only the database can
 * arbitrate two requests racing on the same complaint.
 *
 * So this returning true is a *candidate* for sending, never a decision to send.
 * Keeping the two apart is what makes resolve → reopen → resolve send exactly
 * one email: this says yes both times, and the claim says no the second time.
 */
export function shouldNotifyResolution(
  from: ComplaintStatusValue,
  to: ComplaintStatusValue,
): boolean {
  return to === COMPLAINT_STATUS.RESOLVED && from !== COMPLAINT_STATUS.RESOLVED;
}

/** How each status reads to a person. Shared by the screens, the CSV and the email. */
export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatusValue, string> = {
  PENDING: "Pending",
  UNDER_REVIEW: "Under review",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};

export function complaintStatusLabel(status: ComplaintStatusValue | string): string {
  return COMPLAINT_STATUS_LABEL[status as ComplaintStatusValue] ?? status;
}
