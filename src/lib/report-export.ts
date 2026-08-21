/**
 * What every report export does before it becomes a file.
 *
 * The guard, the schema, the service call and the document are identical across
 * CSV, Excel and PDF — only the bytes at the end differ — so they live here once
 * and each route is left holding its own format and nothing else. Three routes
 * each repeating this is three places for one of them to quietly stop honouring
 * a filter.
 *
 * **The same request body the screen generated with, run through the same
 * service call**, with only the page size opened up — see
 * `reportService.generateAll`. An export assembled from its own query is the one
 * that comes to disagree with the report it was taken from, and these are the
 * copies that get archived and mailed around, where nobody can check them
 * against the screen any more. That includes the in-report narrowing: a search
 * or a status filter travels with the request, so a file holds exactly the rows
 * somebody was looking at and its header names the filters that produced them. A
 * file quietly wider than the screen is the same lie in the other direction.
 *
 * `POST` rather than `GET` for the reason the generate route gives: the request
 * carries a period in one of three shapes, a people selection and up to two
 * hundred ids, which is past what a query string reliably holds and would land
 * in access logs naming everybody the report was about. It is still a read —
 * `reportService` writes nothing.
 */
import { failure, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import { buildReportDocument, type ReportDocument } from "@/lib/report-document";
import { reportService } from "@/services/report.service";
import { employeeReportRequestSchema } from "@/validations/employee-report.schema";
import { reportRequestSchema } from "@/validations/report.schema";

/** How one format turns a report document into a downloadable file. */
export type ReportExportFormat = {
  /** Appended to the document's own branded stem — `xlsx`, `pdf`, `csv`. */
  extension: string;
  contentType: string;
  render: (document: ReportDocument) => BodyInit | Promise<BodyInit>;
};

export async function exportReport(request: Request, format: ReportExportFormat): Promise<Response> {
  return deliver(format, async () => {
    const user = await requireAdmin();
    const input = await parseBody(request, reportRequestSchema);
    const report = await reportService.generateAll(user, input);

    return buildReportDocument(report, {
      search: input.search,
      role: input.role,
      status: input.status,
    });
  });
}

/**
 * The same three files, for the report about one person.
 *
 * It re-posts the body the screen generated with, through the **same service
 * call** the screen used, for the reason the workforce export gives: a file
 * assembled from its own query is the one that comes to disagree with the report
 * it was taken from. `reportService.forEmployee` applies `byIdForActor` again on
 * every request, so an export is refused by exactly the rule that refuses the
 * profile page — a hand-written POST to another administrator's id gets the same
 * *not found* the screen would.
 *
 * There is no refinement to carry, because that screen has none: the period is
 * its only filter. The document is handed the subject instead, which is what
 * puts §15's employee block and the attendance rate on all three formats without
 * any of the three renderers learning about it.
 */
export async function exportEmployeeReport(
  request: Request,
  employeeId: string,
  format: ReportExportFormat,
): Promise<Response> {
  return deliver(format, async () => {
    const user = await requireAdmin();
    const input = await parseBody(request, employeeReportRequestSchema);
    const report = await reportService.forEmployeeAll(user, employeeId, input);

    return buildReportDocument(report, {
      role: "ALL",
      status: "ALL",
      subject: {
        name: report.subject.name,
        id: report.subject.id,
        email: report.subject.email,
        role: report.subject.role,
        department: report.subject.department,
        position: report.subject.position,
        status: report.subject.status,
        attendanceRate: report.attendanceRate,
        attendanceAssessedDays: report.attendanceAssessedDays,
      },
    });
  });
}

/** Renders a built document as a download, and turns a refusal into JSON. */
async function deliver(
  format: ReportExportFormat,
  build: () => Promise<ReportDocument>,
): Promise<Response> {
  try {
    const document = await build();

    return new Response(await format.render(document), {
      headers: {
        "Content-Type": format.contentType,
        "Content-Disposition": `attachment; filename="${document.fileStem}.${format.extension}"`,
        // Never cached: a report is a snapshot, and the same request an hour
        // later is a different answer.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return failure(error);

    console.error(`[api] Report ${format.extension} export failed:`, error);
    return new Response("Export failed", { status: 500 });
  }
}
