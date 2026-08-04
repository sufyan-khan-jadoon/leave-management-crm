import { handleRoute, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { adminService } from "@/services/admin.service";

export async function GET() {
  return handleRoute(async () => {
    await requireAdmin();
    const data = await adminService.dashboard();

    return ok(data);
  });
}
