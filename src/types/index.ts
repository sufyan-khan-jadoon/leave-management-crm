import type { AttendanceStatus, EmployeeStatus, HolidayNotice, LeaveStatus, Role } from "@prisma/client";

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

/** A day the office is closed, as the screens receive it. */
export type HolidayView = {
  id: string;
  date: string;
  reason: string;
  notice: HolidayNotice;
  noticeDueAt: string | null;
  noticeSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  declaredBy: { id: string; name: string; email: string };
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

/** A recorded check-in, as the screens receive it. */
export type AttendanceView = {
  id: string;
  employeeId: string;
  date: string;
  checkInAt: string;
  status: AttendanceStatus;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  /** How far from the office the server judged them, in metres. */
  distanceMeters: number;
  createdAt: string;
};

/**
 * What a day amounted to for one person. Derived on read rather than stored —
 * see `attendance.service.ts` — so it is not a Prisma enum and never will be.
 */
export type AttendanceDayStatus =
  | "PRESENT"
  | "ON_LEAVE"
  | "CLOSED"
  | "NON_WORKING"
  | "ABSENT"
  /** A working day holding no check-in and no leave for anybody — see `dayHoldsRecord`. */
  | "NO_RECORD"
  | "UPCOMING";

export type AttendanceTodayView = {
  date: string;
  attendance: AttendanceView | null;
  status: AttendanceDayStatus;
  canMark: boolean;
  blockedReason: string | null;
  /** Minutes after midnight, on the company's clock. */
  cutoffMinutes: number;
  isWorkingDay: boolean;
};

/** The company's attendance rules, as the super admin's panel receives them. */
export type AttendancePolicyView = {
  id: string;
  cutoffMinutes: number;
  /** Published hours. Nothing judges a check-in by them — see the Prisma model. */
  openingMinutes: number;
  closingMinutes: number;
  workingDays: number[];
  warningsEnabled: boolean;
  updatedAt: string;
  updatedBy: { id: string; name: string; email: string } | null;
};

/**
 * The organisation's working week, as the settings screen receives it.
 *
 * `daysOff` is derived from `workingDays` on the server rather than stored, so
 * the two can never contradict each other — a day is off precisely when it is
 * not a working day.
 */
export type WorkingWeekView = {
  workingDays: number[];
  daysOff: number[];
  updatedAt: string;
  updatedBy: { id: string; name: string; email: string } | null;
};

export type AttendanceRosterEntry = {
  employee: Pick<EmployeeView, "id" | "name" | "email" | "department" | "position" | "profilePhoto">;
  status: AttendanceDayStatus;
  attendance: AttendanceView | null;
};

export type AttendanceRosterView = {
  date: string;
  officeClosed: boolean;
  /** False outside the ordinary working week — a weekend, for most companies. */
  isWorkingDay: boolean;
  items: AttendanceRosterEntry[];
  pagination: Pagination;
  summary: { expected: number; present: number; absent: number; onLeave: number };
};

/** Who a custom email went to. Mirrors the Prisma enum. */
export type EmailAudienceView = "INDIVIDUAL" | "EMPLOYEES" | "ADMINS" | "ALL_MEMBERS";

/**
 * What the signed-in administrator may do with custom email.
 *
 * Shapes the composer only. Every audience listed here is checked again on the
 * server when a message is actually sent.
 */
export type EmailCapabilitiesView = {
  canSend: boolean;
  audiences: EmailAudienceView[];
  seesAllHistory: boolean;
};

/** One row of the send log. The message body is deliberately not part of it. */
export type EmailDispatchView = {
  id: string;
  audience: EmailAudienceView;
  subject: string;
  recipientCount: number;
  deliveredCount: number;
  status: "SENT" | "PARTIAL" | "FAILED";
  createdAt: string;
  sender: { id: string; name: string; email: string; role: Role };
  recipient: { id: string; name: string } | null;
};

export type PaginatedAttendance = { items: AttendanceView[]; pagination: Pagination };

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
  /** Days the office is closed, soonest first. Nobody is charged leave for these. */
  upcomingClosures: HolidayView[];
  attendance: {
    today: AttendanceTodayView;
    /** Days checked in so far this calendar month. */
    presentThisMonth: number;
  };
};

export type AdminOverviewView = {
  /** Which population every figure below is measured over. */
  population: "EMPLOYEE" | "ADMIN";
  totalStaff: number;
  activeStaff: number;
  suspendedStaff: number;
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
  upcomingClosures: HolidayView[];
  /** Today at a glance, over the same population as `overview`. */
  attendanceToday: {
    expected: number;
    present: number;
    absent: number;
    onLeave: number;
    officeClosed: boolean;
  };
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
