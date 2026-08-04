import { LeaveStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { endOfUtcMonth, startOfUtcMonth } from "@/lib/date";

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

  updateStatus(id: string, status: LeaveStatus, decidedById: string): Promise<LeaveWithEmployeeDto> {
    return prisma.leave.update({
      where: { id },
      data: { status, decidedById, decidedAt: new Date() },
      select: leaveWithEmployeeSelect,
    });
  },

  delete(id: string): Promise<LeaveDto> {
    return prisma.leave.delete({ where: { id }, select: leaveSelect });
  },

  /** Approved leaves an employee has consumed in the calendar month of `reference`. */
  countApprovedInMonth(employeeId: string, reference: Date = new Date()): Promise<number> {
    return prisma.leave.count({
      where: {
        employeeId,
        status: LeaveStatus.APPROVED,
        leaveDate: { gte: startOfUtcMonth(reference), lt: endOfUtcMonth(reference) },
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

  countByStatus(where?: Prisma.LeaveWhereInput): Promise<Array<{ status: LeaveStatus; count: number }>> {
    return prisma.leave
      .groupBy({ by: ["status"], where, _count: { _all: true } })
      .then((rows) => rows.map((row) => ({ status: row.status, count: row._count._all })));
  },

  /** Leave counts grouped by month for the trend chart. */
  async monthlyTotals(
    from: Date,
    to: Date,
    employeeId?: string,
  ): Promise<Array<{ month: Date; status: LeaveStatus; count: number }>> {
    const rows = await prisma.leave.findMany({
      where: { leaveDate: { gte: from, lt: to }, ...(employeeId ? { employeeId } : {}) },
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

  /** Approved-leave counts per department, for the admin breakdown chart. */
  async departmentTotals(from?: Date, to?: Date): Promise<Array<{ department: string; count: number }>> {
    const rows = await prisma.leave.findMany({
      where: {
        ...(from && to ? { leaveDate: { gte: from, lt: to } } : {}),
        employee: { department: { not: null } },
      },
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

  recent(limit: number): Promise<LeaveWithEmployeeDto[]> {
    return prisma.leave.findMany({
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

function buildLeaveWhere(
  filters: Partial<LeaveListFilters>,
): Prisma.LeaveWhereInput {
  const where: Prisma.LeaveWhereInput = {};

  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.status) where.status = filters.status;
  if (filters.department) where.employee = { department: filters.department };

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
