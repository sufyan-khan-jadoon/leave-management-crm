import { created, handleRoute, ok, parseBody, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { serializeAttendance } from "@/lib/serialize";
import { attendanceService } from "@/services/attendance.service";
import {
  attendanceHistoryQuerySchema,
  markAttendanceSchema,
} from "@/validations/attendance.schema";

/**
 * The viewer's own attendance history.
 *
 * Scoped to the session id with no way to widen it — unlike `/api/leaves`,
 * which lets an admin pass `employeeId` and answers with the whole roster when
 * they leave it off. That flexibility is right for a Manage screen; here it
 * would be a personal history quietly showing somebody else's, so the admin view
 * lives at its own endpoint instead.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const query = parseQuery(request, attendanceHistoryQuerySchema);

    const { items, total } = await attendanceService.listForEmployee(
      user.id,
      query.page,
      query.pageSize,
    );

    return ok({
      items: items.map(serializeAttendance),
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
 * Marks the caller present.
 *
 * `requireUser` and nothing more: the id comes off the session, so there is no
 * way to aim this at another account. Every other question — is the office open,
 * have they already checked in, are they actually standing there — is settled in
 * the service against coordinates the client cannot pre-judge.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const input = await parseBody(request, markAttendanceSchema);

    const result = await attendanceService.markPresent(user.id, input);
    const body = { attendance: serializeAttendance(result.attendance), alreadyMarked: result.alreadyMarked };

    // 200 rather than 201 when nothing was written — the check-in being reported
    // is the one that was already there.
    return result.alreadyMarked ? ok(body) : created(body);
  });
}
