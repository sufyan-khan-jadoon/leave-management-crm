import { InvitationStatus, Prisma, type Invitation, type Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * What an administrator sees of an invitation.
 *
 * `tokenHash` is deliberately absent. It is the one column that would let a
 * caller reconstruct nothing useful on its own — but the list is rendered in a
 * browser, and a credential's hash has no business travelling there.
 */
const invitationSelect = {
  id: true,
  email: true,
  role: true,
  jobRole: { select: { id: true, name: true } },
  status: true,
  expiresAt: true,
  acceptedAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true, email: true, status: true } },
} as const;

export type InvitationDto = Prisma.InvitationGetPayload<{ select: typeof invitationSelect }>;

type CreateInput = {
  email: string;
  tokenHash: string;
  role: Role;
  jobRoleId: string | null;
  expiresAt: Date;
  invitedById: string;
};

export const invitationRepository = {
  /**
   * Creates an invitation, or reports the address as already invited.
   *
   * The unique index on `email` is what actually settles a race between two
   * administrators inviting the same person at the same moment, so the
   * violation is translated here rather than left to surface as a 500.
   */
  async create(data: CreateInput): Promise<InvitationDto | null> {
    try {
      return await prisma.invitation.create({ data, select: invitationSelect });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    }
  },

  /**
   * Re-addresses an existing invitation: a new token, a new expiry, and
   * whatever role and title were chosen this time. Used both to resend and to
   * replace one that lapsed, so a stale row never blocks the address forever.
   */
  reissue(
    id: string,
    data: { tokenHash: string; role: Role; jobRoleId: string | null; expiresAt: Date; invitedById: string },
  ): Promise<InvitationDto> {
    return prisma.invitation.update({
      where: { id },
      data: { ...data, status: InvitationStatus.PENDING, acceptedAt: null, acceptedById: null },
      select: invitationSelect,
    });
  },

  findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    return prisma.invitation.findUnique({ where: { tokenHash } });
  },

  findByEmail(email: string): Promise<Invitation | null> {
    return prisma.invitation.findUnique({ where: { email } });
  },

  findById(id: string): Promise<Invitation | null> {
    return prisma.invitation.findUnique({ where: { id } });
  },

  /**
   * Both filters are optional and compose: the caller decides how wide the view
   * is, so scoping stays an authorisation decision made in the service rather
   * than something this layer assumes.
   */
  list(filter: { invitedById?: string; role?: Role } = {}): Promise<InvitationDto[]> {
    return prisma.invitation.findMany({
      where: { invitedById: filter.invitedById, role: filter.role },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: invitationSelect,
    });
  },

  /**
   * Marks an invitation accepted, but only while it is still pending.
   *
   * The `status: PENDING` guard makes this the point where two simultaneous
   * registrations race: the second one updates no rows and is refused, so a
   * single invitation cannot admit two accounts.
   */
  async accept(id: string, employeeId: string): Promise<boolean> {
    const result = await prisma.invitation.updateMany({
      where: { id, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date(), acceptedById: employeeId },
    });

    return result.count === 1;
  },

  /** Removes an invitation outright. Only ever called for unaccepted ones. */
  delete(id: string): Promise<InvitationDto> {
    return prisma.invitation.delete({ where: { id }, select: invitationSelect });
  },
};
