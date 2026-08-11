import { type EmailAudience, type EmailDispatchStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const emailDispatchSelect = {
  id: true,
  audience: true,
  subject: true,
  recipientCount: true,
  deliveredCount: true,
  status: true,
  createdAt: true,
  sender: { select: { id: true, name: true, email: true, role: true } },
  recipient: { select: { id: true, name: true } },
} satisfies Prisma.EmailDispatchSelect;

export type EmailDispatchDto = Prisma.EmailDispatchGetPayload<{ select: typeof emailDispatchSelect }>;

export const emailDispatchRepository = {
  /**
   * Records one send.
   *
   * Written after the mail has been attempted rather than before, which is the
   * opposite of `AttendanceWarning.claim` and `Holiday.claimNotice` — and
   * deliberately so. Those two claim first because they run unattended and race
   * with themselves, so the row exists to stop a second copy going out. This one
   * is a person pressing a button and waiting for the answer: there is nothing to
   * race, and the interesting fact is the delivery count, which does not exist
   * until the sending is done.
   */
  create(data: {
    senderId: string;
    audience: EmailAudience;
    subject: string;
    recipientCount: number;
    deliveredCount: number;
    status: EmailDispatchStatus;
    recipientId?: string | null;
  }): Promise<EmailDispatchDto> {
    return prisma.emailDispatch.create({ data, select: emailDispatchSelect });
  },

  /**
   * The audit trail, newest first.
   *
   * `senderId` narrows it to one administrator's own sends. The super admin
   * passes nothing and sees everything — the log exists so somebody can answer
   * "who wrote to the organisation", and an administrator able to read only
   * their own row cannot use it to inspect their colleagues.
   */
  async list(filters: {
    senderId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: EmailDispatchDto[]; total: number }> {
    const where: Prisma.EmailDispatchWhereInput = filters.senderId ? { senderId: filters.senderId } : {};

    const [items, total] = await prisma.$transaction([
      prisma.emailDispatch.findMany({
        where,
        select: emailDispatchSelect,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.emailDispatch.count({ where }),
    ]);

    return { items, total };
  },

  count(): Promise<number> {
    return prisma.emailDispatch.count();
  },

  /**
   * Erases the whole trail, and says how many rows went.
   *
   * Deliberately takes no `senderId`, unlike `list` above. Narrowing this to one
   * administrator's own sends is the single shape it must not have: the log
   * exists to answer "who wrote to the organisation", and a sender able to remove
   * their own rows would be answering that question for everybody but themselves.
   * Who may call it at all is settled a layer up.
   */
  async deleteAll(): Promise<number> {
    const result = await prisma.emailDispatch.deleteMany();
    return result.count;
  },
};
