import { exportReport } from "@/lib/report-export";
import { reportDocumentToXlsx, XLSX_CONTENT_TYPE } from "@/lib/report-xlsx";

/**
 * Writes the generated report out as an Excel workbook.
 *
 * Its own route rather than a `format` field on the CSV one, following the split
 * `/api/admin/chat/action` makes: the request schema is a strict discriminated
 * union shared with the generate endpoint, and threading a field through it that
 * only one of the two has any use for is how a schema starts describing routes
 * instead of requests.
 *
 * Everything that decides *what* the file says is `exportReport` and the
 * document it builds, so this and the PDF beside it cannot describe one report
 * two ways.
 */
export async function POST(request: Request) {
  return exportReport(request, {
    extension: "xlsx",
    contentType: XLSX_CONTENT_TYPE,
    render: (document) => reportDocumentToXlsx(document),
  });
}
