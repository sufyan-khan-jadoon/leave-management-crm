import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { ROLE } from "@/lib/enums";
import { toUtcDay } from "@/lib/date";
import { leaveService } from "@/services/leave.service";
import { leaveQuerySchema } from "@/validations/leave.schema";

/** Lists leaves. Employees are always scoped to their own records. */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const query = parseQuery(request, leaveQuerySchema);

    const employeeId = user.role === ROLE.ADMIN ? query.employeeId : user.id;

    const { items, total } = await leaveService.list({
      ...query,
      employeeId,
      from: query.from ? toUtcDay(query.from) : undefined,
      to: query.to ? toUtcDay(query.to) : undefined,
    });

    return ok({
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  });
}
