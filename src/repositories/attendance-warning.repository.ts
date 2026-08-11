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

  countAll(): Promise<number> {
    return prisma.attendanceWarning.count();
  },

  /** Claims held for one date — the rows that would stop a re-sweep writing again. */
  countOnDate(date: Date): Promise<number> {
    return prisma.attendanceWarning.count({ where: { date } });
  },

  /**
   * Erases the absence record — one day of it, or every warning ever claimed.
   *
   * This is the **only** stored trace of absence in the system. Nothing else
   * records that somebody missed a day: `AttendanceStatus` has one value, and
   * absence is derived from the lack of a check-in. So this is the whole of what
   * "clear the absences" can mean, and the reason the target exists at all.
   *
   * Permitted by argument rather than forbidden outright, and the argument is
   * the one `warningExposure` already makes. `dispatchAttendanceWarnings` only
   * ever sweeps `todayUtc()`, so deleting a claim for any **past** day cannot
   * produce a second letter — the sweep will never look there again, and the row
   * was only ever load-bearing on the day it was written. The live case is
   * today's claims: removing one lets the next sweep write to somebody it has
   * already written to. That is reported in the dialog rather than prevented
   * here, exactly as clearing today's check-ins is.
   *
   * The date filter narrows *which* claims go and changes none of that. If
   * anything it sharpens it: clearing one past day is provably inert, and the
   * dialog can say so instead of describing a risk that applies to one row out
   * of a year's worth.
   *
   * Delivered mail is untouched, and cannot be otherwise. The letters have been
   * read; what goes is the record of having sent them, and the
   * `consecutiveMissed` streak that later letters would have counted from.
   */
  async deleteMany(date?: Date): Promise<number> {
    const result = await prisma.attendanceWarning.deleteMany({
      where: date ? { date } : undefined,
    });

    return result.count;
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
