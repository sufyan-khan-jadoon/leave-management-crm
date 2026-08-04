import type { AdminInviteKey } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** The key itself is only ever returned to the super admin who issued it. */
const inviteSelect = {
  id: true,
  key: true,
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
  label: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date;
  redeemedBy: { id: string; name: string; email: string; status: string } | null;
};

export const inviteRepository = {
  create(data: { key: string; label: string | null; expiresAt: Date; issuedById: string }) {
    return prisma.adminInviteKey.create({ data, select: inviteSelect });
  },

  findByKey(key: string): Promise<AdminInviteKey | null> {
    return prisma.adminInviteKey.findUnique({ where: { key } });
  },

  findById(id: string): Promise<AdminInviteKey | null> {
    return prisma.adminInviteKey.findUnique({ where: { id } });
  },

  list(issuedById: string) {
    return prisma.adminInviteKey.findMany({
      where: { issuedById },
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
    const result = await prisma.adminInviteKey.updateMany({
      where: { id, redeemedAt: null, revokedAt: null },
      data: { redeemedAt: new Date(), redeemedById: employeeId },
    });

    return result.count === 1;
  },

  revoke(id: string) {
    return prisma.adminInviteKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: inviteSelect,
    });
  },
};
