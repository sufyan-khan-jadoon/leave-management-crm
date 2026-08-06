import { handleRoute, ok } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { jobRoleService } from "@/services/job-role.service";

/**
 * Removes a title from the list.
 *
 * Super admin only: adding is bookkeeping any admin can do, but removing
 * changes what everyone else can choose, so it stays with the owner. Nobody
 * loses their job title — `position` is a copy taken at sign-up.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    await requireSuperAdmin();
    const { id } = await params;

    return ok(await jobRoleService.remove(id));
  });
}
