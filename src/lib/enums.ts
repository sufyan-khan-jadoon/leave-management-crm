/**
 * Plain mirrors of the Prisma enums.
 *
 * `middleware.ts` runs on the Edge runtime, which cannot bundle @prisma/client.
 * Importing the generated enums there — even for a single comparison — pulls in
 * the whole client and breaks the build, so Edge-reachable code uses these
 * literals instead. The `satisfies` clauses keep them locked to the schema:
 * renaming a value in schema.prisma fails the typecheck here.
 */
import type {
  EmployeeStatus,
  HolidayNotice,
  InvitationStatus,
  LeaveStatus,
  OtpPurpose,
  Role,
} from "@prisma/client";

export const ROLE = {
  EMPLOYEE: "EMPLOYEE",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const satisfies Record<Role, Role>;

/**
 * Both admin roles reach the admin area; only SUPER_ADMIN reaches the access
 * panel. Every role check goes through these so adding a third never means
 * hunting down comparisons that silently excluded it.
 */
export function isAdminRole(role: Role | string): boolean {
  return role === ROLE.ADMIN || role === ROLE.SUPER_ADMIN;
}

export function isSuperAdminRole(role: Role | string): boolean {
  return role === ROLE.SUPER_ADMIN;
}

/**
 * The two populations every *report* in this system splits into.
 *
 * `SUPER_ADMIN` is not a value here and is deliberately counted **with** the
 * administrators by `rolesInPopulation`. That is the opposite of what the Staff
 * screen does, and the difference is what the split is for: a roster lists what
 * can be acted on, and nobody manages the owner, so they are absent there. A
 * report measures the organisation, and an account in neither population would
 * simply vanish from its own figures — its leave counted nowhere, its
 * attendance in no tile.
 *
 * Kept here rather than in either service because two of them now ask the same
 * question — the admin overview and the attendance roster — and a report that
 * counted the owner while a filter beside it hid them is precisely the kind of
 * quiet disagreement this file exists to prevent.
 */
export const POPULATION = {
  EMPLOYEE: ROLE.EMPLOYEE,
  ADMIN: ROLE.ADMIN,
} as const;

export type Population = (typeof POPULATION)[keyof typeof POPULATION];

export function rolesInPopulation(population: Population): Role[] {
  return population === POPULATION.ADMIN
    ? [ROLE.ADMIN, ROLE.SUPER_ADMIN]
    : [ROLE.EMPLOYEE];
}

/**
 * The roles an invitation may grant. SUPER_ADMIN is absent on purpose: that role
 * is seeded, never invited, so no invitation can ever mint another owner.
 */
export const INVITE_ROLE_VALUES = [ROLE.EMPLOYEE, ROLE.ADMIN] as const;

export type InviteRole = (typeof INVITE_ROLE_VALUES)[number];

export const INVITATION_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
} as const satisfies Record<InvitationStatus, InvitationStatus>;

/** Named `State` so it does not shadow the Prisma type imported above. */
export type InvitationState = (typeof INVITATION_STATUS)[keyof typeof INVITATION_STATUS];

export const EMPLOYEE_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  REJECTED: "REJECTED",
} as const satisfies Record<EmployeeStatus, EmployeeStatus>;

/** Only ACTIVE accounts may hold a session. */
export function canSignIn(status: EmployeeStatus | string): boolean {
  return status === EMPLOYEE_STATUS.ACTIVE;
}

export const LEAVE_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const satisfies Record<LeaveStatus, LeaveStatus>;

export const HOLIDAY_NOTICE = {
  SCHEDULED: "SCHEDULED",
  SENT: "SENT",
  SKIPPED: "SKIPPED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const satisfies Record<HolidayNotice, HolidayNotice>;

/**
 * There is deliberately no PENDING state. Every closure gets a real answer the
 * moment it is created — scheduled, sent, or skipped — so a value meaning "not
 * looked at yet" would be one nothing ever writes, exactly as
 * `LeaveStatus.PENDING` became. An announcement waiting its turn is SCHEDULED,
 * which is a fact about it rather than the absence of one.
 */
export type HolidayNoticeState = (typeof HOLIDAY_NOTICE)[keyof typeof HOLIDAY_NOTICE];

export const OTP_PURPOSE = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  PASSWORD_RESET: "PASSWORD_RESET",
} as const satisfies Record<OtpPurpose, OtpPurpose>;

export const LEAVE_STATUS_VALUES = [
  LEAVE_STATUS.PENDING,
  LEAVE_STATUS.APPROVED,
  LEAVE_STATUS.REJECTED,
] as const;
