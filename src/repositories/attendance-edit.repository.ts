import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AttendanceEditQuery } from "@/validations/attendance-edit.schema";

/**
 * Both people by name, and neither by address.
 *
 * The log answers "who changed what, for whom, and when", which needs names and
 * nothing more. Email is deliberately absent: this screen is read by the super
 * admin, who can reach either account from Staff, and an audit table is the last
 * place to widen what a select carries — the same reasoning `employeeSelect`
 * applies to the password hash and `employeeComplaintSelect` to internal notes.
 */
export const attendanceEditSelect = {
  id: true,
  date: true,
  previousStatus: true,
  newStatus: true,
  note: true,
  editorRole: true,
  createdAt: true,
  employee: { select: { id: true, name: true, department: true, position: true } },
  editedBy: { select: { id: true, name: true } },
} satisfies Prisma.AttendanceEditSelect;

export type AttendanceEditDto = Prisma.AttendanceEditGetPayload<{
  select: typeof attendanceEditSelect;
}>;

/**
 * Newest first, and by `createdAt` rather than by the attendance date.
 *
 * The question this screen opens on is "what has been changed lately", not
 * "which is the most recent day anybody corrected" — an administrator fixing
 * last March this morning belongs at the top, and ordering by `date` would bury
 * it under corrections made weeks ago to days in the future of it.
 */
const orderBy = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.AttendanceEditOrderByWithRelationInput[];

function whereFrom(filters: Omit<AttendanceEditQuery, "page" | "pageSize">): Prisma.AttendanceEditWhereInput {
  return {
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    ...(filters.editedById ? { editedById: filters.editedById } : {}),
    ...(filters.date ? { date: filters.date } : {}),
    ...(filters.previousStatus ? { previousStatus: filters.previousStatus } : {}),
    ...(filters.newStatus ? { newStatus: filters.newStatus } : {}),
    // Across both names, because the log is read from either end — looking for
    // what was done *to* somebody and looking for what somebody *did* are the
    // two ways in, and a searcher typing a name rarely knows which they want.
    ...(filters.search
      ? {
          OR: [
            { employee: { name: { contains: filters.search, mode: "insensitive" as const } } },
            { editedBy: { name: { contains: filters.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

export const attendanceEditRepository = {
  /**
   * Writes the audit row.
   *
   * Takes both statuses as plain strings because `AttendanceDayStatus` is
   * derived in `describeDay` and has never existed in the database — see the
   * model. The service is the only caller and passes what the roster actually
   * said, before and after.
   */
  record(data: {
    employeeId: string;
    date: Date;
    previousStatus: string;
    newStatus: string;
    /** Null whenever the administrator had nothing to add — the ordinary case. */
    note: string | null;
    editedById: string;
    editorRole: string;
  }): Promise<AttendanceEditDto> {
    return prisma.attendanceEdit.create({ data, select: attendanceEditSelect });
  },

  /** The log, paged in SQL — unlike the roster, every column here is a real one. */
  async list(filters: AttendanceEditQuery): Promise<{ items: AttendanceEditDto[]; total: number }> {
    const where = whereFrom(filters);

    const [items, total] = await Promise.all([
      prisma.attendanceEdit.findMany({
        where,
        select: attendanceEditSelect,
        orderBy,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.attendanceEdit.count({ where }),
    ]);

    return { items, total };
  },

  /** One person's corrections, for their own profile and report. */
  listForEmployee(employeeId: string, take = 20): Promise<AttendanceEditDto[]> {
    return prisma.attendanceEdit.findMany({
      where: { employeeId },
      select: attendanceEditSelect,
      orderBy,
      take,
    });
  },
};
