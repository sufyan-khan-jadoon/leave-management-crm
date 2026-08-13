import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { adminService } from "@/services/admin.service";
import { populationService } from "@/services/population.service";
import { adminStatsQuerySchema } from "@/validations/employee.schema";

/**
 * The overview, reported on one population at a time — headcount, leave figures,
 * the trend chart and today's attendance tile.
 *
 * Asking for the administrators needs `canViewAdminRecords`, the same grant the
 * attendance roster's filter needs, because these figures describe the same
 * accounts: a dashboard that answered freely would be a way around that check.
 * Asking for the employees is open to every administrator — unlike the roster,
 * this surface never shows both at once, so there is no unfiltered figure to
 * name the administrators by subtraction from.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { population } = parseQuery(request, adminStatsQuerySchema);

    await populationService.assertMayReportOn(user, population);

    return ok(await adminService.dashboard(population));
  });
}
