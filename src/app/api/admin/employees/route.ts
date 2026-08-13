import { Role } from "@prisma/client";

import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { employeeService } from "@/services/employee.service";
import { populationService } from "@/services/population.service";
import { employeeQuerySchema } from "@/validations/employee.schema";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const query = parseQuery(request, employeeQuerySchema);

    // Listing administrators needs `canViewAdminRecords` — the same grant the
    // attendance roster and the leave list use, rather than a sixth one, because
    // it hands over the same knowledge: which of your colleagues is an
    // administrator.
    //
    // This was the super admin's alone at first, on the reasoning that the
    // roster is the route to every management action on those accounts. That
    // reasoning was about *managing*, and it still holds — `assertMayManage` is
    // untouched, so a granted administrator sees these rows and can act on none
    // of them. Seeing and acting are separated here rather than conflated.
    //
    // `SUPER_ADMIN` cannot be asked for at all: `employeeQuerySchema` does not
    // accept it, so the owner is never listed however senior the caller.
    if (query.role === Role.ADMIN) await populationService.assertMayReportOn(user, Role.ADMIN);

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
