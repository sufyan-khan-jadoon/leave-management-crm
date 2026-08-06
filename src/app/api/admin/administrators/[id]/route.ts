import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { inviteService } from "@/services/invite.service";
import { invitePermissionSchema } from "@/validations/invite.schema";

/**
 * Grants or withdraws one administrator's right to issue employee keys.
 *
 * Super admin only — delegating the delegation would defeat the point of the
 * permission existing.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    await requireSuperAdmin();
    const { id } = await params;
    const { canInviteEmployees } = await parseBody(request, invitePermissionSchema);

    return ok(await inviteService.setInvitePermission(id, canInviteEmployees));
  });
}
