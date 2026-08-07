import { handleRoute, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { invitationService } from "@/services/invitation.service";

/**
 * Sends an invitation again with a fresh link, replacing the old one.
 *
 * Scoped exactly as the list is, and the right to invite that role is re-checked
 * rather than inherited from whoever sent it first — a resend is a fresh act of
 * onboarding, so an administrator whose permission was withdrawn cannot keep
 * inviting through invitations they made earlier.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;

    const result = await invitationService.resend(id, user);

    return ok({ invitation: result.invitation, emailSent: result.emailSent });
  });
}
