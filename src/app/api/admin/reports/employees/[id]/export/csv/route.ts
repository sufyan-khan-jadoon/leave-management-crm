import { toCsv } from "@/lib/csv";
import { reportDocumentToCsvRows } from "@/lib/report-csv";
import { exportEmployeeReport } from "@/lib/report-export";

/**
 * One person's report as a CSV.
 *
 * Nested under the employee rather than sitting at `/export` the way the
 * workforce CSV does, because this tree already has to branch for the PDF and
 * the workbook and a bare `/export` beside two named siblings reads as an
 * oversight rather than as a format.
 *
 * The leading BOM is what makes Excel honour UTF-8 — without it a name carrying
 * anything outside ASCII opens as mojibake, which is exactly the case a report
 * about a person runs into.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return exportEmployeeReport(request, id, {
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
    render: (document) => `﻿${toCsv(reportDocumentToCsvRows(document))}`,
  });
}
