import { created, handleRoute, ok, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { inviteService } from "@/services/invite.service";
import { issueInviteSchema } from "@/validations/invite.schema";

/** Keys the super admin has issued, newest first. */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireSuperAdmin();
    return ok({ items: await inviteService.list(user.id) });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireSuperAdmin();
    const { label } = await parseBody(request, issueInviteSchema);

    return created(await inviteService.issue(user.id, label ?? null));
  });
}
