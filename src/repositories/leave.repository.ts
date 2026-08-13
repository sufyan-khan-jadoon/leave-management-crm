import { LeaveStatus, type Prisma, type Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { endOfUtcMonth, startOfUtcMonth, type DayScope } from "@/lib/date";

export const leaveSelect = {
  id: true,
  employeeId: true,
  leaveDate: true,
  reason: true,
  status: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeaveSelect;

export const leaveWithEmployeeSelect = {
  ...leaveSelect,
  employee: {
    select: { id: true, name: true, email: true, department: true, position: true, profilePhoto: true },
  },
} satisfies Prisma.LeaveSelect;

export type LeaveDto = Prisma.LeaveGetPayload<{ select: typeof leaveSelect }>;
export type LeaveWithEmployeeDto = Prisma.LeaveGetPayload<{ select: typeof leaveWithEmployeeSelect }>;

export type LeaveListFilters = {
  employeeId?: string;
  status?: LeaveStatus;
  department?: string;
  /**
   * Narrows to one population, exactly as the attendance roster's filter does.
   * Absent means every role — which is what an administrator has always been
   * shown here, so this widens what may be *asked for* and never changes what
   * comes back by default.
   */
  roles?: Role[];
  search?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
  sortBy: "leaveDate" | "createdAt" | "status";
  sortDir: "asc" | "desc";
};

export const leaveRepository = {
  findById(id: string): Promise<LeaveWithEmployeeDto | null> {
    return prisma.leave.findUnique({ where: { id }, select: leaveWithEmployeeSelect });
  },

  create(data: {
    employeeId: string;
    leaveDate: Date;
    reason: string;
    status: LeaveStatus;
  }): Promise<LeaveDto> {
    return prisma.leave.create({ data, select: leaveSelect });
  },

  delete(id: string): Promise<LeaveDto> {
    return prisma.leave.delete({ where: { id }, select: leaveSelect });
  },

  /**
   * How many rows a clear would actually take, counted the same way it deletes.
   *
   * Replaces a bare `countAll`, and deliberately: the preview and the delete have
   * to answer the same question or the dialog promises to remove a number it then
   * does not. Since the delete stops at `upTo`, the count has to as well — future
   * bookings are neither removed nor counted.
   */
  countUpTo(date: Date): Promise<number> {
    return prisma.leave.count({ where: { leaveDate: { lte: date } } });
  },

  /** Leave booked on one calendar day, across everybody. */
  countOnDate(date: Date): Promise<number> {
    return prisma.leave.count({ where: { leaveDate: date } });
  },

  /**
   * Every date in the range on which **anybody** holds approved leave.
   *
   * The counterpart of `attendanceRepository.datesWithCheckInsBetween`, and
   * approved-only for the same reason `warningExposure` is: this answers what
   * the roster would say about the day, and a legacy `PENDING` row keeps nobody
   * off it.
   */
  async datesWithApprovedLeaveBetween(from: Date, to: Date): Promise<Date[]> {
    const rows = await prisma.leave.groupBy({
      by: ["leaveDate"],
      where: { leaveDate: { gte: from, lte: to }, status: LeaveStatus.APPROVED },
    });

    return rows.map((row) => row.leaveDate);
  },

  /** One person's approved leave across a range, most recent first. */
  approvedForEmployeeBetween(employeeId: string, from: Date, to: Date): Promise<LeaveDto[]> {
    return prisma.leave.findMany({
      where: { employeeId, status: LeaveStatus.APPROVED, leaveDate: { gte: from, lte: to } },
      orderBy: { leaveDate: "asc" },
      select: leaveSelect,
    });
  },

  /**
   * Erases leave — one calendar day of it, or every row ever booked.
   *
   * The filter is a **date and nothing else**, and that limit is the whole of
   * why it is safe to have one. Narrowing by employee is the shape this must
   * never take: it would be a way to hand one person their allowance back while
   * the counts that police the policy went on reading everybody else's history,
   * with nothing on the row to show it had happened. A date applies to the whole
   * company at once, exactly as `attendanceRepository.deleteMany` does, so the
   * super admin cannot use it to favour anybody.
   *
   * **`upTo` is inclusive of that day and stops there, which is the point.** This
   * took no bound at all and deleted the table, and leave is the one table here
   * that is routinely dated *forward* — booking it is booking a future day. So
   * "clear the history" destroyed leave that had not happened yet: somebody's
   * approved week off next month went with the records of last month, and since
   * no balance is stored anywhere, nothing could put it back or even show it had
   * gone. Clearing history must reach backwards only.
   *
   * The filter is a **date and nothing else**, and that limit is the whole of
   * why it is safe to have one — see above.
   *
   * Every figure downstream is derived from these rows rather than stored —
   * balance, the monthly limit, the trend and the department chart all count
   * them — so removing them is the whole of the undo. There is nothing else to
   * put back, and nothing else to correct afterwards.
   */
  async deleteMany(scope: DayScope): Promise<number> {
    const result = await prisma.leave.deleteMany({
      where: "on" in scope ? { leaveDate: scope.on } : { leaveDate: { lte: scope.upTo } },
    });

    return result.count;
  },

  /**
   * Approved leaves an employee has consumed in the calendar month of
   * `reference`, discounting any day the office turned out to be closed.
   *
   * The exclusion is what makes a closure declared *after* someone booked leave
   * give them the day back. Nothing is rewritten when the office closes — the
   * leave row stays exactly where it was — so this count, and every other one
   * that decides an allowance, has to ask the question instead.
   */
  countApprovedInMonth(
    employeeId: string,
    reference: Date = new Date(),
    closedDates: Date[] = [],
  ): Promise<number> {
    return prisma.leave.count({
      where: {
        employeeId,
        status: LeaveStatus.APPROVED,
        leaveDate: {
          gte: startOfUtcMonth(reference),
          lt: endOfUtcMonth(reference),
          ...(closedDates.length > 0 ? { notIn: closedDates } : {}),
        },
      },
    });
  },

  /**
   * Approved plus still-queued requests for the month.
   *
   * The allowance is checked against this rather than approved alone: while
   * requests wait out the delay, counting only approved would let someone queue
   * any number inside the window and have every one of them approved later.
   */
  countCommittedInMonth(employeeId: string, reference: Date = new Date()): Promise<number> {
    return prisma.leave.count({
      where: {
        employeeId,
        status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
        leaveDate: { gte: startOfUtcMonth(reference), lt: endOfUtcMonth(reference) },
      },
    });
  },

  /** Existing requests that would clash with any day of a proposed range. */
  findByEmployeeAndDates(employeeId: string, dates: Date[]): Promise<LeaveDto[]> {
    return prisma.leave.findMany({
      where: { employeeId, leaveDate: { in: dates }, status: { not: LeaveStatus.REJECTED } },
      orderBy: { leaveDate: "asc" },
      select: leaveSelect,
    });
  },

  /** Books a whole range in one statement so a partial failure cannot land. */
  async createManyApproved(
    employeeId: string,
    dates: Date[],
    reason: string,
  ): Promise<LeaveDto[]> {
    const decidedAt = new Date();

    await prisma.leave.createMany({
      data: dates.map((leaveDate) => ({
        employeeId,
        leaveDate,
        reason,
        status: LeaveStatus.APPROVED,
        decidedAt,
      })),
    });

    return prisma.leave.findMany({
      where: { employeeId, leaveDate: { in: dates } },
      orderBy: { leaveDate: "asc" },
      select: leaveSelect,
    });
  },

  /** Queued requests whose delay has elapsed, oldest first. */
  findDueForDecision(cutoff: Date, take = 50): Promise<LeaveWithEmployeeDto[]> {
    return prisma.leave.findMany({
      where: { status: LeaveStatus.PENDING, createdAt: { lte: cutoff } },
      orderBy: { createdAt: "asc" },
      take,
      select: leaveWithEmployeeSelect,
    });
  },

  /**
   * Records an automatic decision. `decidedById` stays null — that column marks
   * a human override, which keeps the two kinds of decision distinguishable.
   */
  markAutoDecided(id: string, status: LeaveStatus): Promise<LeaveWithEmployeeDto> {
    return prisma.leave.update({
      where: { id },
      data: { status, decidedAt: new Date() },
      select: leaveWithEmployeeSelect,
    });
  },

  /**
   * Who holds approved leave on one date.
   *
   * The attendance roster asks this so somebody who booked the day off does not
   * read as having failed to turn up. Ids only — the roster already knows who
   * everybody is, and joining the employee here would fetch each of them twice.
   */
  async employeeIdsOnApprovedLeave(date: Date): Promise<string[]> {
    const rows = await prisma.leave.findMany({
      where: { leaveDate: date, status: LeaveStatus.APPROVED },
      select: { employeeId: true },
    });

    return rows.map((row) => row.employeeId);
  },

  /**
   * Approved leave held by several people across a range.
   *
   * The lookback counterpart of `employeeIdsOnApprovedLeave`: counting a run of
   * missed days has to know which of them somebody had legitimately booked off,
   * and asking day by day would be a query per day per person.
   */
  async approvedForEmployeesBetween(
    employeeIds: string[],
    from: Date,
    to: Date,
  ): Promise<Array<{ employeeId: string; leaveDate: Date }>> {
    if (employeeIds.length === 0) return [];

    return prisma.leave.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: LeaveStatus.APPROVED,
        leaveDate: { gte: from, lte: to },
      },
      select: { employeeId: true, leaveDate: true },
    });
  },

  findByEmployeeAndDate(employeeId: string, leaveDate: Date): Promise<LeaveDto | null> {
    return prisma.leave.findFirst({
      where: { employeeId, leaveDate, status: { not: LeaveStatus.REJECTED } },
      select: leaveSelect,
    });
  },

  async list(filters: LeaveListFilters): Promise<{ items: LeaveWithEmployeeDto[]; total: number }> {
    const where = buildLeaveWhere(filters);

    const [items, total] = await prisma.$transaction([
      prisma.leave.findMany({
        where,
        select: leaveWithEmployeeSelect,
        orderBy: { [filters.sortBy]: filters.sortDir },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.leave.count({ where }),
    ]);

    return { items, total };
  },

  /** Unpaginated variant used by the CSV export. */
  listAll(filters: Omit<LeaveListFilters, "page" | "pageSize">): Promise<LeaveWithEmployeeDto[]> {
    return prisma.leave.findMany({
      where: buildLeaveWhere(filters),
      select: leaveWithEmployeeSelect,
      orderBy: { [filters.sortBy]: filters.sortDir },
    });
  },

  countByStatus(
    where?: Prisma.LeaveWhereInput,
    closedDates: Date[] = [],
  ): Promise<Array<{ status: LeaveStatus; count: number }>> {
    return prisma.leave
      .groupBy({ by: ["status"], where: excludingClosedDays(where, closedDates), _count: { _all: true } })
      .then((rows) => rows.map((row) => ({ status: row.status, count: row._count._all })));
  },

  /**
   * Leave counts grouped by month for the trend chart.
   *
   * `roles` narrows to one population — the admin overview reports on employees
   * and administrators separately, and their leave is what makes the two views
   * different rather than just differently labelled.
   */
  async monthlyTotals(
    from: Date,
    to: Date,
    filter: { employeeId?: string; roles?: Role[] } = {},
    closedDates: Date[] = [],
  ): Promise<Array<{ month: Date; status: LeaveStatus; count: number }>> {
    const rows = await prisma.leave.findMany({
      where: {
        leaveDate: { gte: from, lt: to, ...(closedDates.length > 0 ? { notIn: closedDates } : {}) },
        ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
        ...(filter.roles ? { employee: { role: { in: filter.roles } } } : {}),
      },
      select: { leaveDate: true, status: true },
    });

    const buckets = new Map<string, { month: Date; status: LeaveStatus; count: number }>();

    for (const row of rows) {
      const month = startOfUtcMonth(row.leaveDate);
      const key = `${month.toISOString()}|${row.status}`;
      const bucket = buckets.get(key);

      if (bucket) bucket.count += 1;
      else buckets.set(key, { month, status: row.status, count: 1 });
    }

    return [...buckets.values()].sort((a, b) => a.month.getTime() - b.month.getTime());
  },

  /** Leave counts per department, for the admin breakdown chart. */
  async departmentTotals(
    filter: { from?: Date; to?: Date; roles?: Role[] } = {},
    closedDates: Date[] = [],
  ): Promise<Array<{ department: string; count: number }>> {
    const rows = await prisma.leave.findMany({
      where: excludingClosedDays(
        {
          ...(filter.from && filter.to ? { leaveDate: { gte: filter.from, lt: filter.to } } : {}),
          employee: { department: { not: null }, ...(filter.roles ? { role: { in: filter.roles } } : {}) },
        },
        closedDates,
      ),
      select: { employee: { select: { department: true } } },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      const department = row.employee.department ?? "Unassigned";
      counts.set(department, (counts.get(department) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);
  },

  recent(limit: number, roles?: Role[]): Promise<LeaveWithEmployeeDto[]> {
    return prisma.leave.findMany({
      where: roles ? { employee: { role: { in: roles } } } : undefined,
      select: leaveWithEmployeeSelect,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  searchByReason(term: string, limit: number): Promise<LeaveWithEmployeeDto[]> {
    return prisma.leave.findMany({
      where: { reason: { contains: term, mode: "insensitive" } },
      select: leaveWithEmployeeSelect,
      take: limit,
      orderBy: { createdAt: "desc" },
    });
  },
};

/**
 * Narrows a filter to leave that actually cost somebody a day.
 *
 * Merged into any existing `leaveDate` range rather than replacing it, so a
 * month-bounded count stays month-bounded. An empty list is left alone: a
 * `notIn: []` is harmless but reads as though something were being excluded.
 */
function excludingClosedDays(
  where: Prisma.LeaveWhereInput | undefined,
  closedDates: Date[],
): Prisma.LeaveWhereInput | undefined {
  if (closedDates.length === 0) return where;

  return {
    ...where,
    leaveDate: { ...(where?.leaveDate as Prisma.DateTimeFilter | undefined), notIn: closedDates },
  };
}

function buildLeaveWhere(
  filters: Partial<LeaveListFilters>,
): Prisma.LeaveWhereInput {
  const where: Prisma.LeaveWhereInput = {};

  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.status) where.status = filters.status;

  // Department and population both narrow the *employee*, so they are merged
  // into one clause rather than assigned in turn — writing `where.employee`
  // twice would silently drop whichever came first.
  const employee: Prisma.EmployeeWhereInput = {};
  if (filters.department) employee.department = filters.department;
  if (filters.roles) employee.role = { in: filters.roles };
  if (Object.keys(employee).length > 0) where.employee = employee;

  if (filters.from || filters.to) {
    where.leaveDate = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  if (filters.search) {
    where.OR = [
      { reason: { contains: filters.search, mode: "insensitive" } },
      { employee: { name: { contains: filters.search, mode: "insensitive" } } },
      { employee: { email: { contains: filters.search, mode: "insensitive" } } },
      { employee: { department: { contains: filters.search, mode: "insensitive" } } },
    ];
  }

  return where;
}
