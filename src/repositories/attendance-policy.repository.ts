import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The policy is a single row under a fixed id.
 *
 * Pinning the id is what makes it a singleton: every write is an upsert on the
 * same key, so two administrators saving at once produce one row rather than a
 * second policy nothing would ever read.
 */
const POLICY_ID = "policy";

export const attendancePolicySelect = {
  id: true,
  cutoffMinutes: true,
  openingMinutes: true,
  closingMinutes: true,
  hrMarkWindowMinutes: true,
  workingDays: true,
  warningsEnabled: true,
  updatedAt: true,
  updatedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AttendancePolicySelect;

export type AttendancePolicyDto = Prisma.AttendancePolicyGetPayload<{
  select: typeof attendancePolicySelect;
}>;

export const attendancePolicyRepository = {
  /**
   * The policy, creating the default one the first time anybody asks.
   *
   * Read-then-create would race on a fresh database, so this is an upsert with
   * an empty update: the row is either found or made, and a second caller
   * arriving at the same moment finds the first one's row rather than failing.
   */
  async get(): Promise<AttendancePolicyDto> {
    return prisma.attendancePolicy.upsert({
      where: { id: POLICY_ID },
      update: {},
      create: { id: POLICY_ID },
      select: attendancePolicySelect,
    });
  },

  update(
    data: {
      cutoffMinutes?: number;
      openingMinutes?: number;
      closingMinutes?: number;
      hrMarkWindowMinutes?: number;
      workingDays?: number[];
      warningsEnabled?: boolean;
    },
    updatedById: string,
  ): Promise<AttendancePolicyDto> {
    return prisma.attendancePolicy.upsert({
      where: { id: POLICY_ID },
      update: { ...data, updatedById },
      create: { id: POLICY_ID, ...data, updatedById },
      select: attendancePolicySelect,
    });
  },
};
