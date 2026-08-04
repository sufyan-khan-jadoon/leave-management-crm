import { handleRoute, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { employeeService } from "@/services/employee.service";
import { leaveService } from "@/services/leave.service";

/** Everything the employee dashboard needs, in a single round trip. */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();

    const [employee, balance, counts, trend, recent] = await Promise.all([
      employeeService.byId(user.id),
      leaveService.balanceFor(user.id),
      leaveService.lifetimeCounts(user.id),
      leaveService.monthlyTrend(6, user.id),
      leaveService.list({
        employeeId: user.id,
        page: 1,
        pageSize: 5,
        sortBy: "leaveDate",
        sortDir: "desc",
      }),
    ]);

    return ok({
      employee,
      balance,
      counts,
      trend,
      recentLeaves: recent.items,
      totalLeaves: recent.total,
    });
  });
}
