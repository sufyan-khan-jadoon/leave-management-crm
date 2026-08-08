import type { EmployeeDto } from "@/repositories/employee.repository";
import type { LeaveWithEmployeeDto } from "@/repositories/leave.repository";
import type { EmployeeView, LeaveWithEmployeeView, MonthlyTrendPoint } from "@/types";

/**
 * Converts server DTOs (with `Date` fields) into the client-facing views that
 * use ISO strings, matching what the JSON API returns. Server Components use
 * these so a page and its client components agree on one shape.
 */
export function serializeEmployee(employee: EmployeeDto): EmployeeView {
  return {
    ...employee,
    emailVerified: employee.emailVerified?.toISOString() ?? null,
    lockedAt: employee.lockedAt?.toISOString() ?? null,
    joiningDate: employee.joiningDate?.toISOString() ?? null,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

export function serializeLeave(leave: LeaveWithEmployeeDto): LeaveWithEmployeeView {
  return {
    ...leave,
    leaveDate: leave.leaveDate.toISOString(),
    decidedAt: leave.decidedAt?.toISOString() ?? null,
    createdAt: leave.createdAt.toISOString(),
    updatedAt: leave.updatedAt.toISOString(),
  };
}

export function serializeTrend(
  trend: Array<{ month: Date; approved: number; pending: number; rejected: number; total: number }>,
): MonthlyTrendPoint[] {
  return trend.map((point) => ({ ...point, month: point.month.toISOString() }));
}
