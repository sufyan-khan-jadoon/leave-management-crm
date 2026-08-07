import { handleRoute, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { invitationService } from "@/services/invitation.service";

/**
 * Withdraws an invitation nobody accepted, taking the emailed link with it.
 * Accepted ones are refused — they are the record of how an existing account was
 * created. An admin may only withdraw employee invitations they sent; the
 * service treats anything else as absent rather than forbidden, so this cannot
 * be used to probe for invitations the caller is not allowed to see.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;

    return ok(await invitationService.withdraw(id, user));
  });
}
