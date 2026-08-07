import { handleRoute, ok } from "@/lib/api";
import { assertOwnerOrAdmin, requireAdmin, requireUser } from "@/lib/auth/guards";
import { leaveService } from "@/services/leave.service";
import { leaveRepository } from "@/repositories/leave.repository";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * There is no PATCH here on purpose. The allowance decides every request at the
 * moment it is booked, so there is no decision left for an administrator to
 * make — and an endpoint that could still flip a status would be exactly the
 * override the policy exists to avoid.
 */

export async function GET(_request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await context.params;

    const leave = await leaveService.byId(id);
    assertOwnerOrAdmin(user, leave.employeeId);

    return ok({ leave });
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  return handleRoute(async () => {
    await requireAdmin();
    const { id } = await context.params;

    await leaveService.byId(id);
    await leaveRepository.delete(id);

    return ok({ id });
  });
}
