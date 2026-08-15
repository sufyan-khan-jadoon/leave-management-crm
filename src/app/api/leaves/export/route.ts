import { requireUser } from "@/lib/auth/guards";
import { failure, parseQuery } from "@/lib/api";
import { csvResponse, toCsv } from "@/lib/csv";
import { AppError } from "@/lib/errors";
import { isAdminRole, rolesInPopulation } from "@/lib/enums";
import { toIsoDate, toUtcDay } from "@/lib/date";
import { leaveService } from "@/services/leave.service";
import { populationService } from "@/services/population.service";
import { leaveQuerySchema } from "@/validations/leave.schema";

/**
 * Streams the filtered leave history as CSV.
 *
 * Employees receive only their own rows; admins receive everything matching the
 * current filters.
 *
 * `population` is re-checked here rather than trusted from the screen, exactly
 * as the attendance export re-checks it: an export that honoured a filter
 * without the grant behind it would be the easier of the two to reach with a
 * hand-written URL.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = parseQuery(request, leaveQuerySchema);
    const isAdmin = isAdminRole(user.role);

    if (isAdmin) await populationService.assertMayFilter(user, query.population);

    const leaves = await leaveService.listAll({
      ...query,
      employeeId: isAdmin ? query.employeeId : user.id,
      roles: isAdmin && query.population !== "ALL" ? rolesInPopulation(query.population) : undefined,
      from: query.from ? toUtcDay(query.from) : undefined,
      to: query.to ? toUtcDay(query.to) : undefined,
    });

    const header = ["Leave Date", "Employee", "Email", "Department", "Position", "Reason", "Status", "Requested On"];

    const rows = leaves.map((leave) => [
      toIsoDate(leave.leaveDate),
      leave.employee.name,
      leave.employee.email,
      leave.employee.department ?? "",
      leave.employee.position ?? "",
      leave.reason,
      leave.status,
      leave.createdAt.toISOString(),
    ]);

    return csvResponse(toCsv([header, ...rows]), `leave-history-${toIsoDate(new Date())}.csv`);
  } catch (error) {
    if (error instanceof AppError) return failure(error);

    console.error("[api] Leave export failed:", error);
    return new Response("Export failed", { status: 500 });
  }
}
