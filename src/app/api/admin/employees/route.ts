import { Role } from "@prisma/client";

import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { isSuperAdminRole } from "@/lib/enums";
import { ForbiddenError } from "@/lib/errors";
import { employeeService } from "@/services/employee.service";
import { employeeQuerySchema } from "@/validations/employee.schema";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const query = parseQuery(request, employeeQuerySchema);

    // Listing administrators is the super admin's alone — the roster is the
    // route to every management action on those accounts.
    if (query.role === Role.ADMIN && !isSuperAdminRole(user.role)) {
      throw new ForbiddenError("Only a super administrator can view administrator accounts.");
    }

    const [{ items, total }, departments] = await Promise.all([
      employeeService.list(query),
      employeeService.departments(query.role),
    ]);

    return ok({
      items,
      departments,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  });
}
