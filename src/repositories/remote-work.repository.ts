import type { Prisma, RemoteWorkAction, RemoteWorkType, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * A remote-work assignment, with enough of the people on it to name them.
 *
 * Carries no `status`: where a period stands is derived from its dates and
 * `revokedAt` by `remoteWorkState`, for the reason the Prisma model gives. A
 * column would need a sweep to keep honest and there is no sweep.
 */
export const remoteWorkSelect = {
  id: true,
  employeeId: true,
  startDate: true,
  endDate: true,
  type: true,
  reason: true,
  revokedAt: true,
  revokeReason: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: { id: true, name: true, email: true, role: true, department: true, position: true, profilePhoto: true },
  },
  assignedBy: { select: { id: true, name: true, email: true } },
  revokedBy: { select: { id: true, name: true } },
} satisfies Prisma.RemoteWorkAssignmentSelect;

export type RemoteWorkDto = Prisma.RemoteWorkAssignmentGetPayload<{ select: typeof remoteWorkSelect }>;

export const remoteWorkEventSelect = {
  id: true,
  assignmentId: true,
  employeeId: true,
  action: true,
  previousStart: true,
  previousEnd: true,
  newStart: true,
  newEnd: true,
  reason: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} satisfies Prisma.RemoteWorkEventSelect;

export type RemoteWorkEventDto = Prisma.RemoteWorkEventGetPayload<{ select: typeof remoteWorkEventSelect }>;

/**
 * Just the dates, for the bulk reads the attendance engine does.
 *
 * The roster and the report ask about a whole company across a whole month, and
 * dragging the employee, the assigner and the revoker along with every row would
 * be several joins per person to answer a question that is three columns wide.
 */
export const remoteCoverageSelect = {
  employeeId: true,
  startDate: true,
  endDate: true,
} satisfies Prisma.RemoteWorkAssignmentSelect;

export type RemoteCoverage = Prisma.RemoteWorkAssignmentGetPayload<{ select: typeof remoteCoverageSelect }>;

/**
 * The one coverage predicate, written once.
 *
 * `startDate <= day AND (endDate IS NULL OR endDate >= day)` — the SQL twin of
 * `coversDate` in `lib/remote-work.ts`, and deliberately built here rather than
 * spelled out at each call site: the roster, the history walk, the leave guard
 * and the profile all ask it, and a fifth spelling is how one of them comes to
 * disagree with the other four.
 *
 * Revoked rows are **included**, because revoking truncates `endDate` rather
 * than erasing the row — see the model. The days somebody actually worked from
 * home stay exempt; only the future comes back onto the register.
 */
function coveringDay(day: Date): Prisma.RemoteWorkAssignmentWhereInput {
  return { startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] };
}

/**
 * Rows whose coverage touches an inclusive span of days.
 *
 * The range form of the same predicate: a period overlaps `[from, to]` when it
 * starts on or before `to` and has not ended before `from`.
 */
function coveringRange(from: Date, to: Date): Prisma.RemoteWorkAssignmentWhereInput {
  return { startDate: { lte: to }, OR: [{ endDate: null }, { endDate: { gte: from } }] };
}

export type RemoteWorkListFilters = {
  search?: string;
  department?: string;
  roles?: Role[];
  /** Narrows to one person — what the profile section reads. */
  employeeId?: string;
  /**
   * Which states to return, applied **in memory** by the service.
   *
   * Absent here on purpose: a period's state is derived from its dates against
   * today, so there is no column to filter on — the same reason the attendance
   * roster is fetched whole and paged in memory. Filtering in SQL would mean
   * restating `remoteWorkState` as three date comparisons, which is the second
   * opinion this codebase keeps refusing to introduce.
   */
};

export const remoteWorkRepository = {
  findById(id: string): Promise<RemoteWorkDto | null> {
    return prisma.remoteWorkAssignment.findUnique({ where: { id }, select: remoteWorkSelect });
  },

  /**
   * Every assignment matching the filters, newest period first.
   *
   * Unpaged, and paged in memory by the service for the reason
   * `listRemoteWorkFilters` gives — the state a row is filtered on does not
   * exist in the database. An organisation has as many of these as it has
   * remote arrangements, which is bounded by headcount rather than by time.
   */
  list(filters: RemoteWorkListFilters): Promise<RemoteWorkDto[]> {
    const employee: Prisma.EmployeeWhereInput = {};

    if (filters.roles) employee.role = { in: filters.roles };
    if (filters.department) employee.department = filters.department;

    if (filters.search) {
      employee.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { department: { contains: filters.search, mode: "insensitive" } },
        { position: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    return prisma.remoteWorkAssignment.findMany({
      where: {
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(Object.keys(employee).length > 0 ? { employee } : {}),
      },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      select: remoteWorkSelect,
    });
  },

  /**
   * Who is remote on one calendar day.
   *
   * The roster's one question, asked company-wide in a single query rather than
   * once per person — the same shape as `leaveRepository.employeeIdsOnApprovedLeave`,
   * which sits beside it in `buildRoster`.
   */
  async employeeIdsRemoteOn(day: Date): Promise<string[]> {
    const rows = await prisma.remoteWorkAssignment.findMany({
      where: coveringDay(day),
      select: { employeeId: true },
      distinct: ["employeeId"],
    });

    return rows.map((row) => row.employeeId);
  },

  /**
   * Every stretch of remote coverage these people hold across a span of days.
   *
   * What `buildHistories` reads: one query for a whole report rather than one
   * per person per day. Returned as intervals rather than expanded into dates
   * because an open-ended period has no end to expand to, and the caller is
   * walking a calendar it already has.
   */
  coveringBetween(employeeIds: string[], from: Date, to: Date): Promise<RemoteCoverage[]> {
    if (employeeIds.length === 0) return Promise.resolve([]);

    return prisma.remoteWorkAssignment.findMany({
      where: { employeeId: { in: employeeIds }, ...coveringRange(from, to) },
      select: remoteCoverageSelect,
    });
  },

  /** One person's coverage across a span — the same question, narrowed. */
  coveringBetweenFor(employeeId: string, from: Date, to: Date): Promise<RemoteCoverage[]> {
    return this.coveringBetween([employeeId], from, to);
  },

  /**
   * Whether this person is remote on a given day, as the row that says so.
   *
   * Returns the assignment rather than a boolean so the screens and the
   * refusals can quote the period and its reason — "you are remote until 31
   * August" is the answer somebody blocked from checking in actually needs.
   */
  findCoveringDay(employeeId: string, day: Date): Promise<RemoteWorkDto | null> {
    return prisma.remoteWorkAssignment.findFirst({
      where: { employeeId, ...coveringDay(day) },
      // The longest-running period first, so an open-ended arrangement is what
      // gets quoted rather than a one-day one that happens to sit inside it.
      orderBy: [{ startDate: "asc" }],
      select: remoteWorkSelect,
    });
  },

  /**
   * A live assignment for this person clashing with a proposed period.
   *
   * **Revoked rows are excluded**, unlike every other query here: a period
   * somebody called off is not a conflict with a new one, however its dates
   * read — including the empty range revocation-before-start leaves behind.
   * `excludeId` is what lets an edit not collide with itself.
   */
  findOverlapping(
    employeeId: string,
    period: { startDate: Date; endDate: Date | null },
    excludeId?: string,
  ): Promise<RemoteWorkDto | null> {
    return prisma.remoteWorkAssignment.findFirst({
      where: {
        employeeId,
        revokedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        // The overlap predicate: this row starts on or before the proposal ends,
        // and has not ended before the proposal starts. An open end on either
        // side reaches forever, which is why both halves allow null.
        ...(period.endDate ? { startDate: { lte: period.endDate } } : {}),
        OR: [{ endDate: null }, { endDate: { gte: period.startDate } }],
      },
      orderBy: { startDate: "asc" },
      select: remoteWorkSelect,
    });
  },

  create(data: {
    employeeId: string;
    startDate: Date;
    endDate: Date | null;
    type: RemoteWorkType;
    reason: string;
    assignedById: string;
  }): Promise<RemoteWorkDto> {
    return prisma.remoteWorkAssignment.create({ data, select: remoteWorkSelect });
  },

  update(
    id: string,
    data: { startDate?: Date; endDate?: Date | null; type?: RemoteWorkType; reason?: string },
  ): Promise<RemoteWorkDto> {
    return prisma.remoteWorkAssignment.update({ where: { id }, data, select: remoteWorkSelect });
  },

  /**
   * Calls a period off, once.
   *
   * A conditional `updateMany` on `revokedAt: null`, so of any number of
   * requests racing on one assignment the database picks exactly one winner —
   * the same mechanism `holidayRepository.claimNotice` and
   * `complaintRepository.claimResolutionNotice` use, and here for a related
   * reason: revoking writes an audit event and sends a letter, and a second
   * revocation would produce a second of each for one act.
   *
   * `endDate` is written in the same statement, which is what keeps the days
   * already served covered — see `revocationEndDate`.
   */
  async revoke(
    id: string,
    data: { endDate: Date; revokedById: string; revokeReason: string | null },
  ): Promise<boolean> {
    const { count } = await prisma.remoteWorkAssignment.updateMany({
      where: { id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        endDate: data.endDate,
        revokedById: data.revokedById,
        revokeReason: data.revokeReason,
      },
    });

    return count === 1;
  },

  /** Writes one line of the audit trail. */
  recordEvent(data: {
    assignmentId: string;
    employeeId: string;
    action: RemoteWorkAction;
    previousStart?: Date | null;
    previousEnd?: Date | null;
    newStart?: Date | null;
    newEnd?: Date | null;
    reason?: string | null;
    actorId: string | null;
  }): Promise<RemoteWorkEventDto> {
    return prisma.remoteWorkEvent.create({ data, select: remoteWorkEventSelect });
  },

  /** One assignment's history, oldest first — the order it happened in. */
  listEvents(assignmentId: string): Promise<RemoteWorkEventDto[]> {
    return prisma.remoteWorkEvent.findMany({
      where: { assignmentId },
      orderBy: { createdAt: "asc" },
      select: remoteWorkEventSelect,
    });
  },

  /** One person's remote-work history across every assignment they have held. */
  listEventsForEmployee(employeeId: string, take = 50): Promise<RemoteWorkEventDto[]> {
    return prisma.remoteWorkEvent.findMany({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
      take,
      select: remoteWorkEventSelect,
    });
  },

  /**
   * How many people are remote on a day — the dashboard tile.
   *
   * Counted with `distinct` on the person rather than on rows, because two
   * assignments cannot both cover one day for one person (the overlap check
   * refuses it) but a revoked one and a live one can, and a tile that counted
   * somebody twice would overshoot the headcount.
   */
  async countRemoteOn(day: Date, roles?: Role[]): Promise<number> {
    const rows = await prisma.remoteWorkAssignment.findMany({
      where: {
        ...coveringDay(day),
        employee: { status: "ACTIVE", ...(roles ? { role: { in: roles } } : {}) },
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });

    return rows.length;
  },
};
