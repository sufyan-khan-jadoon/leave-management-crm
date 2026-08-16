import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { complaintService } from "@/services/complaint.service";
import { complaintQuerySchema } from "@/validations/complaint.schema";

/**
 * Every complaint, for an administrator who may read them.
 *
 * Guarded with the looser `requireAdmin` on purpose — the same split the
 * invitation, holiday and email routes make. Whether *this* administrator may
 * see anything is settled in the service against `canManageComplaints` read
 * fresh from the database, never here against the role in the session.
 *
 * Note what this route does **not** do, unlike `/api/admin/emails`: it returns
 * no capabilities object and no empty list for somebody without the grant. Those
 * screens are reachable-but-useless by design, because a nav item that silently
 * vanishes reads as a broken sidebar. Complaints are the opposite case — reading
 * them *is* the privilege, so an ungranted administrator gets a 403 and the nav
 * item is not rendered at all.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const query = parseQuery(request, complaintQuerySchema);

    const { items, total, counts } = await complaintService.list(user, query);

    return ok({
      items,
      counts,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  });
}
