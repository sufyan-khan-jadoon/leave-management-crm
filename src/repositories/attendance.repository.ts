import { AttendanceStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { DayScope } from "@/lib/date";

export const attendanceSelect = {
  id: true,
  employeeId: true,
  date: true,
  checkInAt: true,
  status: true,
  latitude: true,
  longitude: true,
  accuracyMeters: true,
  distanceMeters: true,
  markedAt: true,
  reason: true,
  // The name travels with every read of a check-in, because every surface that
  // shows a distance has to show this instead when there is no distance to show.
  // Selecting it here rather than in a second, wider select is what stops the
  // roster and the CSV disagreeing about whether a row was proved or vouched for.
  markedBy: { select: { id: true, name: true } },
  createdAt: true,
} satisfies Prisma.AttendanceSelect;

export const attendanceWithEmployeeSelect = {
  ...attendanceSelect,
  employee: {
    select: { id: true, name: true, email: true, department: true, position: true, profilePhoto: true },
  },
} satisfies Prisma.AttendanceSelect;

export type AttendanceDto = Prisma.AttendanceGetPayload<{ select: typeof attendanceSelect }>;
export type AttendanceWithEmployeeDto = Prisma.AttendanceGetPayload<{
  select: typeof attendanceWithEmployeeSelect;
}>;

export const attendanceRepository = {
  findByEmployeeAndDate(employeeId: string, date: Date): Promise<AttendanceDto | null> {
    return prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date } },
      select: attendanceSelect,
    });
  },

  /**
   * Records an accepted check-in, or reports that one is already there.
   *
   * Null means the unique index refused a second row for the day — two taps
   * racing, which on a phone with a patchy connection is ordinary. The service
   * turns that into "you already marked attendance", which is what the employee
   * wanted to know anyway.
   */
  async create(data: {
    employeeId: string;
    date: Date;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    distanceMeters: number;
  }): Promise<AttendanceDto | null> {
    try {
      return await prisma.attendance.create({
        data: { ...data, status: AttendanceStatus.PRESENT },
        select: attendanceSelect,
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  /**
   * Records somebody present on an administrator's word rather than the
   * geofence's.
   *
   * Deliberately a **create**, not an update, and that is not a shortcut: an
   * absent person has no row to amend, because absence is the lack of one. The
   * same unique index that stops two taps racing is what stops this producing a
   * duplicate — a null return means a row for that person and day already
   * existed, and the service reports what is already there rather than replacing
   * it. Nothing here can overwrite a real check-in.
   *
   * No coordinates are written. See the model: forging the office's own
   * position would make this indistinguishable from somebody who actually stood
   * there.
   */
  async createManual(data: {
    employeeId: string;
    date: Date;
    markedById: string;
    reason: string | null;
  }): Promise<AttendanceDto | null> {
    try {
      return await prisma.attendance.create({
        data: {
          employeeId: data.employeeId,
          date: data.date,
          status: AttendanceStatus.PRESENT,
          markedById: data.markedById,
          markedAt: new Date(),
          reason: data.reason,
          // `checkInAt` defaults to now, which is the honest reading of it: the
          // moment the day was recorded. It is not backdated to the chosen date,
          // because nobody knows what time this person arrived — that is the
          // whole reason the row is being written by hand.
        },
        select: attendanceSelect,
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  /** Every check-in on one day, for the roster to join against. */
  listOnDate(date: Date): Promise<AttendanceDto[]> {
    return prisma.attendance.findMany({ where: { date }, select: attendanceSelect });
  },

  /** One person's history, most recent first. */
  async listForEmployee(
    employeeId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: AttendanceDto[]; total: number }> {
    const where: Prisma.AttendanceWhereInput = { employeeId };

    const [items, total] = await prisma.$transaction([
      prisma.attendance.findMany({
        where,
        select: attendanceSelect,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.attendance.count({ where }),
    ]);

    return { items, total };
  },

  /** One person's check-ins across an inclusive range, oldest first. */
  listForEmployeeBetween(employeeId: string, from: Date, to: Date): Promise<AttendanceDto[]> {
    return prisma.attendance.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
      select: attendanceSelect,
    });
  },

  /** How many days this person has been in, within a half-open range. */
  countForEmployeeBetween(employeeId: string, from: Date, to: Date): Promise<number> {
    return prisma.attendance.count({ where: { employeeId, date: { gte: from, lt: to } } });
  },

  /** How many check-ins exist on one day, and in the table at all. */
  countOnDate(date: Date): Promise<number> {
    return prisma.attendance.count({ where: { date } });
  },

  /** Counted the same way the clear deletes, so the preview cannot overstate it. */
  countUpTo(date: Date): Promise<number> {
    return prisma.attendance.count({ where: { date: { lte: date } } });
  },

  /**
   * Every date in the range that holds a check-in from **anybody**.
   *
   * The bulk form of the count `dayHoldsRecord` asks, for walking a stretch of
   * days at once: one grouped query instead of one count per day, which is what
   * makes a month of somebody's history a handful of round trips rather than a
   * hundred. Distinct dates only — how many people came in is not the question,
   * only whether the day was one the system was watching.
   */
  async datesWithCheckInsBetween(from: Date, to: Date): Promise<Date[]> {
    const rows = await prisma.attendance.groupBy({
      by: ["date"],
      where: { date: { gte: from, lte: to } },
    });

    return rows.map((row) => row.date);
  },

  /**
   * Erases check-ins. The only destructive read-write in this file.
   *
   * Returns how many rows went, because the count is the whole receipt: there is
   * no soft delete and nothing to inspect afterwards, so a caller that cannot say
   * "47 removed" cannot say anything at all about what it did.
   *
   * `upTo` is inclusive and bounds the clear at that day. A check-in cannot be
   * dated forward — `markPresent` only ever writes today — so the bound removes
   * nothing an unbounded delete would have kept. It is here so the three tables
   * the reset spans are cleared by one rule rather than three, and so a table
   * that later gained future rows could not quietly start losing them.
   */
  async deleteMany(scope: DayScope): Promise<number> {
    const result = await prisma.attendance.deleteMany({
      where: "on" in scope ? { date: scope.on } : { date: { lte: scope.upTo } },
    });

    return result.count;
  },

  /**
   * Who checked in on which day, across several people at once.
   *
   * One query for the whole lookback window rather than one per person per day:
   * counting a run of missed days over a fortnight would otherwise be a few
   * hundred round trips for an office of any size.
   */
  async listForEmployeesBetween(
    employeeIds: string[],
    from: Date,
    to: Date,
  ): Promise<Array<{ employeeId: string; date: Date }>> {
    if (employeeIds.length === 0) return [];

    return prisma.attendance.findMany({
      where: { employeeId: { in: employeeIds }, date: { gte: from, lte: to } },
      select: { employeeId: true, date: true },
    });
  },
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
