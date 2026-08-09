import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth/guards";
import { isSuperAdminRole } from "@/lib/enums";
import { workingDaysService, type WorkingWeek } from "@/services/working-days.service";
import { updateWorkingWeekSchema } from "@/validations/working-days.schema";

function serialize(week: WorkingWeek) {
  return { ...week, updatedAt: week.updatedAt.toISOString() };
}

/**
 * Any administrator may read the working week — it decides what a leave request
 * costs and who is expected in, so every screen that explains itself needs it.
 *
 * `canManage` rides along purely so the panel can hide a form it may not submit.
 * It mirrors the real check in PATCH and never replaces it.
 */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const week = await workingDaysService.weeklySchedule();

    return ok({ week: serialize(week), canManage: isSuperAdminRole(user.role) });
  });
}

/**
 * Writing is the super admin's alone, and gated here rather than in the service.
 *
 * Deliberately *not* delegated per administrator the way closing the office is.
 * A single closure is one date; the working week decides what every leave
 * request in the organisation costs and who is chased for missing a day, so
 * there is one week and one person who sets it.
 */
export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const user = await requireSuperAdmin();
    const input = await parseBody(request, updateWorkingWeekSchema);

    const week = await workingDaysService.setWeeklySchedule(user.id, input);

    return ok(serialize(week));
  });
}
