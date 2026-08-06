import { z } from "zod";

import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { EMPLOYEE_STATUS } from "@/lib/enums";
import { employeeService } from "@/services/employee.service";

type RouteContext = { params: Promise<{ id: string }> };

const statusSchema = z.object({
  status: z.enum([EMPLOYEE_STATUS.ACTIVE, EMPLOYEE_STATUS.SUSPENDED]),
});

/**
 * Suspend or reactivate an account. Which accounts are reachable depends on the
 * caller's seniority — the service decides, not this handler.
 */
export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const { status } = await parseBody(request, statusSchema);

    const employee = await employeeService.setStatus(id, status, admin);

    return ok({ employee });
  });
}
