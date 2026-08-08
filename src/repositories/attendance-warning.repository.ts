import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const attendanceWarningSelect = {
  id: true,
  employeeId: true,
  date: true,
  consecutiveMissed: true,
  sentAt: true,
  createdAt: true,
} satisfies Prisma.AttendanceWarningSelect;

export type AttendanceWarningDto = Prisma.AttendanceWarningGetPayload<{
  select: typeof attendanceWarningSelect;
}>;

export const attendanceWarningRepository = {
  /**
   * Takes ownership of one person's warning for one day, or reports that
   * somebody else already has it.
   *
   * This is what makes a second letter impossible, and it is an insert rather
   * than a read-then-write for that reason: the unique index on
   * `(employeeId, date)` is the arbiter, so of any number of sweeps racing the
   * database picks exactly one winner and the losers are told. A retry after a
   * crash behaves the same way — the row exists, so it is never claimed twice.
   */
  async claim(employeeId: string, date: Date, consecutiveMissed: number): Promise<AttendanceWarningDto | null> {
    try {
      return await prisma.attendanceWarning.create({
        data: { employeeId, date, consecutiveMissed },
        select: attendanceWarningSelect,
      });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  /** Records that the letter actually reached the mail server. */
  markSent(id: string): Promise<AttendanceWarningDto> {
    return prisma.attendanceWarning.update({
      where: { id },
      data: { sentAt: new Date() },
      select: attendanceWarningSelect,
    });
  },

  /** Warnings already issued on a date — so a sweep can skip them cheaply. */
  async employeeIdsWarnedOn(date: Date): Promise<string[]> {
    const rows = await prisma.attendanceWarning.findMany({
      where: { date },
      select: { employeeId: true },
    });

    return rows.map((row) => row.employeeId);
  },

  /** One person's warnings, most recent first. */
  listForEmployee(employeeId: string, take = 20): Promise<AttendanceWarningDto[]> {
    return prisma.attendanceWarning.findMany({
      where: { employeeId },
      orderBy: { date: "desc" },
      take,
      select: attendanceWarningSelect,
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
