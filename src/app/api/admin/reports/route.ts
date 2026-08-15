import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { serializeReport } from "@/lib/serialize";
import { reportService } from "@/services/report.service";
import { reportRequestSchema } from "@/validations/report.schema";

/**
 * Generates a workforce report.
 *
 * **A `POST` that writes nothing**, and the shape is the reason rather than the
 * verb being loose. A report is described by a structured request — a period in
 * one of three shapes, a people selection, up to two hundred ids and a set of
 * record types — and a query string carrying that would be past what browsers
 * and proxies will reliably pass, would need the id list encoded by hand, and
 * would land in access logs naming everybody the report was about. The body is
 * parsed by the same `reportRequestSchema` the export uses, so the two cannot
 * come to accept different requests.
 *
 * `requireAdmin` is the door; the real question is settled in the service by
 * `populationService.assertMayReport`, against the grant read from the row
 * rather than from the session. That split is the one the invitation and roster
 * routes already make, and it is what makes withdrawing `canViewAdminRecords`
 * bite on the next request instead of when a week-old token expires.
 *
 * Nothing here trusts a figure from the browser: `reportRequestSchema` is
 * `strictObject` on every branch, so a payload carrying its own totals is
 * refused outright rather than quietly ignored.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const input = await parseBody(request, reportRequestSchema);

    return ok(serializeReport(await reportService.generate(user, input)));
  });
}
