import { handleRoute, ok, parseQuery } from "@/lib/api";
import { hrMarkWindowExpiresAt, isWithinHrMarkWindow } from "@/lib/attendance-policy";
import { requireAdmin } from "@/lib/auth/guards";
import { todayUtc } from "@/lib/date";
import { isSuperAdminRole } from "@/lib/enums";
import { serializeAttendance } from "@/lib/serialize";
import { attendanceService } from "@/services/attendance.service";
import { attendancePolicyService } from "@/services/attendance-policy.service";
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
 * Read-only, and this endpoint stays that way — correcting a day is a `POST` to
 * `/api/admin/attendance/mark`, behind its own grant. Keeping the write on its
 * own path is the point: reading the roster is ordinary people-management, and
 * overriding the geofence is not, so the two do not share a door.
 *
 * The `population` filter is the one thing here not open to every administrator,
 * and the caller is handed to the service rather than checked here — see
 * `populationService.assertMayFilter`, which the CSV export reaches through the
 * same call. It is a delegable grant read from the row, not a role, so the whole
 * user goes down rather than just `user.role`.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const query = parseQuery(request, attendanceRosterQuerySchema);

    const [roster, canMarkAttendance, canEditHistoricalAttendance, policy] = await Promise.all([
      attendanceService.roster(query, user),
      attendanceService.mayMarkAttendance(user),
      attendanceService.mayEditHistoricalAttendance(user),
      attendancePolicyService.get(),
    ]);

    return ok({
      date: roster.date.toISOString(),
      officeClosed: roster.officeClosed,
      isWorkingDay: roster.isWorkingDay,
      // Purely so the screen can hide a button it may not press. It mirrors the
      // real check and never replaces it — `markPresentFor` asks again, against
      // the row — exactly as `canIssue` and `canManage` do on the invitation and
      // holiday routes.
      canMarkAttendance,
      /**
       * Whether this viewer may move a **finished** day between Present, Absent
       * and On leave — a different grant from the one above, and offered on
       * different days, which is why it is a second field rather than a wider
       * reading of the first.
       *
       * Hides a control it may not use and nothing more: `editHistoricalDay`
       * asks again against the row, and refuses today's date whatever this says.
       */
      canEditHistoricalAttendance,
      /**
       * Whether the date on screen is one this feature reaches at all.
       *
       * Decided here rather than in the browser so the screen and the server
       * agree about which day "today" is — a viewer in another timezone would
       * otherwise offer the control on a date the server still calls today, and
       * be refused for it. `roster.date` has already been through `todayUtc()`.
       */
      isHistorical: roster.date.getTime() < todayUtc().getTime(),
      // The deadline lateness is judged against, so the mark dialog can show
      // what a typed arrival time would come to *before* it is submitted. The
      // preview is a courtesy; the figure that lands is computed on the server
      // from the basis frozen onto the row.
      cutoffMinutes: policy.cutoffMinutes,
      // The far edge of what may be recorded, so the dialog can refuse an
      // impossible arrival before it is submitted rather than after.
      closingMinutes: policy.closingMinutes,
      /**
       * How long a delegated administrator may still record this date, and when
       * that runs out.
       *
       * `expiresAt` is an **instant computed on the server** from the date's own
       * cutoff, never a duration for the browser to start counting from. That is
       * what makes a refresh, a second tab and a fresh sign-in agree: they all
       * receive the same moment rather than each starting a timer of their own.
       *
       * `serverTime` rides along so the countdown can measure the browser's
       * clock against the server's once and correct for the difference. A
       * machine set an hour fast would otherwise show a window that had already
       * closed — or worse, one that had not. Neither figure authorises anything:
       * `markPresentFor` asks `isWithinHrMarkWindow` again on every request.
       *
       * The super admin sees `active: true` regardless, because the window does
       * not bind them — the screen would otherwise hide a button the server
       * would have honoured.
       */
      hrMarkWindow: {
        minutes: policy.hrMarkWindowMinutes,
        expiresAt: hrMarkWindowExpiresAt(
          roster.date,
          policy.cutoffMinutes,
          policy.hrMarkWindowMinutes,
        ).toISOString(),
        active:
          isSuperAdminRole(user.role) ||
          isWithinHrMarkWindow(roster.date, policy.cutoffMinutes, policy.hrMarkWindowMinutes),
        /** Whether this viewer is bound by it at all, so the UI can say why. */
        boundByWindow: !isSuperAdminRole(user.role),
      },
      serverTime: new Date().toISOString(),
      summary: roster.summary,
      items: roster.items.map((entry) => ({
        // Named rather than passed whole. `attendanceRosterSelect` carries
        // `createdAt` so `describeDay` can stop the register at the account's
        // own first day — that is a server-side boundary, and putting a
        // registration timestamp on every row of a screen with no use for it is
        // how a select comes to mean "whatever the client happens to receive".
        employee: {
          id: entry.employee.id,
          name: entry.employee.name,
          email: entry.employee.email,
          department: entry.employee.department,
          position: entry.employee.position,
          profilePhoto: entry.employee.profilePhoto,
        },
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
