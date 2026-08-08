import { HolidayNotice, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const holidaySelect = {
  id: true,
  date: true,
  reason: true,
  notice: true,
  noticeDueAt: true,
  noticeSentAt: true,
  createdAt: true,
  updatedAt: true,
  declaredBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.HolidaySelect;

export type HolidayDto = Prisma.HolidayGetPayload<{ select: typeof holidaySelect }>;

/** Written by whoever declares or reschedules a closure. */
export type HolidayNoticeState = {
  notice: HolidayNotice;
  noticeDueAt: Date | null;
  noticeSentAt?: Date | null;
};

export const holidayRepository = {
  findById(id: string): Promise<HolidayDto | null> {
    return prisma.holiday.findUnique({ where: { id }, select: holidaySelect });
  },

  findByDate(date: Date): Promise<HolidayDto | null> {
    return prisma.holiday.findUnique({ where: { date }, select: holidaySelect });
  },

  /** Every closure, soonest first among those still to come. */
  list(): Promise<HolidayDto[]> {
    return prisma.holiday.findMany({ orderBy: { date: "desc" }, select: holidaySelect });
  },

  /** Closures from `date` onwards, for the "what's coming" panels. */
  upcoming(from: Date, take = 5): Promise<HolidayDto[]> {
    return prisma.holiday.findMany({
      where: { date: { gte: from } },
      orderBy: { date: "asc" },
      take,
      select: holidaySelect,
    });
  },

  /**
   * Which of `dates` the office is closed on.
   *
   * The one question the leave rules ask, and they ask it about a whole range at
   * a time, so it is a single query rather than one per day.
   */
  async closedDatesAmong(dates: Date[]): Promise<Date[]> {
    if (dates.length === 0) return [];

    const rows = await prisma.holiday.findMany({
      where: { date: { in: dates } },
      select: { date: true },
      orderBy: { date: "asc" },
    });

    return rows.map((row) => row.date);
  },

  /**
   * Every closed date on record.
   *
   * Deliberately unpaginated: an office closes a couple of dozen times a year,
   * so the whole set is small enough to hand to a `notIn` and settle "which of
   * these leave rows don't count" in one query rather than one per row.
   */
  async allDates(): Promise<Date[]> {
    const rows = await prisma.holiday.findMany({ select: { date: true }, orderBy: { date: "asc" } });
    return rows.map((row) => row.date);
  },

  /** Closures inside a half-open range — how a month's leave count discounts them. */
  async closedDatesBetween(from: Date, to: Date): Promise<Date[]> {
    const rows = await prisma.holiday.findMany({
      where: { date: { gte: from, lt: to } },
      select: { date: true },
      orderBy: { date: "asc" },
    });

    return rows.map((row) => row.date);
  },

  async create(data: {
    date: Date;
    reason: string;
    declaredById: string;
    notice: HolidayNotice;
    noticeDueAt: Date | null;
  }): Promise<HolidayDto | null> {
    try {
      return await prisma.holiday.create({ data, select: holidaySelect });
    } catch (error) {
      // P2002 is the unique index on `date` refusing a second closure for a day
      // somebody else declared between the check and this insert. Reported as
      // null so the service can phrase it, rather than leaking a Prisma error.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  async update(
    id: string,
    data: { date?: Date; reason?: string } & Partial<HolidayNoticeState>,
  ): Promise<HolidayDto | null> {
    try {
      return await prisma.holiday.update({ where: { id }, data, select: holidaySelect });
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  },

  delete(id: string): Promise<HolidayDto> {
    return prisma.holiday.delete({ where: { id }, select: holidaySelect });
  },

  /** Announcements whose moment has arrived and which nobody has made yet. */
  findDueNotices(now: Date, take = 25): Promise<HolidayDto[]> {
    return prisma.holiday.findMany({
      where: { notice: HolidayNotice.SCHEDULED, noticeDueAt: { lte: now } },
      orderBy: { noticeDueAt: "asc" },
      take,
      select: holidaySelect,
    });
  },

  /**
   * Takes ownership of one announcement, or reports that somebody else already
   * has it.
   *
   * This is what makes a second email impossible. The status moves out of
   * SCHEDULED inside the `where` clause, so two workers racing on the same row
   * both issue the same conditional update and the database picks exactly one
   * winner — the loser matches nothing and is told, rather than going on to send
   * a duplicate. A retry after a crash behaves the same way: the row is no
   * longer SCHEDULED, so it is never claimed twice.
   */
  async claimNotice(id: string, to: HolidayNotice): Promise<boolean> {
    const { count } = await prisma.holiday.updateMany({
      where: { id, notice: HolidayNotice.SCHEDULED },
      data: { notice: to },
    });

    return count === 1;
  },

  /** Records how a claimed announcement actually went. */
  settleNotice(id: string, notice: HolidayNotice, sentAt: Date | null): Promise<HolidayDto> {
    return prisma.holiday.update({
      where: { id },
      data: { notice, noticeSentAt: sentAt },
      select: holidaySelect,
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
