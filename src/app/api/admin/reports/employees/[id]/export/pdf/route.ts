import { exportEmployeeReport } from "@/lib/report-export";
import { PDF_CONTENT_TYPE, reportDocumentToPdf } from "@/lib/report-pdf";

/**
 * One person's report as a printable, branded PDF.
 *
 * The same renderer the workforce PDF uses, given the same kind of document —
 * `report-document.ts` is the seam, and it is what stops a report about one
 * person being laid out by a second implementation. Everything specific to this
 * endpoint is the subject the document is built with; see `exportEmployeeReport`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return exportEmployeeReport(request, id, {
    extension: "pdf",
    contentType: PDF_CONTENT_TYPE,
    render: (document) => reportDocumentToPdf(document),
  });
}
