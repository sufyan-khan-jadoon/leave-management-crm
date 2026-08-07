import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { invitationService } from "@/services/invitation.service";
import { invitePermissionSchema } from "@/validations/invitation.schema";

/**
 * Grants or withdraws one administrator's right to invite employees.
 *
 * Super admin only — delegating the delegation would defeat the point of the
 * permission existing.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    await requireSuperAdmin();
    const { id } = await params;
    const { canInviteEmployees } = await parseBody(request, invitePermissionSchema);

    return ok(await invitationService.setInvitePermission(id, canInviteEmployees));
  });
}
