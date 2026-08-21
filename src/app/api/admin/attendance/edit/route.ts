import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { serializeAttendance } from "@/lib/serialize";
import { attendanceService } from "@/services/attendance.service";
import { attendanceEditSchema } from "@/validations/attendance-edit.schema";

/**
 * Moves a day that has already finished between Present, Absent and On leave.
 *
 * Its own route rather than a verb on the roster endpoint, for the reason
 * `/api/admin/chat/action` is its own route: "the attendance screen is read-only
 * except when it isn't" should not be something you have to read a service to
 * establish. `/mark` beside it is the *other* correction — bounded by the
 * hr-mark window, one direction only, today — and keeping the two apart is what
 * lets each carry its own grant.
 *
 * `requireAdmin` is the door; `canEditHistoricalAttendance` is the actual
 * question, and it is settled in the service against the row rather than here
 * against the session, so a withdrawn grant stops the next request instead of
 * waiting out a week-old token. Deliberately *not* gated on `canMarkAttendance`:
 * that grant writes a check-in the geofence missed, this one can delete a
 * check-in the geofence proved.
 *
 * A `POST` rather than a `PATCH` on an attendance id, because for most of these
 * transitions there is no id to address — an absent day has no row, and turning
 * a present day absent removes the only one there was. The resource being named
 * is the person and the date, which is exactly what the body carries.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const input = await parseBody(request, attendanceEditSchema);

    const result = await attendanceService.editHistoricalDay(user, input);

    return ok({
      // What the day reads as now, re-derived from the roster rather than echoed
      // back from the request — so the screen renders what the next page load
      // would show, not what the click intended.
      status: result.status,
      previousStatus: result.previousStatus,
      attendance: result.attendance ? serializeAttendance(result.attendance) : null,
    });
  });
}
