import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { todayUtc } from "@/lib/date";
import { serializeEmployeeReport } from "@/lib/serialize";
import { attendanceService } from "@/services/attendance.service";
import { reportService } from "@/services/report.service";
import { employeeReportRequestSchema } from "@/validations/employee-report.schema";

/**
 * One person's report: summary, calendar, records, leave and the analytics
 * behind the charts.
 *
 * **One endpoint rather than the five a report screen looks like it needs.**
 * Every one of those answers would come out of the *same* day walk — the
 * summary, the calendar, the table and both charts are readings of one
 * `describeDay` pass over one period — so five endpoints would be five walks of
 * identical data and, worse, five chances for the tiles to disagree with the
 * calendar beside them. The screen asks one question and gets one answer, which
 * is also what makes changing the date range a single request rather than five.
 *
 * Nothing is aggregated in the browser: the totals, the coverage, the attendance
 * rate and the leave spells all arrive computed. `employeeReportRequestSchema`
 * is a `strictObject`, so a payload carrying its own figures is refused outright
 * rather than quietly ignored.
 *
 * `requireAdmin` is the door. The real question — *this* administrator, *this*
 * person — is settled in the service by `byIdForActor`, the same function the
 * profile page above it calls, and refused as **not found** so the URL cannot be
 * used to discover which ids belong to administrators.
 *
 * `POST` that writes nothing, following the report endpoints beside it: the body
 * carries a range in two shapes and paging, and the id of the person a report is
 * about has no business in an access log.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;
    const input = await parseBody(request, employeeReportRequestSchema);

    // `forEmployee` gates on `byIdForActor`, so reaching this line at all means
    // the caller may see this person. Whether they may *change* one of their
    // days is a second, narrower question, asked after the report has resolved
    // who its subject actually is rather than against the id off the URL.
    const report = await reportService.forEmployee(user, id, input);

    return ok({
      ...serializeEmployeeReport(report),
      /**
       * Purely so the Records table can offer an Edit action it may actually
       * use. It mirrors the real check and never replaces it — the same
       * arrangement `canMarkAttendance` has on the roster route and `canIssue`
       * on the invitation routes.
       *
       * Resolved through the service rather than assembled here, so the grant
       * and the seniority rule stay in the one place that owns them: a route
       * spelling out "and not yourself, and not the owner" is a second copy of
       * `assertMayCorrect` waiting to fall behind it.
       */
      canEditHistoricalAttendance: await attendanceService.mayEditHistoricalDayFor(
        user,
        report.subject,
      ),
      // The company's calendar day, so the screen and the server agree about
      // which rows are past. `todayUtc()` reads `APP_TIME_ZONE`, never the
      // browser's clock and never the server's raw UTC one.
      today: todayUtc().toISOString(),
    });
  });
}
