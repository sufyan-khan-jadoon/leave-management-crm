/**
 * Plain mirrors of the Prisma enums.
 *
 * `middleware.ts` runs on the Edge runtime, which cannot bundle @prisma/client.
 * Importing the generated enums there — even for a single comparison — pulls in
 * the whole client and breaks the build, so Edge-reachable code uses these
 * literals instead. The `satisfies` clauses keep them locked to the schema:
 * renaming a value in schema.prisma fails the typecheck here.
 */
import type { EmployeeStatus, LeaveStatus, Role } from "@prisma/client";

export const ROLE = {
  EMPLOYEE: "EMPLOYEE",
  ADMIN: "ADMIN",
} as const satisfies Record<Role, Role>;

export const EMPLOYEE_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const satisfies Record<EmployeeStatus, EmployeeStatus>;

export const LEAVE_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const satisfies Record<LeaveStatus, LeaveStatus>;

export const LEAVE_STATUS_VALUES = [
  LEAVE_STATUS.PENDING,
  LEAVE_STATUS.APPROVED,
  LEAVE_STATUS.REJECTED,
] as const;
