import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { attendanceService } from "@/services/attendance.service";
import { complaintService } from "@/services/complaint.service";
import { customEmailService } from "@/services/custom-email.service";
import { holidayService } from "@/services/holiday.service";
import { invitationService } from "@/services/invitation.service";
import { populationService } from "@/services/population.service";
import { remoteWorkService } from "@/services/remote-work.service";
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

    if (permissions.canSendEmails !== undefined) {
      updated = await customEmailService.setPermission(id, permissions.canSendEmails);
    }

    if (permissions.canEmailAdmins !== undefined) {
      updated = await customEmailService.setAdminEmailPermission(id, permissions.canEmailAdmins);
    }

    if (permissions.canViewAdminRecords !== undefined) {
      updated = await populationService.setPermission(id, permissions.canViewAdminRecords);
    }

    if (permissions.canMarkAttendance !== undefined) {
      updated = await attendanceService.setMarkPermission(id, permissions.canMarkAttendance);
    }

    if (permissions.canManageComplaints !== undefined) {
      updated = await complaintService.setPermission(id, permissions.canManageComplaints);
    }

    if (permissions.canManageRemoteWork !== undefined) {
      updated = await remoteWorkService.setPermission(id, permissions.canManageRemoteWork);
    }

    if (permissions.canEditHistoricalAttendance !== undefined) {
      updated = await attendanceService.setHistoricalEditPermission(
        id,
        permissions.canEditHistoricalAttendance,
      );
    }

    return ok(updated);
  });
}
