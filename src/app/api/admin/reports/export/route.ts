import { toCsv } from "@/lib/csv";
import { reportDocumentToCsvRows } from "@/lib/report-csv";
import { exportReport } from "@/lib/report-export";

/**
 * Writes the generated report out as a CSV.
 *
 * The guard, the schema, the service call and the branded document are all
 * `exportReport` — see there for why an export re-posts the body rather than
 * serialising the screen. What is left here is the one thing only this format
 * decides: rows of text, and the leading BOM.
 *
 * The BOM is what makes Excel honour UTF-8. Without it a name carrying anything
 * outside ASCII opens as mojibake, which is exactly the case a report about
 * people runs into.
 */
export async function POST(request: Request) {
  return exportReport(request, {
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
    render: (document) => `﻿${toCsv(reportDocumentToCsvRows(document))}`,
  });
}
