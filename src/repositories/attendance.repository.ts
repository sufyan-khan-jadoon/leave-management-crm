import { AttendanceStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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

  /** How many days this person has been in, within a half-open range. */
  countForEmployeeBetween(employeeId: string, from: Date, to: Date): Promise<number> {
    return prisma.attendance.count({ where: { employeeId, date: { gte: from, lt: to } } });
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
