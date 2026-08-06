import { created, handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { inviteService } from "@/services/invite.service";
import { issueInviteSchema } from "@/validations/invite.schema";

/**
 * Invite keys the caller is allowed to see — every key for a super admin, and
 * an admin's own employee keys otherwise. The service does the narrowing so the
 * rule lives in one place with the matching check in `revoke`.
 */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const [items, canIssue] = await Promise.all([
      inviteService.list(user),
      // Returned so the UI can hide a form the caller may not submit. It mirrors
      // the check `issue` performs rather than replacing it.
      inviteService.permissionsFor(user),
    ]);

    return ok({ items, canIssue });
  });
}

/**
 * Admins may invite employees; only a super admin may invite administrators.
 * The guard here is deliberately the looser `requireAdmin` — which role the
 * caller is actually allowed to grant is settled in the service, against the
 * role in the body.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { role, jobRoleId, label } = await parseBody(request, issueInviteSchema);

    return created(await inviteService.issue(user, role, jobRoleId ?? null, label ?? null));
  });
}
