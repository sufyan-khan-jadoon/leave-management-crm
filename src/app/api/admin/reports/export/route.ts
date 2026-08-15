import { failure, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { csvResponse, toCsv } from "@/lib/csv";
import { appConfig } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { organisationSlug, reportToCsvRows } from "@/lib/report-csv";
import { reportPeriodSlug } from "@/lib/report-period";
import { reportService } from "@/services/report.service";
import { reportRequestSchema } from "@/validations/report.schema";

/**
 * Writes the generated report out as a spreadsheet.
 *
 * **The same request body the screen generated with, run through the same
 * service call**, with only the page size opened up — see
 * `reportService.generateAll`. An export assembled from its own query is the one
 * that comes to disagree with the report it was taken from, and this is the copy
 * that gets archived and mailed around, where nobody can check it against the
 * screen any more.
 *
 * That includes the in-report narrowing: a search or a status filter travels
 * with the request, so the file holds exactly the rows somebody was looking at
 * and the header names the filters that produced them. A file quietly wider than
 * the screen is the same lie in the other direction.
 *
 * The route holds the two things only a route can do — the guard and the
 * response. Turning a report into rows is `report-csv.ts`, kept pure so it can
 * be driven with a real report rather than only through an HTTP call.
 *
 * `POST` rather than `GET` for the reason the generate route gives: the request
 * carries a people selection and up to two hundred ids. It is still a read, and
 * `reportService` writes nothing.
 */
export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const input = await parseBody(request, reportRequestSchema);
    const report = await reportService.generateAll(user, input);

    const rows = reportToCsvRows(report, appConfig.name, {
      search: input.search,
      role: input.role,
      status: input.status,
    });

    return csvResponse(
      toCsv(rows),
      `${organisationSlug(appConfig.name)}-report-${reportPeriodSlug(report.period)}.csv`,
    );
  } catch (error) {
    if (error instanceof AppError) return failure(error);

    console.error("[api] Report export failed:", error);
    return new Response("Export failed", { status: 500 });
  }
}
