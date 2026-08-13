import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { isAdminRole, rolesInPopulation } from "@/lib/enums";
import { toUtcDay } from "@/lib/date";
import { leaveService } from "@/services/leave.service";
import { populationService } from "@/services/population.service";
import { leaveQuerySchema } from "@/validations/leave.schema";

/**
 * Lists leaves. Employees are always scoped to their own records.
 *
 * `population` narrows an administrator's view to the employees or the
 * administrators, and needs `canViewAdminRecords` — the same grant, rule and
 * service the attendance roster's filter uses, so the two screens cannot come to
 * disagree about who may separate the two groups.
 *
 * An unfiltered list still returns everybody, administrators included, exactly
 * as it always has. This widens what may be *asked for*, never what comes back
 * by default. An employee never reaches the check: their own id replaces the
 * query before it can matter.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const query = parseQuery(request, leaveQuerySchema);

    const isAdmin = isAdminRole(user.role);
    const employeeId = isAdmin ? query.employeeId : user.id;

    if (isAdmin) await populationService.assertMayFilter(user, query.population);

    const { items, total } = await leaveService.list({
      ...query,
      employeeId,
      // Applied for an administrator alone. An employee is already pinned to
      // their own id, so a population could narrow nothing and could only ever
      // make their own history vanish.
      roles: isAdmin && query.population !== "ALL" ? rolesInPopulation(query.population) : undefined,
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
