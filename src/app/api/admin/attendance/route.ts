import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { serializeAttendance } from "@/lib/serialize";
import { attendanceService } from "@/services/attendance.service";
import { attendanceRosterQuerySchema } from "@/validations/attendance.schema";

/**
 * The organisation-wide view: everyone expected on one date, and whether they
 * came in.
 *
 * `requireAdmin` covers both admin roles, the same way the leave and holiday
 * read screens do — attendance is not delegated per-administrator, because
 * seeing who is in the office is the ordinary business of managing people
 * rather than an organisation-wide act like closing it.
 *
 * Read-only. There is deliberately no way to mark somebody present from here:
 * the whole point of the geofence is that presence is proved by being there, and
 * an admin override would be a way around it.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    await requireAdmin();
    const query = parseQuery(request, attendanceRosterQuerySchema);

    const roster = await attendanceService.roster(query);

    return ok({
      date: roster.date.toISOString(),
      officeClosed: roster.officeClosed,
      summary: roster.summary,
      items: roster.items.map((entry) => ({
        employee: entry.employee,
        status: entry.status,
        attendance: entry.attendance ? serializeAttendance(entry.attendance) : null,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: roster.total,
        totalPages: Math.max(1, Math.ceil(roster.total / query.pageSize)),
      },
    });
  });
}
