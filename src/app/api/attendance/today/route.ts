import { handleRoute, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { serializeAttendance } from "@/lib/serialize";
import { attendanceService } from "@/services/attendance.service";

/**
 * Where the viewer stands today: checked in, on leave, or with the office shut.
 *
 * Separate from the history endpoint because the screen needs it on its own —
 * it decides whether there is a button to press at all, and re-reads it after
 * every check-in so what is on screen is what the server actually recorded
 * rather than what the client hoped it would.
 */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();
    const today = await attendanceService.todayFor(user.id);

    return ok({
      date: today.date.toISOString(),
      attendance: today.attendance ? serializeAttendance(today.attendance) : null,
      status: today.status,
      canMark: today.canMark,
      blockedReason: today.blockedReason,
    });
  });
}
