import { ComplaintStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Who wrote a complaint, as every screen needs to name them. */
const complaintAuthorSelect = {
  id: true,
  name: true,
  email: true,
  department: true,
  position: true,
} satisfies Prisma.EmployeeSelect;

/**
 * Enough to show a paperclip and a filename without hauling the bytes along.
 *
 * `data` is deliberately absent. It is the whole reason attachments are a table
 * of their own: a list of twenty complaints would otherwise drag twenty
 * megabytes of base64 through the connection to render a row count.
 */
const attachmentSummarySelect = {
  id: true,
  filename: true,
  contentType: true,
  size: true,
} satisfies Prisma.ComplaintAttachmentSelect;

/**
 * What an administrator sees. Everything, `internalNotes` included.
 *
 * The bytes of an attachment are still absent — that is a size question rather
 * than a permission one, and `findForAdmin` adds them for the single complaint
 * being opened.
 */
export const complaintSelect = {
  id: true,
  subject: true,
  description: true,
  status: true,
  resolution: true,
  internalNotes: true,
  resolvedAt: true,
  resolutionNoticeClaimedAt: true,
  resolutionNoticeSentAt: true,
  createdAt: true,
  updatedAt: true,
  employeeId: true,
  employee: { select: complaintAuthorSelect },
  resolvedBy: { select: { id: true, name: true, email: true } },
  attachments: { select: attachmentSummarySelect, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ComplaintSelect;

export type ComplaintDto = Prisma.ComplaintGetPayload<{ select: typeof complaintSelect }>;

/**
 * What the person who wrote it sees.
 *
 * **`internalNotes` is not here, and that omission is the mechanism** — the same
 * one `employeeSelect` uses to keep the password hash out of every response. The
 * notes are an administrator's working thoughts about somebody's grievance, and
 * they are the one field on this row that person must never read. A filter
 * applied in a service can be forgotten by the next caller; a column that was
 * never selected cannot leak.
 *
 * The two email-notice timestamps are absent for a different reason: whether the
 * letter reached them is not something to report *to* them, and "we tried to
 * email you and failed" is a message for the administrator who has to do
 * something about it.
 */
export const employeeComplaintSelect = {
  id: true,
  subject: true,
  description: true,
  status: true,
  resolution: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  employeeId: true,
  resolvedBy: { select: { id: true, name: true } },
  attachments: { select: attachmentSummarySelect, orderBy: { createdAt: "asc" } },
} satisfies Prisma.ComplaintSelect;

export type EmployeeComplaintDto = Prisma.ComplaintGetPayload<{
  select: typeof employeeComplaintSelect;
}>;

/** One attachment's actual bytes, fetched only when somebody asks for the file. */
export const attachmentDataSelect = {
  id: true,
  complaintId: true,
  filename: true,
  contentType: true,
  size: true,
  data: true,
} satisfies Prisma.ComplaintAttachmentSelect;

export type ComplaintAttachmentDto = Prisma.ComplaintAttachmentGetPayload<{
  select: typeof attachmentDataSelect;
}>;

export type ComplaintFilters = {
  search?: string;
  status?: ComplaintStatus;
  employeeId?: string;
  from?: Date;
  to?: Date;
  sort: "newest" | "oldest";
  page: number;
  pageSize: number;
};

/** The tiles above the admin table. One grouped query, not five counts. */
export type ComplaintCounts = {
  total: number;
  pending: number;
  underReview: number;
  resolved: number;
  rejected: number;
};

function buildWhere(filters: Omit<ComplaintFilters, "sort" | "page" | "pageSize">): Prisma.ComplaintWhereInput {
  const where: Prisma.ComplaintWhereInput = {};

  if (filters.status) where.status = filters.status;
  if (filters.employeeId) where.employeeId = filters.employeeId;

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  if (filters.search) {
    // The subject and the body, plus who wrote it. Searching the resolution too
    // was considered and left out: an administrator hunting for a complaint is
    // looking for the problem, and matching their own past wording would surface
    // rows that say nothing about the term they typed.
    where.OR = [
      { subject: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { employee: { name: { contains: filters.search, mode: "insensitive" } } },
      { employee: { email: { contains: filters.search, mode: "insensitive" } } },
    ];
  }

  return where;
}

export const complaintRepository = {
  create(data: {
    employeeId: string;
    subject: string;
    description: string;
    attachments: Array<{ filename: string; contentType: string; size: number; data: string }>;
  }): Promise<ComplaintDto> {
    return prisma.complaint.create({
      data: {
        employeeId: data.employeeId,
        subject: data.subject,
        description: data.description,
        ...(data.attachments.length > 0 ? { attachments: { create: data.attachments } } : {}),
      },
      select: complaintSelect,
    });
  },

  /** The admin view of one complaint. Notes included; caller has been checked. */
  findById(id: string): Promise<ComplaintDto | null> {
    return prisma.complaint.findUnique({ where: { id }, select: complaintSelect });
  },

  /**
   * One complaint **belonging to this person**, or nothing.
   *
   * The ownership check is the `where`, not a comparison the caller makes after
   * reading the row. A service that fetched by id and then compared
   * `employeeId` would work exactly as well right up until somebody forgot the
   * second half, and the failure mode is one employee reading another's
   * grievance. Here there is no row to forget to check.
   */
  findOwnedBy(id: string, employeeId: string): Promise<EmployeeComplaintDto | null> {
    return prisma.complaint.findFirst({
      where: { id, employeeId },
      select: employeeComplaintSelect,
    });
  },

  async listForAdmin(filters: ComplaintFilters): Promise<{ items: ComplaintDto[]; total: number }> {
    const where = buildWhere(filters);

    const [items, total] = await prisma.$transaction([
      prisma.complaint.findMany({
        where,
        select: complaintSelect,
        orderBy: { createdAt: filters.sort === "oldest" ? "asc" : "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.complaint.count({ where }),
    ]);

    return { items, total };
  },

  async listOwnedBy(
    employeeId: string,
    filters: { status?: ComplaintStatus; page: number; pageSize: number },
  ): Promise<{ items: EmployeeComplaintDto[]; total: number }> {
    const where: Prisma.ComplaintWhereInput = {
      employeeId,
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.complaint.findMany({
        where,
        select: employeeComplaintSelect,
        orderBy: { createdAt: "desc" },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.complaint.count({ where }),
    ]);

    return { items, total };
  },

  /**
   * The five figures above the table.
   *
   * One `groupBy` rather than five counts, and deliberately **not** narrowed by
   * the caller's filters: the tiles answer "what is the state of the queue",
   * which is a fact about the whole board rather than about whichever page is
   * being read. A "Pending: 3" that moved every time somebody typed in the
   * search box would be reporting the search, not the workload.
   */
  async counts(): Promise<ComplaintCounts> {
    const rows = await prisma.complaint.groupBy({ by: ["status"], _count: { _all: true } });

    const of = (status: ComplaintStatus) =>
      rows.find((row) => row.status === status)?._count._all ?? 0;

    return {
      total: rows.reduce((sum, row) => sum + row._count._all, 0),
      pending: of(ComplaintStatus.PENDING),
      underReview: of(ComplaintStatus.UNDER_REVIEW),
      resolved: of(ComplaintStatus.RESOLVED),
      rejected: of(ComplaintStatus.REJECTED),
    };
  },

  update(id: string, data: Prisma.ComplaintUpdateInput): Promise<ComplaintDto> {
    return prisma.complaint.update({ where: { id }, data, select: complaintSelect });
  },

  /**
   * Claims the right to send this complaint's resolution email, once, ever.
   *
   * A conditional `updateMany` on `resolutionNoticeClaimedAt: null` — so of any
   * number of callers racing on one complaint the database picks exactly one
   * winner and the rest are told no. Exactly the mechanism
   * `holidayRepository.claimNotice` and `attendanceWarningRepository.claim` use,
   * and it is here for the same reason: claiming *after* sending would leave a
   * crash in between looking identical to a complaint nobody had touched.
   *
   * It is never cleared. Reopening a resolved complaint and resolving it again
   * finds the claim already taken, which is what makes the whole
   * resolve → reopen → resolve cycle send one letter rather than two.
   */
  async claimResolutionNotice(id: string): Promise<boolean> {
    const result = await prisma.complaint.updateMany({
      where: { id, resolutionNoticeClaimedAt: null },
      data: { resolutionNoticeClaimedAt: new Date() },
    });

    return result.count === 1;
  },

  /** Records that the mailer actually accepted it. Left null when it did not. */
  async markResolutionNoticeSent(id: string): Promise<void> {
    await prisma.complaint.update({
      where: { id },
      data: { resolutionNoticeSentAt: new Date() },
    });
  },

  /** One attachment, with its bytes — and the complaint it hangs off, to check. */
  findAttachment(id: string): Promise<ComplaintAttachmentDto | null> {
    return prisma.complaintAttachment.findUnique({ where: { id }, select: attachmentDataSelect });
  },
};
