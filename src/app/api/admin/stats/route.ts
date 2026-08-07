import { Role } from "@prisma/client";

import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { isSuperAdminRole } from "@/lib/enums";
import { ForbiddenError } from "@/lib/errors";
import { adminService } from "@/services/admin.service";
import { adminStatsQuerySchema } from "@/validations/employee.schema";

/**
 * The overview, reported on one population at a time.
 *
 * Asking for administrators is the super admin's alone, gated exactly as the
 * roster is: these figures describe the same accounts, so letting the dashboard
 * answer freely would be a way around the check on `/api/admin/employees`.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { population } = parseQuery(request, adminStatsQuerySchema);

    if (population === Role.ADMIN && !isSuperAdminRole(user.role)) {
      throw new ForbiddenError("Only a super administrator can view administrator accounts.");
    }

    return ok(await adminService.dashboard(population));
  });
}
