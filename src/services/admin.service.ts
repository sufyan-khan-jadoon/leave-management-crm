import { EmployeeStatus, LeaveStatus, Role } from "@prisma/client";

import { endOfUtcMonth, startOfUtcMonth } from "@/lib/date";
import { isSuperAdminRole } from "@/lib/enums";
import { employeeRepository } from "@/repositories/employee.repository";
import { leaveRepository, type LeaveWithEmployeeDto } from "@/repositories/leave.repository";
import { leaveService } from "@/services/leave.service";

/** Who the headcount covers — the same split the Members screen makes. */
export type OverviewScope = "organisation" | "employees";

export type AdminOverview = {
  scope: OverviewScope;
  totalMembers: number;
  activeMembers: number;
  suspendedMembers: number;
  /** Only populated for the super admin, who alone may see administrators. */
  roleBreakdown: { employees: number; administrators: number } | null;
  approvedLeaves: number;
  rejectedLeaves: number;
  leavesThisMonth: number;
};

export type AdminDashboardData = {
  overview: AdminOverview;
  monthlyTrend: Awaited<ReturnType<typeof leaveService.monthlyTrend>>;
  departmentBreakdown: Array<{ department: string; count: number }>;
  recentActivity: LeaveWithEmployeeDto[];
};

export const adminService = {
  /**
   * Headline numbers, scoped to whom the viewer is responsible for.
   *
   * The super admin owns administrator onboarding, so their overview counts
   * administrators alongside employees and reports the split. An ordinary admin
   * sees employees only: `/api/admin/employees` already refuses them the
   * administrator roster, and a headcount would give away its size just as
   * effectively.
   *
   * `SUPER_ADMIN` is counted for neither, which keeps the total consistent with
   * the Members screen — that role cannot be listed or managed there either.
   */
  async overview(viewer: { role: Role }): Promise<AdminOverview> {
    const now = new Date();
    const superAdmin = isSuperAdminRole(viewer.role);
    const roles = superAdmin ? [Role.EMPLOYEE, Role.ADMIN] : [Role.EMPLOYEE];

    const [headcount, leaveRows, thisMonth] = await Promise.all([
      employeeRepository.countByRoleAndStatus(roles),
      leaveRepository.countByStatus(),
      leaveRepository.countByStatus({
        leaveDate: { gte: startOfUtcMonth(now), lt: endOfUtcMonth(now) },
      }),
    ]);

    const leaveCounts = new Map(leaveRows.map((row) => [row.status, row.count]));
    const sum = (rows: typeof headcount) => rows.reduce((total, row) => total + row.count, 0);

    return {
      scope: superAdmin ? "organisation" : "employees",
      // Every status, not just active plus suspended: an administrator awaiting
      // approval is a real person on the books, and would otherwise be counted
      // nowhere at all.
      totalMembers: sum(headcount),
      activeMembers: sum(headcount.filter((row) => row.status === EmployeeStatus.ACTIVE)),
      suspendedMembers: sum(headcount.filter((row) => row.status === EmployeeStatus.SUSPENDED)),
      roleBreakdown: superAdmin
        ? {
            employees: sum(headcount.filter((row) => row.role === Role.EMPLOYEE)),
            administrators: sum(headcount.filter((row) => row.role === Role.ADMIN)),
          }
        : null,
      // No pending total: nothing creates a PENDING leave any more, so it would
      // be a permanent zero dressed up as a metric.
      approvedLeaves: leaveCounts.get(LeaveStatus.APPROVED) ?? 0,
      rejectedLeaves: leaveCounts.get(LeaveStatus.REJECTED) ?? 0,
      leavesThisMonth: thisMonth.reduce((total, row) => total + row.count, 0),
    };
  },

  async dashboard(viewer: { role: Role }): Promise<AdminDashboardData> {
    const [overview, monthlyTrend, departmentBreakdown, recentActivity] = await Promise.all([
      this.overview(viewer),
      leaveService.monthlyTrend(6),
      leaveRepository.departmentTotals(),
      leaveRepository.recent(8),
    ]);

    return { overview, monthlyTrend, departmentBreakdown, recentActivity };
  },
};
