import type { LeaveStatus } from "@prisma/client";

import type { AttendanceDto } from "@/repositories/attendance.repository";
import type { EmployeeDto } from "@/repositories/employee.repository";
import type { HolidayDto } from "@/repositories/holiday.repository";
import type { LeaveWithEmployeeDto } from "@/repositories/leave.repository";
import type { RemoteWorkEventDto } from "@/repositories/remote-work.repository";
import { lateMinutesOf, type TodayState } from "@/services/attendance.service";
import type { RemoteWorkAssignmentView } from "@/services/remote-work.service";
import type { EmployeeReportResult, ReportResult } from "@/services/report.service";
import type {
  AttendanceTodayView,
  AttendanceView,
  EmployeeReportView,
  EmployeeView,
  HolidayView,
  LeaveWithEmployeeView,
  MonthlyTrendPoint,
  RemoteWorkEventView,
  RemoteWorkView,
  ReportView,
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

/**
 * A remote-work arrangement for the client.
 *
 * `state`, `dayCount` and `periodLabel` are passed through rather than
 * recomputed here — they were derived once in `remote-work.service.ts` against
 * the company's calendar day, and re-deriving on the way out would give the
 * browser's clock a say in what a period covers.
 */
export function serializeRemoteWork(assignment: RemoteWorkAssignmentView): RemoteWorkView {
  return {
    id: assignment.id,
    employeeId: assignment.employeeId,
    startDate: assignment.startDate.toISOString(),
    endDate: assignment.endDate?.toISOString() ?? null,
    type: assignment.type,
    reason: assignment.reason,
    state: assignment.state,
    dayCount: assignment.dayCount,
    periodLabel: assignment.periodLabel,
    revokedAt: assignment.revokedAt?.toISOString() ?? null,
    revokeReason: assignment.revokeReason,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
    employee: assignment.employee,
    assignedBy: assignment.assignedBy,
    revokedBy: assignment.revokedBy,
  };
}

export function serializeRemoteWorkEvent(event: RemoteWorkEventDto): RemoteWorkEventView {
  return {
    id: event.id,
    assignmentId: event.assignmentId,
    employeeId: event.employeeId,
    action: event.action,
    previousStart: event.previousStart?.toISOString() ?? null,
    previousEnd: event.previousEnd?.toISOString() ?? null,
    newStart: event.newStart?.toISOString() ?? null,
    newEnd: event.newEnd?.toISOString() ?? null,
    reason: event.reason,
    createdAt: event.createdAt.toISOString(),
    actor: event.actor,
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
    remote: today.remote,
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

/**
 * The workforce report for the client.
 *
 * The return type is annotated rather than inferred, for the reason
 * `serializeAttendanceToday` gives and more so: this payload is wide, and an
 * object literal that quietly forgot a field would leave the client type
 * promising a summary the response never carried. Every figure is passed through
 * untouched — nothing is recomputed here, because recomputing on the way out is
 * how a second answer gets into a report that already had one.
 */
export function serializeReport(report: ReportResult): ReportView {
  return {
    period: {
      kind: report.period.kind,
      from: report.period.from.toISOString(),
      to: report.period.to.toISOString(),
    },
    periodLabel: report.periodLabel,
    people: report.people,
    recordTypes: report.recordTypes,
    generatedAt: report.generatedAt.toISOString(),
    coverage: report.coverage,
    totals: report.totals,
    peopleCount: report.peopleCount,
    summaries: report.summaries.map((summary) => ({
      employee: summary.employee,
      totals: summary.totals,
      coverage: summary.coverage,
      joinedDuringPeriod: summary.joinedDuringPeriod?.toISOString() ?? null,
    })),
    rows: report.rows.map((row) => ({
      ...row,
      date: row.date.toISOString(),
      checkInAt: row.checkInAt?.toISOString() ?? null,
      markedAt: row.markedAt?.toISOString() ?? null,
    })),
    totalRows: report.totalRows,
    page: report.page,
    pageSize: report.pageSize,
    totalPages: report.totalPages,
    missingSelections: report.missingSelections,
  };
}

/**
 * One person's report for the client.
 *
 * Built on `serializeReport` rather than beside it, so the shared half of the
 * payload cannot come to be converted two ways. Everything added is passed
 * through untouched for the reason that one gives: recomputing on the way out is
 * how a second answer gets into a report that already had one — `attendanceRate`
 * in particular is the service's single division and is deliberately not
 * re-derived here from the totals sitting next to it.
 */
export function serializeEmployeeReport(report: EmployeeReportResult): EmployeeReportView {
  return {
    ...serializeReport(report),
    subject: {
      ...report.subject,
      joiningDate: report.subject.joiningDate?.toISOString() ?? null,
    },
    calendar: report.calendar.map((day) => ({
      ...day,
      date: day.date.toISOString(),
      checkInAt: day.checkInAt?.toISOString() ?? null,
      markedAt: day.markedAt?.toISOString() ?? null,
    })),
    leaveSpells: report.leaveSpells.map((spell) => ({
      from: spell.from.toISOString(),
      to: spell.to.toISOString(),
      days: spell.days,
      reason: spell.reason,
      // Narrowed back to the enum: `groupLeaveSpells` is Prisma-free and takes a
      // string, and only approved rows are ever grouped.
      status: spell.status as LeaveStatus,
    })),
    attendanceRate: report.attendanceRate,
    attendanceAssessedDays: report.attendanceAssessedDays,
  };
}

export function serializeTrend(
  trend: Array<{ month: Date; approved: number; pending: number; rejected: number; total: number }>,
): MonthlyTrendPoint[] {
  return trend.map((point) => ({ ...point, month: point.month.toISOString() }));
}
