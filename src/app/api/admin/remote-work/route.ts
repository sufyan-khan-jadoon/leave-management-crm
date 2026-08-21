import { created, handleRoute, ok, parseBody, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { serializeRemoteWork } from "@/lib/serialize";
import { remoteWorkService } from "@/services/remote-work.service";
import { createRemoteWorkSchema, remoteWorkQuerySchema } from "@/validations/remote-work.schema";

/**
 * Remote-work arrangements, and the form for making one.
 *
 * Guarded with the looser `requireAdmin` on purpose — the same shape the
 * invitation and holiday routes take. Whether this particular administrator may
 * *manage* remote work is settled in the service against `canManageRemoteWork`
 * read from the database, not here against the role in the session, so
 * withdrawing the grant stops the next request rather than waiting for a token
 * to expire.
 *
 * Reading and managing are separated deliberately. Every administrator may see
 * who is remote — knowing whether a colleague is expected in the office is
 * ordinary people-management, and the attendance roster beside this already
 * shows it — while arranging one is the delegable act. `canManage` rides along
 * so the screen can hide a form it may not submit; it mirrors the real check and
 * never replaces it.
 *
 * The **population** filter is a different question again, and answers to
 * `canViewAdminRecords` through `populationService` inside the service:
 * separating the administrators out is the same disclosure here as it is on the
 * attendance screen.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const query = parseQuery(request, remoteWorkQuerySchema);

    const { items, total, summary, canManage } = await remoteWorkService.list(user, query);

    return ok({
      items: items.map(serializeRemoteWork),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      summary,
      canManage,
    });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const input = await parseBody(request, createRemoteWorkSchema);

    const { assignment, emailSent, leaveDatesInPeriod } = await remoteWorkService.assign(user, input);

    return created({
      assignment: serializeRemoteWork(assignment),
      // Reported rather than thrown, like every other send here — an assignment
      // the person was never told about is still an assignment, and the
      // administrator is the only one able to notice the letter never left.
      emailSent,
      leaveDatesInPeriod: leaveDatesInPeriod.map((date) => date.toISOString()),
    });
  });
}
