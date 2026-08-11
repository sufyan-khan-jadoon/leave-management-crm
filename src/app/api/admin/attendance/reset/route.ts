import { handleRoute, ok, parseBody, parseQuery } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { attendanceService } from "@/services/attendance.service";
import {
  resetAttendancePreviewSchema,
  resetAttendanceSchema,
} from "@/validations/attendance.schema";

/**
 * How much a reset would erase, for the dialog to quote before anybody confirms.
 *
 * Guarded with `requireSuperAdmin` like the reset itself rather than the looser
 * `requireAdmin`: this is not a figure any administrator needs, and answering it
 * would tell a caller who may not reset anything how much there is to lose.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    await requireSuperAdmin();
    const query = parseQuery(request, resetAttendancePreviewSchema);

    return ok(await attendanceService.resetPreview(query));
  });
}

/**
 * Erases the record — check-ins, leave, absence records or all three, for one
 * date or for all time.
 *
 * The super admin's alone, and gated here in the route as every other
 * organisation-wide act is. Deliberately **not** delegated per-administrator the
 * way closing the office is: seeing who is in is ordinary people-management, but
 * deleting the record that they were is not, and there is nothing to inspect
 * afterwards to find out who did it. The single-date range is no exception —
 * it is narrower, not gentler, and it can still take somebody's booked leave.
 *
 * POST rather than DELETE because the all-time branch carries a typed
 * confirmation in the body, and a DELETE with a meaningful body is a request
 * proxies and clients feel free to strip.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    await requireSuperAdmin();
    const input = await parseBody(request, resetAttendanceSchema);

    return ok(await attendanceService.reset(input));
  });
}
