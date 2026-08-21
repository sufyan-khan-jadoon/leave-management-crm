import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { serializeEmployeeReport } from "@/lib/serialize";
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

    return ok(serializeEmployeeReport(await reportService.forEmployee(user, id, input)));
  });
}
