import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { holidayService } from "@/services/holiday.service";
import { invitationService } from "@/services/invitation.service";
import { adminPermissionsSchema } from "@/validations/invitation.schema";

/**
 * Grants or withdraws what one administrator is allowed to do.
 *
 * Super admin only — delegating the delegation would defeat the point of the
 * permissions existing at all.
 *
 * Each right is applied only when the body actually names it, so toggling one
 * switch cannot quietly reset the other to whatever the screen last believed.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    await requireSuperAdmin();
    const { id } = await params;
    const permissions = await parseBody(request, adminPermissionsSchema);

    let updated;

    if (permissions.canInviteEmployees !== undefined) {
      updated = await invitationService.setInvitePermission(id, permissions.canInviteEmployees);
    }

    if (permissions.canManageHolidays !== undefined) {
      updated = await holidayService.setPermission(id, permissions.canManageHolidays);
    }

    return ok(updated);
  });
}
