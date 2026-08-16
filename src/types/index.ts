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
  /**
   * Set while an administrator has frozen this person's own profile edits.
   *
   * Nothing to do with `lockedAt` above, which shuts an account out of signing
   * in after failed passwords. This one stops editing and nothing else: the
   * account signs in, marks attendance and books leave exactly as before.
   */
  profileLockedAt: string | null;
  profileLockReason: string | null;
  profileLockedBy: { id: string; name: string } | null;
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
  /**
   * Null exactly when an administrator recorded this rather than the geofence
   * proving it — in which case `markedBy` names them. The two are never both set
   * and never both null, so a surface that shows a distance always has something
   * honest to show instead of one.
   */
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  /** How far from the office the server judged them, in metres. */
  distanceMeters: number | null;
  /** Who vouched for this day, when, and why — all null on a real check-in. */
  markedBy: { id: string; name: string } | null;
  markedAt: string | null;
  reason: string | null;
  /** The deadline this day was judged against, frozen when the row was written. */
  lateBasisMinutes: number;
  /**
   * Minutes past that deadline, computed on the server. Zero means on time,
   * including arriving exactly on it — there is no negative lateness.
   */
  lateMinutes: number;
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
  /** Minutes past the cutoff a delegated administrator may still record somebody present. */
  hrMarkWindowMinutes: number;
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
  /** `late` is a subset of `present`, never a column beside it. */
  summary: { expected: number; present: number; absent: number; onLeave: number; late: number };
  /** Whether to offer "Mark present". Mirrors the server check, never replaces it. */
  canMarkAttendance: boolean;
  /** The deadline lateness is judged against, for the mark dialog's preview. */
  cutoffMinutes: number;
  /** The latest arrival that may be recorded by hand. */
  closingMinutes: number;
  /**
   * How long a delegated administrator may still record this date.
   *
   * `expiresAt` is an instant the **server** computed from the date's own
   * cutoff — never a duration for the browser to start counting from, which is
   * exactly what would restart on every refresh. The countdown is rendering
   * only; `/api/admin/attendance/mark` re-checks the window on every request.
   */
  hrMarkWindow: {
    minutes: number;
    expiresAt: string;
    active: boolean;
    /** False for the super admin, whom the window does not bind. */
    boundByWindow: boolean;
  };
  /** The server's clock when it answered, so the countdown can correct for the browser's. */
  serverTime: string;
};

/**
 * The workforce report, as the screen receives it.
 *
 * Dates cross as ISO strings like everywhere else here. Every number in it was
 * computed on the server from the rows the report holds — nothing on this screen
 * adds anything up, which is why there is no shape here for a client-side total
 * to live in.
 */
export type ReportRecordTypeView = "ATTENDANCE" | "ABSENT" | "LEAVE";

export type PeopleSelectionView =
  | "SELECTED_EMPLOYEES"
  | "SELECTED_ADMINS"
  | "ALL_EMPLOYEES"
  | "ALL_ADMINS"
  | "EVERYONE";

export type ReportRowView = {
  date: string;
  employeeId: string;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  position: string | null;
  recordType: ReportRecordTypeView;
  /** The roster's own verdict — `PRESENT`, `ABSENT` or `ON_LEAVE`. */
  status: AttendanceDayStatus;
  checkInAt: string | null;
  lateMinutes: number;
  lateBasisMinutes: number | null;
  distanceMeters: number | null;
  /** Names who vouched for the day when the geofence did not. */
  markedBy: { id: string; name: string } | null;
  markedAt: string | null;
  markedReason: string | null;
  /** Carried on every row, so leave held beneath a check-in is not lost. */
  leaveStatus: LeaveStatus | null;
  leaveReason: string | null;
};

export type ReportTotalsView = {
  records: number;
  present: number;
  absent: number;
  onLeave: number;
  /** Present, and past the deadline. A subset of `present`, never beside it. */
  late: number;
  lateMinutes: number;
};

/** Facts about the period, true of everybody in it — never summed across people. */
export type ReportCoverageView = {
  calendarDays: number;
  workingDays: number;
  daysOff: number;
  closedDays: number;
  noRecordDays: number;
  upcomingDays: number;
};

export type ReportPersonSummaryView = {
  employee: Pick<
    EmployeeView,
    "id" | "name" | "email" | "role" | "status" | "department" | "position" | "profilePhoto"
  >;
  totals: ReportTotalsView;
  coverage: ReportCoverageView;
  /** Set when they started partway through the period — reported, never acted on. */
  joinedDuringPeriod: string | null;
};

export type ReportView = {
  period: { kind: "MONTHLY" | "CUSTOM" | "DAILY"; from: string; to: string };
  periodLabel: string;
  people: PeopleSelectionView;
  recordTypes: ReportRecordTypeView[];
  generatedAt: string;
  coverage: ReportCoverageView;
  totals: ReportTotalsView;
  peopleCount: number;
  summaries: ReportPersonSummaryView[];
  rows: ReportRowView[];
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Ids that were asked for and matched nobody — reported rather than dropped. */
  missingSelections: string[];
};

/** One candidate in the report's people picker. */
export type ReportPersonView = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: EmployeeStatus;
  department: string | null;
  position: string | null;
};

/** Who a custom email went to. Mirrors the Prisma enum. */
export type EmailAudienceView =
  | "INDIVIDUAL"
  | "EMPLOYEES"
  | "ADMINS"
  | "SELECTED_ADMINS"
  | "ALL_MEMBERS";

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
  /**
   * Kept apart from `seesAllHistory` for the reason `EmailCapabilities` gives:
   * reading the trail and destroying it are different rights, and one flag
   * standing for both is how a later change to either quietly moves the other.
   */
  canClearHistory: boolean;
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
  /**
   * Who a hand-picked send went to, by name, and empty for every other
   * audience — where the audience label and the count already say it.
   */
  recipientNames: string[];
};

/** Where a complaint has got to. Mirrors the Prisma enum. */
export type ComplaintStatusView = "PENDING" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";

/** A file on a complaint, without its bytes. Fetched separately when opened. */
export type ComplaintAttachmentView = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
};

/**
 * A complaint as its author sees it.
 *
 * `internalNotes` is absent from this type as it is absent from
 * `employeeComplaintSelect` — the notes are an administrator's working thoughts
 * about somebody's grievance and never reach them. Keeping the two shapes apart
 * means a component handed an employee's complaint cannot render a field it was
 * never given.
 */
export type MyComplaintView = {
  id: string;
  subject: string;
  description: string;
  status: ComplaintStatusView;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  employeeId: string;
  resolvedBy: { id: string; name: string } | null;
  attachments: ComplaintAttachmentView[];
};

/** The same complaint as somebody managing it sees it. */
export type ComplaintView = MyComplaintView & {
  internalNotes: string | null;
  employee: {
    id: string;
    name: string;
    email: string;
    department: string | null;
    position: string | null;
  };
  resolvedBy: { id: string; name: string; email: string } | null;
  /**
   * Claimed with `sent` still null means the letter was attempted and failed.
   * The admin screen reports that rather than hiding it — see `Complaint`.
   */
  resolutionNoticeClaimedAt: string | null;
  resolutionNoticeSentAt: string | null;
};

/** The tiles above the admin table. Whole-board figures, never the current page. */
export type ComplaintCountsView = {
  total: number;
  pending: number;
  underReview: number;
  resolved: number;
  rejected: number;
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
