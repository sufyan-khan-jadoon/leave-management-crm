import { handleRoute, ok, parseBody } from "@/lib/api";
import { assertOwnerOrAdmin, requireAdmin, requireUser } from "@/lib/auth/guards";
import { leaveService } from "@/services/leave.service";
import { leaveRepository } from "@/repositories/leave.repository";
import { leaveDecisionSchema } from "@/validations/leave.schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await context.params;

    const leave = await leaveService.byId(id);
    assertOwnerOrAdmin(user, leave.employeeId);

    return ok({ leave });
  });
}

/** Admin approve/reject decision. */
export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const { status } = await parseBody(request, leaveDecisionSchema);

    const leave = await leaveService.decide(id, status, admin.id);

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
