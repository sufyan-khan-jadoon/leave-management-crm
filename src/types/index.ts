import type { EmployeeStatus, LeaveStatus, Role } from "@prisma/client";

/**
 * Client-facing mirrors of the repository DTOs.
 *
 * Dates cross the network as ISO strings, so these types restate the server
 * shapes with `string` where the Prisma models use `Date`.
 */
export type EmployeeView = {
  id: string;
  name: string;
  email: string;
  emailVerified: string | null;
  /** Set while the account is shut out after too many failed sign-ins. */
  lockedAt: string | null;
  role: Role;
  status: EmployeeStatus;
  phone: string | null;
  department: string | null;
  position: string | null;
  profilePhoto: string | null;
  joiningDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeaveView = {
  id: string;
  employeeId: string;
  leaveDate: string;
  reason: string;
  status: LeaveStatus;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeaveWithEmployeeView = LeaveView & {
  employee: Pick<EmployeeView, "id" | "name" | "email" | "department" | "position" | "profilePhoto">;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type LeaveBalanceView = {
  allowance: number;
  approvedThisMonth: number;
  remaining: number;
  pending: number;
  rejectedThisMonth: number;
};

export type MonthlyTrendPoint = {
  month: string;
  approved: number;
  pending: number;
  rejected: number;
  total: number;
};

export type EmployeeDashboardData = {
  employee: EmployeeView;
  balance: LeaveBalanceView;
  counts: Record<LeaveStatus, number>;
  trend: MonthlyTrendPoint[];
  recentLeaves: LeaveWithEmployeeView[];
  totalLeaves: number;
};

export type AdminOverviewView = {
  /** Which population every figure below is measured over. */
  population: "EMPLOYEE" | "ADMIN";
  totalMembers: number;
  activeMembers: number;
  suspendedMembers: number;
  awaitingApproval: number;
  approvedLeaves: number;
  rejectedLeaves: number;
  leavesThisMonth: number;
};

export type AdminDashboardView = {
  overview: AdminOverviewView;
  monthlyTrend: MonthlyTrendPoint[];
  departmentBreakdown: Array<{ department: string; count: number }>;
  recentActivity: LeaveWithEmployeeView[];
};

export type LeaveDecisionResult = {
  leave: LeaveView;
  message: string;
  approved: boolean;
  /** True while the request is queued awaiting the automatic decision. */
  pending: boolean;
  usedThisMonth: number;
  remainingThisMonth: number;
};

export type PaginatedLeaves = { items: LeaveWithEmployeeView[]; pagination: Pagination };
export type PaginatedEmployees = { items: EmployeeView[]; departments: string[]; pagination: Pagination };

export type SearchResultsView = {
  employees: EmployeeView[];
  leaves: LeaveWithEmployeeView[];
  total: number;
};
