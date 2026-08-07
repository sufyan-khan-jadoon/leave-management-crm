import type { JobRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type JobRoleDto = { id: string; name: string; createdAt: Date; invitationCount: number };

export const jobRoleRepository = {
  /** Alphabetical, with how many invitations reference each — deletion warns. */
  async list(): Promise<JobRoleDto[]> {
    const rows = await prisma.jobRole.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, createdAt: true, _count: { select: { invitations: true } } },
    });

    return rows.map(({ _count, ...role }) => ({ ...role, invitationCount: _count.invitations }));
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
