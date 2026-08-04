import type { OtpCode } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const otpRepository = {
  create(data: { employeeId: string; code: string; expiresAt: Date }): Promise<OtpCode> {
    return prisma.otpCode.create({ data });
  },

  /** Most recently issued code for an employee, consumed or not. */
  findLatest(employeeId: string): Promise<OtpCode | null> {
    return prisma.otpCode.findFirst({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Most recent code that is still usable: unconsumed and unexpired. */
  findActive(employeeId: string): Promise<OtpCode | null> {
    return prisma.otpCode.findFirst({
      where: { employeeId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  },

  markConsumed(id: string): Promise<OtpCode> {
    return prisma.otpCode.update({ where: { id }, data: { consumedAt: new Date() } });
  },

  incrementAttempts(id: string): Promise<OtpCode> {
    return prisma.otpCode.update({ where: { id }, data: { attempts: { increment: 1 } } });
  },

  /** Invalidates outstanding codes so only the newest one is ever valid. */
  async invalidateOutstanding(employeeId: string): Promise<void> {
    await prisma.otpCode.updateMany({
      where: { employeeId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  },

  async deleteExpired(): Promise<number> {
    const result = await prisma.otpCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return result.count;
  },
};
