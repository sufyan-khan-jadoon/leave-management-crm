import { LeaveStatus, type Role } from "@prisma/client";

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
import { ConflictError, NotFoundError } from "@/lib/errors";
import type { DaySplit } from "@/lib/working-days";
import { employeeRepository } from "@/repositories/employee.repository";
import { holidayRepository } from "@/repositories/holiday.repository";
import {
  leaveRepository,
  type LeaveDto,
  type LeaveListFilters,
  type LeaveWithEmployeeDto,
} from "@/repositories/leave.repository";
import { emailService } from "@/services/email/email.service";
import { remoteWorkService } from "@/services/remote-work.service";
import { workingDaysService } from "@/services/working-days.service";

/** Allowance picture for one calendar month a request touches. */
export type LeaveMonthUsage = {
  label: string;
  requested: number;
  used: number;
  allowance: number;
};

export type LeavePlan = {
  ok: boolean;
  /**
   * The days that will actually be booked and charged — the working days of the
   * requested range, with weekly days off and office closures already removed.
   * Its length *is* the duration of the leave.
   */
  dates: Date[];
  reason: string;
  months?: LeaveMonthUsage[];
  /** Days dropped from the request because the office is closed anyway. */
  closedDates?: Date[];
  /** Days dropped because the ordinary week does not work them. */
  weeklyOffDates?: Date[];
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

/**
 * Why a requested range holds no leave at all, in the employee's words.
 *
 * Says which days were ruled out and why rather than just refusing: "there is no
 * leave to book" on its own reads as a bug, where "Saturday and Sunday are not
 * working days" reads as the answer to what was asked.
 */
function nothingToBook(split: DaySplit): string {
  const parts: string[] = [];

  if (split.closed.length > 0) {
    parts.push(`the office is already closed ${formatDateRange(split.closed)}`);
  }

  if (split.weeklyOff.length > 0) {
    const isPlural = split.weeklyOff.length > 1;
    parts.push(
      `${formatDateRange(split.weeklyOff)} ${isPlural ? "are not working days" : "is not a working day"}`,
    );
  }

  return `There is no leave to book — ${parts.join(", and ")}.`;
}

/**
 * How much of a month's allowance an employee has actually spent.
 *
 * Days the office turned out to be closed are discounted rather than deleted:
 * when a closure is declared over leave somebody had already booked, the row
 * stays where it is and simply stops counting. That way withdrawing the closure
 * puts the day back without having to reconstruct anything.
 *
 * The weekly working days are deliberately *not* discounted here, and the
 * asymmetry is the point. A closure is a fact declared about one date, so
 * applying it backwards is the whole reason it can be withdrawn. The working
 * week is a standing configuration: moving it must not silently rewrite what
 * every past leave cost, which is what re-judging old rows against today's week
 * would do. Nothing lands on a non-working day any more — `planLeave` never
 * writes one — so this only ever concerns rows booked before the week was set,
 * and those stay exactly as they were charged.
 */
async function usedInMonth(employeeId: string, reference: Date): Promise<number> {
  const closedDates = await holidayRepository.closedDatesBetween(
    startOfUtcMonth(reference),
    endOfUtcMonth(reference),
  );

  return leaveRepository.countApprovedInMonth(employeeId, reference, closedDates);
}

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
    const requested = utcDayRange(startDate, days);
    const today = todayUtc();

    if (days < 1 || days > MAX_LEAVE_DAYS_PER_REQUEST) {
      return {
        dates: requested,
        reason,
        ok: false,
        problem: `A request has to cover between 1 and ${MAX_LEAVE_DAYS_PER_REQUEST} days.`,
      };
    }

    if (startDate.getTime() < today.getTime()) {
      return { dates: requested, reason, ok: false, problem: "Leave cannot start in the past." };
    }

    // Everything that is not a working day is removed before anything else is
    // judged — days the ordinary week does not work, and days the office has
    // been closed. Neither can clash, neither can be refused for want of
    // allowance, and neither may be written as leave. A request made entirely of
    // them is nothing to book rather than something to deduct.
    //
    // This is what makes Friday-to-Monday cost two days rather than four: the
    // range the employee asked for is unchanged, and only the working days
    // inside it are booked and charged.
    const split = await workingDaysService.split(requested);
    const dates = split.working;

    const base = {
      dates,
      reason,
      ...(split.closed.length > 0 ? { closedDates: split.closed } : {}),
      ...(split.weeklyOff.length > 0 ? { weeklyOffDates: split.weeklyOff } : {}),
    };

    // Refused rather than quietly booked as nothing. Somebody asking for a
    // Saturday off is not asking for zero days of leave, they have misunderstood
    // the calendar, and a silent success would leave them thinking they were
    // covered.
    if (dates.length === 0) {
      return { ...base, ok: false, problem: nothingToBook(split) };
    }

    const clashes = await leaveRepository.findByEmployeeAndDates(employeeId, dates);
    if (clashes.length > 0) {
      return {
        ...base,
        ok: false,
        problem: `You already have a request covering ${formatDateRange(clashes.map((c) => c.leaveDate))}.`,
      };
    }

    // Days already exempt from attendance cannot also be booked off.
    //
    // Refused rather than absorbed, and the reason is the allowance. A remote
    // day costs nothing; a leave day costs one of four in the month. Booking
    // leave over a remote day would charge somebody for a day they were already
    // not expected in — the exact opposite of what they were asking for — and
    // silently *not* charging them would leave a leave row that took nothing,
    // which every count in the system reads as a day taken. So the request is
    // turned away with the arrangement named, which is also the answer to the
    // question actually being asked: they do not need the day off.
    //
    // The refusal is here rather than in the route because `bookLeave` re-plans
    // before it writes and the assistant confirms against the same call — one
    // check covers the form, the chat proposal and the confirmation.
    const remoteDates = await remoteWorkService.remoteDatesAmong(employeeId, dates);
    if (remoteDates.length > 0) {
      return {
        ...base,
        ok: false,
        problem:
          remoteDates.length === dates.length
            ? `You are already working remotely ${formatDateRange(remoteDates)}, so there is no attendance to take leave from. Those days cost you nothing.`
            : `You are already working remotely ${formatDateRange(remoteDates)}, which is part of the range you asked for. Remote days cost you no leave — request the other days on their own.`,
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
      const used = await usedInMonth(employeeId, reference);

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
   *
   * This is the only thing that ever decides a leave. A request that fits the
   * allowance is written approved and a request that does not is refused
   * outright, so nothing is ever left waiting on a person: there is deliberately
   * no administrator override, and no queue for one to work through.
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

  async balanceFor(employeeId: string, reference: Date = new Date()): Promise<LeaveBalance> {
    const monthStart = startOfUtcMonth(reference);
    const monthEnd = endOfUtcMonth(reference);
    const closedDates = await holidayRepository.closedDatesBetween(monthStart, monthEnd);

    const [approvedThisMonth, statusCounts] = await Promise.all([
      leaveRepository.countApprovedInMonth(employeeId, reference, closedDates),
      leaveRepository.countByStatus({ employeeId, leaveDate: { gte: monthStart, lt: monthEnd } }, closedDates),
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
    const rows = await leaveRepository.countByStatus({ employeeId }, await holidayRepository.allDates());
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<LeaveStatus, number>;

    for (const row of rows) counts[row.status] = row.count;
    return counts;
  },

  /**
   * Month-by-month series for the trend chart, zero-filled for empty months.
   *
   * Narrow with `employeeId` for one person's own chart, or `role` for a whole
   * population; omit both for the organisation.
   */
  async monthlyTrend(months: number, filter: { employeeId?: string; roles?: Role[] } = {}) {
    const to = endOfUtcMonth(new Date());
    const from = addUtcMonths(startOfUtcMonth(new Date()), -(months - 1));
    const rows = await leaveRepository.monthlyTotals(from, to, filter, await holidayRepository.closedDatesBetween(from, to));

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
