import { created, handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { invitationService } from "@/services/invitation.service";
import { createInvitationSchema } from "@/validations/invitation.schema";

/**
 * Invitations the caller is allowed to see — every one for a super admin, and
 * an admin's own employee invitations otherwise. The service does the narrowing
 * so the rule lives in one place with the matching checks in `resend` and
 * `withdraw`.
 */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const [items, canIssue] = await Promise.all([
      invitationService.list(user),
      // Returned so the UI can hide a form the caller may not submit. It mirrors
      // the check `invite` performs rather than replacing it.
      invitationService.permissionsFor(user),
    ]);

    return ok({ items, canIssue });
  });
}

/**
 * Invites one address. Admins may invite employees; only a super admin may
 * invite administrators. The guard here is deliberately the looser
 * `requireAdmin` — what the caller may actually grant is settled in the
 * service, against the role in the body.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { email, role, jobRoleId } = await parseBody(request, createInvitationSchema);

    const result = await invitationService.invite(user, { email, role, jobRoleId: jobRoleId ?? null });

    // `emailSent` travels with the invitation because a link nobody received is
    // the one failure the administrator has to act on, and mail delivery is
    // never allowed to fail the request that triggered it.
    return created({ invitation: result.invitation, emailSent: result.emailSent });
  });
}
