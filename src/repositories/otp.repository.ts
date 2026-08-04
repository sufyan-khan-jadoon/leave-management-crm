import type { OtpCode, OtpPurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const otpRepository = {
  create(data: { employeeId: string; code: string; purpose: OtpPurpose; expiresAt: Date }): Promise<OtpCode> {
    return prisma.otpCode.create({ data });
  },

  /** Most recently issued code of this purpose, consumed or not. */
  findLatest(employeeId: string, purpose: OtpPurpose): Promise<OtpCode | null> {
    return prisma.otpCode.findFirst({
      where: { employeeId, purpose },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Most recent code of this purpose that is still usable: unconsumed and unexpired. */
  findActive(employeeId: string, purpose: OtpPurpose): Promise<OtpCode | null> {
    return prisma.otpCode.findFirst({
      where: { employeeId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  },

  markConsumed(id: string): Promise<OtpCode> {
    return prisma.otpCode.update({ where: { id }, data: { consumedAt: new Date() } });
  },

  incrementAttempts(id: string): Promise<OtpCode> {
    return prisma.otpCode.update({ where: { id }, data: { attempts: { increment: 1 } } });
  },

  /**
   * Invalidates outstanding codes of one purpose so only the newest is valid.
   * Scoped by purpose so requesting a password reset does not silently void a
   * verification code the same person is part-way through entering.
   */
  async invalidateOutstanding(employeeId: string, purpose: OtpPurpose): Promise<void> {
    await prisma.otpCode.updateMany({
      where: { employeeId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  },

  async deleteExpired(): Promise<number> {
    const result = await prisma.otpCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return result.count;
  },
};
