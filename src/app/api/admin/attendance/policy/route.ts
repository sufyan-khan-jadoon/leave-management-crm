import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth/guards";
import { attendancePolicyService } from "@/services/attendance-policy.service";
import { updateAttendancePolicySchema } from "@/validations/attendance.schema";
import { isSuperAdminRole } from "@/lib/enums";

function serialize(policy: Awaited<ReturnType<typeof attendancePolicyService.get>>) {
  return { ...policy, updatedAt: policy.updatedAt.toISOString() };
}

/**
 * Any administrator may read the policy — knowing when the working day ends is
 * everyone's business, and the attendance screens quote it to explain
 * themselves. `canManage` rides along so the panel can hide a form it may not
 * submit; it mirrors the real check and never replaces it.
 */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const policy = await attendancePolicyService.get();

    return ok({ policy: serialize(policy), canManage: isSuperAdminRole(user.role) });
  });
}

/**
 * Writing is the super admin's alone, and gated here rather than in the service.
 *
 * Unlike closing the office, this is deliberately *not* delegated per
 * administrator: there is one working day for the whole company, and the person
 * who decides when it ends is the person who answers for the letters it sends.
 */
export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const user = await requireSuperAdmin();
    const input = await parseBody(request, updateAttendancePolicySchema);

    const policy = await attendancePolicyService.update(user.id, input);

    return ok(serialize(policy));
  });
}
