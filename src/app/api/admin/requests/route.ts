import { handleRoute, ok } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { invitationService } from "@/services/invitation.service";

/** Administrator registrations waiting on a decision. */
export async function GET() {
  return handleRoute(async () => {
    await requireSuperAdmin();
    return ok({ items: await invitationService.pendingAdmins() });
  });
}
