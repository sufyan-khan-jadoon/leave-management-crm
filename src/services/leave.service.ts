import { LeaveStatus } from "@prisma/client";

import { MONTHLY_LEAVE_ALLOWANCE, quotaExceededMessage } from "@/lib/constants";
import { addUtcMonths, endOfUtcMonth, startOfUtcMonth, toUtcDay } from "@/lib/date";
import { serverEnv } from "@/lib/env";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { employeeRepository } from "@/repositories/employee.repository";
import {
  leaveRepository,
  type LeaveDto,
  type LeaveListFilters,
  type LeaveWithEmployeeDto,
} from "@/repositories/leave.repository";
import { extractLeaveDetails } from "@/services/ai.service";
import { emailService } from "@/services/email/email.service";

export type LeaveDecision = {
  leave: LeaveDto;
  /** Auto-decision outcome, surfaced verbatim to the employee. */
  message: string;
  approved: boolean;
  usedThisMonth: number;
  remainingThisMonth: number;
};

export type LeaveBalance = {
  allowance: number;
  approvedThisMonth: number;
  remaining: number;
  pending: number;
  rejectedThisMonth: number;
};

export const leaveService = {
  /**
   * Full natural-language pipeline: extract → validate → apply quota → persist.
   *
   * The raw prompt is never stored. Only the AI-extracted `date` and `reason`
   * reach the database, per the data-minimisation requirement.
   */
  async createFromNaturalLanguage(employeeId: string, message: string): Promise<LeaveDecision> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    const extracted = await extractLeaveDetails(message);
    const leaveDate = toUtcDay(extracted.date);
    const reason = extracted.reason.trim();

    const duplicate = await leaveRepository.findByEmployeeAndDate(employeeId, leaveDate);
    if (duplicate) {
      throw new ConflictError(
        `You already have a ${duplicate.status.toLowerCase()} leave request for that date.`,
      );
    }

    // Quota is evaluated against the month the leave falls in, not the month
    // the request is made — a request in March for an April date draws on April.
    const approvedThisMonth = await leaveRepository.countApprovedInMonth(employeeId, leaveDate);
    const withinAllowance = approvedThisMonth < MONTHLY_LEAVE_ALLOWANCE;

    const leave = await leaveRepository.create({
      employeeId,
      leaveDate,
      reason,
      status: withinAllowance ? LeaveStatus.APPROVED : LeaveStatus.REJECTED,
    });

    const usedThisMonth = withinAllowance ? approvedThisMonth + 1 : approvedThisMonth;
    const remainingThisMonth = Math.max(0, MONTHLY_LEAVE_ALLOWANCE - usedThisMonth);
    const quotaMessage = quotaExceededMessage(serverEnv().HR_CONTACT_PHONE);

    if (withinAllowance) {
      await emailService.sendLeaveApproved(employee.email, employee.name, leaveDate, reason, remainingThisMonth);
    } else {
      await emailService.sendLeaveRejected(employee.email, employee.name, leaveDate, reason, quotaMessage);
    }

    return {
      leave,
      approved: withinAllowance,
      message: withinAllowance
        ? `Your leave on ${extracted.date} has been approved. You have ${remainingThisMonth} of ${MONTHLY_LEAVE_ALLOWANCE} leaves remaining this month.`
        : quotaMessage,
      usedThisMonth,
      remainingThisMonth,
    };
  },

  /** Admin override of an automatic decision. */
  async decide(leaveId: string, status: LeaveStatus, adminId: string): Promise<LeaveWithEmployeeDto> {
    const existing = await leaveRepository.findById(leaveId);
    if (!existing) throw new NotFoundError("Leave request not found.");

    if (existing.status === status) {
      throw new ConflictError(`This request is already ${status.toLowerCase()}.`);
    }

    // Approving beyond the allowance must stay a deliberate admin action, so it
    // is blocked here just as it is in the automatic path.
    if (status === LeaveStatus.APPROVED) {
      const approved = await leaveRepository.countApprovedInMonth(existing.employeeId, existing.leaveDate);
      if (approved >= MONTHLY_LEAVE_ALLOWANCE) {
        throw new ForbiddenError(
          `${existing.employee.name} has already used all ${MONTHLY_LEAVE_ALLOWANCE} approved leaves for that month.`,
        );
      }
    }

    const updated = await leaveRepository.updateStatus(leaveId, status, adminId);
    const approvedAfter = await leaveRepository.countApprovedInMonth(updated.employeeId, updated.leaveDate);
    const remaining = Math.max(0, MONTHLY_LEAVE_ALLOWANCE - approvedAfter);

    if (status === LeaveStatus.APPROVED) {
      await emailService.sendLeaveApproved(
        updated.employee.email,
        updated.employee.name,
        updated.leaveDate,
        updated.reason,
        remaining,
      );
    } else {
      await emailService.sendLeaveRejected(
        updated.employee.email,
        updated.employee.name,
        updated.leaveDate,
        updated.reason,
        "An administrator reviewed and declined this request. Please contact HR if you have questions.",
      );
    }

    return updated;
  },

  async balanceFor(employeeId: string, reference: Date = new Date()): Promise<LeaveBalance> {
    const monthStart = startOfUtcMonth(reference);
    const monthEnd = endOfUtcMonth(reference);

    const [approvedThisMonth, statusCounts] = await Promise.all([
      leaveRepository.countApprovedInMonth(employeeId, reference),
      leaveRepository.countByStatus({ employeeId, leaveDate: { gte: monthStart, lt: monthEnd } }),
    ]);

    const byStatus = new Map(statusCounts.map((row) => [row.status, row.count]));

    return {
      allowance: MONTHLY_LEAVE_ALLOWANCE,
      approvedThisMonth,
      remaining: Math.max(0, MONTHLY_LEAVE_ALLOWANCE - approvedThisMonth),
      pending: byStatus.get(LeaveStatus.PENDING) ?? 0,
      rejectedThisMonth: byStatus.get(LeaveStatus.REJECTED) ?? 0,
    };
  },

  list(filters: LeaveListFilters) {
    return leaveRepository.list(filters);
  },

  listAll(filters: Omit<LeaveListFilters, "page" | "pageSize">) {
    return leaveRepository.listAll(filters);
  },

  async byId(leaveId: string): Promise<LeaveWithEmployeeDto> {
    const leave = await leaveRepository.findById(leaveId);
    if (!leave) throw new NotFoundError("Leave request not found.");
    return leave;
  },

  /** Lifetime status totals for an employee, used by the dashboard cards. */
  async lifetimeCounts(employeeId: string): Promise<Record<LeaveStatus, number>> {
    const rows = await leaveRepository.countByStatus({ employeeId });
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<LeaveStatus, number>;

    for (const row of rows) counts[row.status] = row.count;
    return counts;
  },

  /** Month-by-month series for the trend chart, zero-filled for empty months. */
  async monthlyTrend(months: number, employeeId?: string) {
    const to = endOfUtcMonth(new Date());
    const from = addUtcMonths(startOfUtcMonth(new Date()), -(months - 1));
    const rows = await leaveRepository.monthlyTotals(from, to, employeeId);

    const series: Array<{ month: Date; approved: number; pending: number; rejected: number; total: number }> = [];

    for (let i = 0; i < months; i += 1) {
      const month = addUtcMonths(from, i);
      const matching = rows.filter((row) => row.month.getTime() === month.getTime());

      const approved = matching.find((r) => r.status === LeaveStatus.APPROVED)?.count ?? 0;
      const pending = matching.find((r) => r.status === LeaveStatus.PENDING)?.count ?? 0;
      const rejected = matching.find((r) => r.status === LeaveStatus.REJECTED)?.count ?? 0;

      series.push({ month, approved, pending, rejected, total: approved + pending + rejected });
    }

    return series;
  },
};
