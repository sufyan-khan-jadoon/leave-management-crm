/**
 * Plain mirrors of the Prisma enums.
 *
 * `middleware.ts` runs on the Edge runtime, which cannot bundle @prisma/client.
 * Importing the generated enums there — even for a single comparison — pulls in
 * the whole client and breaks the build, so Edge-reachable code uses these
 * literals instead. The `satisfies` clauses keep them locked to the schema:
 * renaming a value in schema.prisma fails the typecheck here.
 */
import type { EmployeeStatus, LeaveStatus, OtpPurpose, Role } from "@prisma/client";

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

export const OTP_PURPOSE = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  PASSWORD_RESET: "PASSWORD_RESET",
} as const satisfies Record<OtpPurpose, OtpPurpose>;

export const LEAVE_STATUS_VALUES = [
  LEAVE_STATUS.PENDING,
  LEAVE_STATUS.APPROVED,
  LEAVE_STATUS.REJECTED,
] as const;
