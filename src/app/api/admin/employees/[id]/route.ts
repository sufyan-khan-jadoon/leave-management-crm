import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { employeeService } from "@/services/employee.service";
import { leaveService } from "@/services/leave.service";
import { adminEmployeeUpdateSchema } from "@/validations/employee.schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  return handleRoute(async () => {
    await requireAdmin();
    const { id } = await context.params;

    const [employee, balance, counts] = await Promise.all([
      employeeService.byId(id),
      leaveService.balanceFor(id),
      leaveService.lifetimeCounts(id),
    ]);

    return ok({ employee, balance, counts });
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    await requireAdmin();
    const { id } = await context.params;
    const input = await parseBody(request, adminEmployeeUpdateSchema);

    const employee = await employeeService.adminUpdate(id, input);

    return ok({ employee });
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const employee = await employeeService.remove(id, admin.id);

    return ok({ id: employee.id });
  });
}
