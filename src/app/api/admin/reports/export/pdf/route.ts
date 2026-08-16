import { exportReport } from "@/lib/report-export";
import { PDF_CONTENT_TYPE, reportDocumentToPdf } from "@/lib/report-pdf";

/**
 * Writes the generated report out as a printable PDF.
 *
 * Its own route for the reason the workbook's is — see there. Everything that
 * decides *what* the file says is `exportReport` and the document it builds; the
 * pages, the letterhead and the pagination are `report-pdf.ts`.
 */
export async function POST(request: Request) {
  return exportReport(request, {
    extension: "pdf",
    contentType: PDF_CONTENT_TYPE,
    render: (document) => reportDocumentToPdf(document),
  });
}
