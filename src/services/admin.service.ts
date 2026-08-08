import { EmployeeStatus, LeaveStatus, Role } from "@prisma/client";

import { endOfUtcMonth, startOfUtcMonth, todayUtc } from "@/lib/date";
import { employeeRepository } from "@/repositories/employee.repository";
import { holidayRepository, type HolidayDto } from "@/repositories/holiday.repository";
import { leaveRepository, type LeaveWithEmployeeDto } from "@/repositories/leave.repository";
import { attendanceService, type AttendanceSummary } from "@/services/attendance.service";
import { leaveService } from "@/services/leave.service";

/**
 * Which population the overview reports on — the same split the Members screen
 * makes. `SUPER_ADMIN` is absent because that account is managed nowhere.
 */
export type OverviewPopulation = typeof Role.EMPLOYEE | typeof Role.ADMIN;

export type AdminOverview = {
  population: OverviewPopulation;
  totalMembers: number;
  activeMembers: number;
  suspendedMembers: number;
  /** Administrators only: employees never sit in PENDING_APPROVAL. */
  awaitingApproval: number;
  approvedLeaves: number;
  rejectedLeaves: number;
  leavesThisMonth: number;
};

/**
 * The roles a population covers.
 *
 * The super admin counts as an administrator here, unlike on the Members
 * screen, which lists only what can be managed. This is a report rather than a
 * roster: leaving that account out would mean its leave was counted in neither
 * view and simply vanished from the organisation's figures.
 */
function rolesIn(population: OverviewPopulation): Role[] {
  return population === Role.ADMIN ? [Role.ADMIN, Role.SUPER_ADMIN] : [Role.EMPLOYEE];
}

export type AdminDashboardData = {
  overview: AdminOverview;
  monthlyTrend: Awaited<ReturnType<typeof leaveService.monthlyTrend>>;
  departmentBreakdown: Array<{ department: string; count: number }>;
  recentActivity: LeaveWithEmployeeDto[];
  upcomingClosures: HolidayDto[];
  attendanceToday: AttendanceSummary & { officeClosed: boolean };
};

export const adminService = {
  /**
   * Headline numbers for one population.
   *
   * Both the headcount and the leave figures are narrowed to it, so switching
   * between employees and administrators changes what is being measured rather
   * than only what the cards are called. `SUPER_ADMIN` belongs to neither
   * population, which keeps these totals consistent with the Members screen —
   * that role cannot be listed or managed there either.
   */
  async overview(population: OverviewPopulation): Promise<AdminOverview> {
    const now = new Date();
    const roles = rolesIn(population);
    const ofPopulation = { employee: { role: { in: roles } } };

    // Days the office was closed are discounted from every leave figure here,
    // so a company holiday cannot inflate the organisation's leave totals with
    // days nobody actually took off.
    const closedDates = await holidayRepository.allDates();

    const [headcount, leaveRows, thisMonth] = await Promise.all([
      employeeRepository.countByRoleAndStatus(roles),
      leaveRepository.countByStatus(ofPopulation, closedDates),
      leaveRepository.countByStatus(
        { ...ofPopulation, leaveDate: { gte: startOfUtcMonth(now), lt: endOfUtcMonth(now) } },
        closedDates,
      ),
    ]);

    const leaveCounts = new Map(leaveRows.map((row) => [row.status, row.count]));
    const countWhere = (predicate: (status: EmployeeStatus) => boolean) =>
      headcount.reduce((total, row) => (predicate(row.status) ? total + row.count : total), 0);

    return {
      population,
      // Every status, not just active plus suspended: an administrator awaiting
      // approval is a real person on the books, and would otherwise be counted
      // nowhere at all.
      totalMembers: headcount.reduce((total, row) => total + row.count, 0),
      activeMembers: countWhere((status) => status === EmployeeStatus.ACTIVE),
      suspendedMembers: countWhere((status) => status === EmployeeStatus.SUSPENDED),
      awaitingApproval: countWhere((status) => status === EmployeeStatus.PENDING_APPROVAL),
      // No pending total: nothing creates a PENDING leave any more, so it would
      // be a permanent zero dressed up as a metric.
      approvedLeaves: leaveCounts.get(LeaveStatus.APPROVED) ?? 0,
      rejectedLeaves: leaveCounts.get(LeaveStatus.REJECTED) ?? 0,
      leavesThisMonth: thisMonth.reduce((total, row) => total + row.count, 0),
    };
  },

  async dashboard(population: OverviewPopulation): Promise<AdminDashboardData> {
    const roles = rolesIn(population);

    const closedDates = await holidayRepository.allDates();

    const [overview, monthlyTrend, departmentBreakdown, recentActivity, upcomingClosures, attendanceToday] =
      await Promise.all([
        this.overview(population),
        leaveService.monthlyTrend(6, { roles }),
        leaveRepository.departmentTotals({ roles }, closedDates),
        leaveRepository.recent(8, roles),
        holidayRepository.upcoming(todayUtc(), 3),
        // Scoped to the same population as everything else on the screen, so
        // toggling to administrators does not leave one tile counting the
        // whole company.
        attendanceService.summaryOn(todayUtc(), roles),
      ]);

    return {
      overview,
      monthlyTrend,
      departmentBreakdown,
      recentActivity,
      upcomingClosures,
      attendanceToday,
    };
  },
};
