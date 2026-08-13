import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { serializeAttendance } from "@/lib/serialize";
import { attendanceService } from "@/services/attendance.service";
import { markEmployeePresentSchema } from "@/validations/attendance.schema";

/**
 * Records somebody present for a day the roster calls absent.
 *
 * The **only** write on the admin attendance screen, which is otherwise
 * read-only on purpose — see the working notes: presence is proved by standing
 * in the building, and this is the deliberate exception for the case that rule
 * cannot serve, where somebody genuinely came in and their phone did not.
 *
 * `requireAdmin` is the door; `canMarkAttendance` is the actual question, and it
 * is settled in the service against the row rather than here against the
 * session — the same looser-guard-with-the-real-check-behind-it split the
 * invitation and holiday routes use. Deliberately *not* gated on
 * `canViewAdminRecords`: that grant is a read.
 *
 * A `POST` to its own path rather than a `PATCH` on an attendance id, because
 * there is no id to address. An absent person has no row, so this creates one —
 * the resource being named is the person and the day, which is exactly what the
 * body carries.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const input = await parseBody(request, markEmployeePresentSchema);

    const result = await attendanceService.markPresentFor(user, input);

    return ok({
      attendance: serializeAttendance(result.attendance),
      // True when a row was already there — a real check-in that landed first,
      // or a second click. The screen says so rather than claiming to have done
      // something, so nobody reads a no-op as a correction they just made.
      alreadyMarked: result.alreadyMarked,
    });
  });
}
