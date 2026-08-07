import { handleRoute, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { adminService } from "@/services/admin.service";

/**
 * The overview is scoped to the caller: a super admin's headcount covers
 * administrators as well as employees, an ordinary admin's covers employees
 * alone. The role comes off the session here rather than from a query
 * parameter, so the wider view cannot be asked for.
 */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const data = await adminService.dashboard(user);

    return ok(data);
  });
}
