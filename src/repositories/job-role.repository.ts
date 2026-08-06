import type { JobRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type JobRoleDto = { id: string; name: string; createdAt: Date; inviteCount: number };

export const jobRoleRepository = {
  /** Alphabetical, with how many keys reference each — deletion needs to warn. */
  async list(): Promise<JobRoleDto[]> {
    const rows = await prisma.jobRole.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, createdAt: true, _count: { select: { invites: true } } },
    });

    return rows.map(({ _count, ...role }) => ({ ...role, inviteCount: _count.invites }));
  },

  findByName(name: string): Promise<JobRole | null> {
    return prisma.jobRole.findUnique({ where: { name } });
  },

  findById(id: string): Promise<JobRole | null> {
    return prisma.jobRole.findUnique({ where: { id } });
  },

  create(name: string): Promise<JobRole> {
    return prisma.jobRole.create({ data: { name } });
  },

  delete(id: string): Promise<JobRole> {
    return prisma.jobRole.delete({ where: { id } });
  },
};
