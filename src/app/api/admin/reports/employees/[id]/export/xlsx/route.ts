import { exportEmployeeReport } from "@/lib/report-export";
import { reportDocumentToXlsx, XLSX_CONTENT_TYPE } from "@/lib/report-xlsx";

/**
 * One person's report as an Excel workbook.
 *
 * Its own route rather than a `format` field, following the split the workforce
 * exports already make — and the same three-sheet workbook, because a spreadsheet
 * about one person and a spreadsheet about eleven are the same document with a
 * different subject. §16's separate Attendance and Leaves sheets are deliberately
 * not built here: the records sheet already holds one row per day with the leave
 * on it, and splitting it would mean a second place deciding which day is which
 * kind of record.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return exportEmployeeReport(request, id, {
    extension: "xlsx",
    contentType: XLSX_CONTENT_TYPE,
    render: (document) => reportDocumentToXlsx(document),
  });
}
