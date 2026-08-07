import { EmployeeStatus, LeaveStatus } from "@prisma/client";

import { endOfUtcMonth, startOfUtcMonth } from "@/lib/date";
import { employeeRepository } from "@/repositories/employee.repository";
import { leaveRepository, type LeaveWithEmployeeDto } from "@/repositories/leave.repository";
import { leaveService } from "@/services/leave.service";

export type AdminOverview = {
  totalEmployees: number;
  activeEmployees: number;
  suspendedEmployees: number;
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
  async overview(): Promise<AdminOverview> {
    const now = new Date();

    const [statusRows, leaveRows, thisMonth] = await Promise.all([
      employeeRepository.countByStatus(),
      leaveRepository.countByStatus(),
      leaveRepository.countByStatus({
        leaveDate: { gte: startOfUtcMonth(now), lt: endOfUtcMonth(now) },
      }),
    ]);

    const employeeCounts = new Map(statusRows.map((row) => [row.status, row._count]));
    const leaveCounts = new Map(leaveRows.map((row) => [row.status, row.count]));

    const active = employeeCounts.get(EmployeeStatus.ACTIVE) ?? 0;
    const suspended = employeeCounts.get(EmployeeStatus.SUSPENDED) ?? 0;

    return {
      totalEmployees: active + suspended,
      activeEmployees: active,
      suspendedEmployees: suspended,
      // No pending total: nothing creates a PENDING leave any more, so it would
      // be a permanent zero dressed up as a metric.
      approvedLeaves: leaveCounts.get(LeaveStatus.APPROVED) ?? 0,
      rejectedLeaves: leaveCounts.get(LeaveStatus.REJECTED) ?? 0,
      leavesThisMonth: thisMonth.reduce((sum, row) => sum + row.count, 0),
    };
  },

  async dashboard(): Promise<AdminDashboardData> {
    const [overview, monthlyTrend, departmentBreakdown, recentActivity] = await Promise.all([
      this.overview(),
      leaveService.monthlyTrend(6),
      leaveRepository.departmentTotals(),
      leaveRepository.recent(8),
    ]);

    return { overview, monthlyTrend, departmentBreakdown, recentActivity };
  },
};
