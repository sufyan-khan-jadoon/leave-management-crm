import type { AttendanceDto } from "@/repositories/attendance.repository";
import type { EmployeeDto } from "@/repositories/employee.repository";
import type { HolidayDto } from "@/repositories/holiday.repository";
import type { LeaveWithEmployeeDto } from "@/repositories/leave.repository";
import { lateMinutesOf, type TodayState } from "@/services/attendance.service";
import type {
  AttendanceTodayView,
  AttendanceView,
  EmployeeView,
  HolidayView,
  LeaveWithEmployeeView,
  MonthlyTrendPoint,
} from "@/types";

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
    profileLockedAt: employee.profileLockedAt?.toISOString() ?? null,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

export function serializeHoliday(holiday: HolidayDto): HolidayView {
  return {
    ...holiday,
    date: holiday.date.toISOString(),
    noticeDueAt: holiday.noticeDueAt?.toISOString() ?? null,
    noticeSentAt: holiday.noticeSentAt?.toISOString() ?? null,
    createdAt: holiday.createdAt.toISOString(),
    updatedAt: holiday.updatedAt.toISOString(),
  };
}

export function serializeAttendance(attendance: AttendanceDto): AttendanceView {
  return {
    ...attendance,
    date: attendance.date.toISOString(),
    checkInAt: attendance.checkInAt.toISOString(),
    markedAt: attendance.markedAt?.toISOString() ?? null,
    // Computed here rather than in each client, so no screen can arrive at its
    // own answer — and computed on the server, where `APP_TIME_ZONE` is the
    // clock rather than whatever the viewer's laptop is set to.
    lateMinutes: lateMinutesOf(attendance),
    createdAt: attendance.createdAt.toISOString(),
  };
}

/**
 * Today's attendance state for the client.
 *
 * The return type is annotated rather than inferred on purpose: this is built in
 * more than one route, and an object literal that quietly forgets a field is a
 * bug typecheck would otherwise wave through — the client type would promise
 * something the payload never carried.
 */
export function serializeAttendanceToday(today: TodayState): AttendanceTodayView {
  return {
    date: today.date.toISOString(),
    attendance: today.attendance ? serializeAttendance(today.attendance) : null,
    status: today.status,
    canMark: today.canMark,
    blockedReason: today.blockedReason,
    cutoffMinutes: today.cutoffMinutes,
    isWorkingDay: today.isWorkingDay,
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
