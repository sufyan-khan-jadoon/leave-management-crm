import type { InviteKey, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** The key itself is only ever returned to someone allowed to issue keys. */
const inviteSelect = {
  id: true,
  key: true,
  role: true,
  label: true,
  expiresAt: true,
  revokedAt: true,
  redeemedAt: true,
  createdAt: true,
  redeemedBy: { select: { id: true, name: true, email: true, status: true } },
} as const;

export type InviteKeyDto = {
  id: string;
  key: string;
  role: Role;
  label: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date;
  redeemedBy: { id: string; name: string; email: string; status: string } | null;
};

export const inviteRepository = {
  create(data: { key: string; role: Role; label: string | null; expiresAt: Date; issuedById: string }) {
    return prisma.inviteKey.create({ data, select: inviteSelect });
  },

  findByKey(key: string): Promise<InviteKey | null> {
    return prisma.inviteKey.findUnique({ where: { key } });
  },

  findById(id: string): Promise<InviteKey | null> {
    return prisma.inviteKey.findUnique({ where: { id } });
  },

  /**
   * Both filters are optional and compose: the caller decides how wide the view
   * is, so scoping stays an authorisation decision made in the service rather
   * than something this layer assumes.
   */
  list(filter: { issuedById?: string; role?: Role } = {}) {
    return prisma.inviteKey.findMany({
      where: { issuedById: filter.issuedById, role: filter.role },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: inviteSelect,
    });
  },

  /**
   * Marks a key spent, but only while it is still unspent.
   *
   * The `redeemedAt: null` guard makes this the point where two simultaneous
   * registrations race: the second one updates no rows and is refused, so a
   * single-use key cannot admit two people.
   */
  async redeem(id: string, employeeId: string): Promise<boolean> {
    const result = await prisma.inviteKey.updateMany({
      where: { id, redeemedAt: null, revokedAt: null },
      data: { redeemedAt: new Date(), redeemedById: employeeId },
    });

    return result.count === 1;
  },

  revoke(id: string) {
    return prisma.inviteKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: inviteSelect,
    });
  },
};
