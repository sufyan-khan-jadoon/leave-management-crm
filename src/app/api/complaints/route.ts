import { created, handleRoute, ok, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { complaintService } from "@/services/complaint.service";
import { myComplaintQuerySchema, submitComplaintSchema } from "@/validations/complaint.schema";

/**
 * The signed-in person's own complaints, and nobody else's.
 *
 * Guarded with `requireUser` rather than `requireAdmin` because everybody has
 * this screen — an administrator raises complaints like anyone else, the same
 * way they book leave.
 *
 * **Scoped to the session id with no way to widen it.** There is no
 * `employeeId` parameter to leave off, deliberately unlike `/api/leaves` where
 * an admin who omits it gets the whole roster: that is right for a Manage screen
 * and would be a data breach here. Reading somebody else's complaints has its
 * own endpoint, behind its own grant.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const query = parseQuery(request, myComplaintQuerySchema);

    const { items, total } = await complaintService.listMine(user, query);

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

/**
 * Files a complaint in the name of whoever is signed in.
 *
 * The author is the session and nothing else. `submitComplaintSchema` is a
 * `strictObject` with no field for an employee, a status or a resolution, so a
 * body offering any of them is refused loudly rather than stripped — the same
 * reason `markAttendanceSchema` refuses a client's verdict about a position.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const input = await parseBody(request, submitComplaintSchema);

    return created(await complaintService.submit(user, input));
  });
}
