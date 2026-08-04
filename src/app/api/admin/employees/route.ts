import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { employeeService } from "@/services/employee.service";
import { employeeQuerySchema } from "@/validations/employee.schema";

export async function GET(request: Request) {
  return handleRoute(async () => {
    await requireAdmin();
    const query = parseQuery(request, employeeQuerySchema);

    const [{ items, total }, departments] = await Promise.all([
      employeeService.list(query),
      employeeService.departments(),
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
