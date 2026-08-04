import { handleRoute, ok } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { inviteService } from "@/services/invite.service";

/** Revokes an unused key. Spent keys are refused — the admin already exists. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    await requireSuperAdmin();
    const { id } = await params;

    return ok(await inviteService.revoke(id));
  });
}
