import { LeaveStatus } from "@prisma/client";

import {
  LEAVE_AUTO_APPROVAL_DELAY_MINUTES,
  MONTHLY_LEAVE_ALLOWANCE,
  leavePendingMessage,
  quotaExceededMessage,
} from "@/lib/constants";
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
  /** True while the request is queued awaiting the automatic decision. */
  pending: boolean;
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
    // Queued requests count towards it, otherwise the delay window could be used
    // to slip an unlimited number past the allowance.
    const committedThisMonth = await leaveRepository.countCommittedInMonth(employeeId, leaveDate);
    const withinAllowance = committedThisMonth < MONTHLY_LEAVE_ALLOWANCE;
    const quotaMessage = quotaExceededMessage(serverEnv().HR_CONTACT_PHONE);

    // Exceeding the allowance is refused straight away: waiting to say no tells
    // the employee nothing they could act on.
    if (!withinAllowance) {
      const leave = await leaveRepository.create({
        employeeId,
        leaveDate,
        reason,
        status: LeaveStatus.REJECTED,
      });

      await emailService.sendLeaveRejected(employee.email, employee.name, leaveDate, reason, quotaMessage);

      return {
        leave,
        approved: false,
        pending: false,
        message: quotaMessage,
        usedThisMonth: committedThisMonth,
        remainingThisMonth: 0,
      };
    }

    const leave = await leaveRepository.create({
      employeeId,
      leaveDate,
      reason,
      status: LeaveStatus.PENDING,
    });

    const usedThisMonth = committedThisMonth + 1;

    return {
      leave,
      approved: false,
      pending: true,
      message: leavePendingMessage(),
      usedThisMonth,
      remainingThisMonth: Math.max(0, MONTHLY_LEAVE_ALLOWANCE - usedThisMonth),
    };
  },

  /**
   * Decides every request whose delay has elapsed and emails the outcome.
   *
   * Idempotent and safe to run concurrently from the request-path sweep and the
   * scheduled trigger: each request is re-read as PENDING and the allowance is
   * re-checked against approved leaves only, so a queue that would overshoot the
   * month is trimmed rather than approved wholesale.
   */
  async processDueDecisions(): Promise<{ approved: number; rejected: number }> {
    const cutoff = new Date(Date.now() - LEAVE_AUTO_APPROVAL_DELAY_MINUTES * 60_000);
    const due = await leaveRepository.findDueForDecision(cutoff);

    let approved = 0;
    let rejected = 0;

    for (const leave of due) {
      const approvedThisMonth = await leaveRepository.countApprovedInMonth(leave.employeeId, leave.leaveDate);
      const fits = approvedThisMonth < MONTHLY_LEAVE_ALLOWANCE;

      const updated = await leaveRepository
        .markAutoDecided(leave.id, fits ? LeaveStatus.APPROVED : LeaveStatus.REJECTED)
        .catch((error: unknown) => {
          // A concurrent sweep may have decided it first; skip rather than abort
          // the batch.
          console.warn(`[leave] Could not decide ${leave.id}:`, error);
          return null;
        });

      if (!updated) continue;

      if (fits) {
        approved += 1;
        const remaining = Math.max(0, MONTHLY_LEAVE_ALLOWANCE - (approvedThisMonth + 1));
        await emailService.sendLeaveApproved(
          leave.employee.email,
          leave.employee.name,
          leave.leaveDate,
          leave.reason,
          remaining,
        );
      } else {
        rejected += 1;
        await emailService.sendLeaveRejected(
          leave.employee.email,
          leave.employee.name,
          leave.leaveDate,
          leave.reason,
          quotaExceededMessage(serverEnv().HR_CONTACT_PHONE),
        );
      }
    }

    return { approved, rejected };
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
    // Reading the balance is the moment an employee is most likely to be
    // waiting on a decision, so clear anything already due before answering.
    await this.sweepDueDecisions();

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

  async list(filters: LeaveListFilters) {
    await this.sweepDueDecisions();
    return leaveRepository.list(filters);
  },

  /**
   * Request-path wrapper around `processDueDecisions`.
   *
   * The scheduled trigger is the reliable driver; this only makes the wait feel
   * immediate for someone who has the app open. It therefore must never break
   * the read it is attached to, so failures are logged and swallowed.
   */
  async sweepDueDecisions(): Promise<void> {
    try {
      await this.processDueDecisions();
    } catch (error) {
      console.error("[leave] Inline decision sweep failed:", error);
    }
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
