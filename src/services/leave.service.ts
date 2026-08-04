import { LeaveStatus } from "@prisma/client";

import { MAX_LEAVE_DAYS_PER_REQUEST, MONTHLY_LEAVE_ALLOWANCE } from "@/lib/constants";
import {
  addUtcMonths,
  endOfUtcMonth,
  formatDateRange,
  monthLabel,
  startOfUtcMonth,
  todayUtc,
  utcDayRange,
} from "@/lib/date";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { employeeRepository } from "@/repositories/employee.repository";
import {
  leaveRepository,
  type LeaveDto,
  type LeaveListFilters,
  type LeaveWithEmployeeDto,
} from "@/repositories/leave.repository";
import { emailService } from "@/services/email/email.service";

/** Allowance picture for one calendar month a request touches. */
export type LeaveMonthUsage = {
  label: string;
  requested: number;
  used: number;
  allowance: number;
};

export type LeavePlan = {
  ok: boolean;
  dates: Date[];
  reason: string;
  months?: LeaveMonthUsage[];
  /** Why the range cannot be booked, phrased for the employee. */
  problem?: string;
  remainingAfter?: number;
};

export type LeaveBooking = {
  leaves: LeaveDto[];
  dates: Date[];
  reason: string;
  remainingAfter: number;
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
   * Works out whether a range can be booked, without writing anything.
   *
   * The chatbot proposes before it commits, so this is the shared judgement:
   * the same call decides what to say in the proposal and re-validates when the
   * employee confirms. Nothing is trusted from the client in between.
   */
  async planLeave(
    employeeId: string,
    startDate: Date,
    days: number,
    reason: string,
  ): Promise<LeavePlan> {
    const dates = utcDayRange(startDate, days);
    const today = todayUtc();
    const base = { dates, reason };

    if (days < 1 || days > MAX_LEAVE_DAYS_PER_REQUEST) {
      return { ...base, ok: false, problem: `A request has to cover between 1 and ${MAX_LEAVE_DAYS_PER_REQUEST} days.` };
    }

    if (startDate.getTime() < today.getTime()) {
      return { ...base, ok: false, problem: "Leave cannot start in the past." };
    }

    const clashes = await leaveRepository.findByEmployeeAndDates(employeeId, dates);
    if (clashes.length > 0) {
      return {
        ...base,
        ok: false,
        problem: `You already have a request covering ${formatDateRange(clashes.map((c) => c.leaveDate))}.`,
      };
    }

    // A range may straddle a month boundary, and the allowance is per calendar
    // month, so each month it touches is checked against its own usage.
    const byMonth = new Map<number, Date[]>();
    for (const date of dates) {
      const key = startOfUtcMonth(date).getTime();
      byMonth.set(key, [...(byMonth.get(key) ?? []), date]);
    }

    const months: LeaveMonthUsage[] = [];

    for (const [key, monthDates] of byMonth) {
      const reference = new Date(key);
      const used = await leaveRepository.countApprovedInMonth(employeeId, reference);

      months.push({
        label: monthLabel(reference),
        requested: monthDates.length,
        used,
        allowance: MONTHLY_LEAVE_ALLOWANCE,
      });
    }

    // Partial cover is deliberately not offered: being approved for half a trip
    // is worse than being told to ask for fewer days.
    const short = months.find((month) => month.used + month.requested > month.allowance);
    if (short) {
      const remaining = Math.max(0, short.allowance - short.used);

      return {
        ...base,
        ok: false,
        months,
        problem:
          remaining === 0
            ? `You have used all ${short.allowance} of your leaves for ${short.label}.`
            : `That needs ${short.requested} day${short.requested === 1 ? "" : "s"} in ${short.label}, but you have only ${remaining} left.`,
      };
    }

    const totalRemaining = months.reduce(
      (lowest, month) => Math.min(lowest, month.allowance - month.used - month.requested),
      MONTHLY_LEAVE_ALLOWANCE,
    );

    return { ...base, ok: true, months, remainingAfter: Math.max(0, totalRemaining) };
  },

  /**
   * Books a previously planned range. The plan is recomputed here rather than
   * taken on trust, so a proposal that has gone stale — the allowance used up
   * in another tab, a clashing request added since — cannot slip through.
   */
  async bookLeave(
    employeeId: string,
    startDate: Date,
    days: number,
    reason: string,
  ): Promise<LeaveBooking> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    const plan = await this.planLeave(employeeId, startDate, days, reason);
    if (!plan.ok) throw new ConflictError(plan.problem ?? "That leave request can no longer be booked.");

    const leaves = await leaveRepository.createManyApproved(employeeId, plan.dates, plan.reason);

    await emailService.sendLeaveApproved(
      employee.email,
      employee.name,
      plan.dates,
      plan.reason,
      plan.remainingAfter ?? 0,
    );

    return { leaves, dates: plan.dates, reason: plan.reason, remainingAfter: plan.remainingAfter ?? 0 };
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
        // An admin decides one row at a time, even when it came from a range.
        [updated.leaveDate],
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
