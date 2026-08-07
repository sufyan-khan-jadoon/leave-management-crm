import { handleRoute, ok } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { invitationService } from "@/services/invitation.service";

/** Administrators and their invite permissions. Super admin only. */
export async function GET() {
  return handleRoute(async () => {
    await requireSuperAdmin();
    return ok({ items: await invitationService.listAdmins() });
  });
}
