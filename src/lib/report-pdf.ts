/**
 * A report document, as a printable PDF.
 *
 * The third renderer over `report-document.ts`, and the only one that has to
 * think about a page. It decides nothing about *what* the report says — every
 * heading, column, figure and note arrives already built, so this file and the
 * workbook beside it cannot describe one report two ways — and owns exactly what
 * paper adds: the Zovencia letterhead on every page, the footer, pagination, and
 * how thirteen columns are shared across the width of a sheet.
 *
 * Landscape A4 on purpose. The detailed records carry up to fifteen columns, and
 * portrait would either drop some or squeeze them past reading.
 *
 * Free of Prisma and of Next — it takes a document and returns bytes, so the
 * route is left holding the guard and the response.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { BRAND_COLORS } from "@/lib/brand";
import type { ReportDocument, ReportFieldEntry, ReportTable } from "@/lib/report-document";

export const PDF_CONTENT_TYPE = "application/pdf";

/** Millimetres, which is the unit the document is built in. */
const PAGE_MARGIN = 12;
/** The letterhead band, and where content may begin beneath it. */
const BAND_HEIGHT = 20;
const CONTENT_TOP = BAND_HEIGHT + 9;
/** Room kept clear at the foot of every page for the rule and the footer line. */
const FOOTER_SPACE = 14;

/**
 * The placeholder `putTotalPages` rewrites once the page count is known.
 *
 * "Page 3 of 7" cannot be written while page 3 is being drawn, so the footer
 * writes a token and jsPDF substitutes it across every page at the end.
 */
const TOTAL_PAGES_TOKEN = "{{pages}}";

/**
 * How many detailed records one PDF prints.
 *
 * A bound on the **medium**, not on the report — which is why it lives here and
 * not in `report-document.ts`, and why the workbook and the CSV have no
 * equivalent. Rendering is worse than linear: measured on this codebase, 500
 * rows take 0.6s, 2,000 take 1.9s and 5,000 take 7.4s, on top of generating the
 * report in the first place. `vercel.json` sets no `maxDuration`, so the
 * platform default applies, and a PDF that spends the whole budget drawing
 * arrives as a timeout on the one button somebody pressed — with nothing to say
 * what went wrong.
 *
 * Three thousand is about three seconds and 0.8MB, which leaves room for the
 * report itself; it is a month for a hundred and thirty people, and already
 * seventy-five printed pages. Everything *above* the records — the totals, the
 * coverage and every individual summary — still describes the whole report, so a
 * capped PDF is a complete report that stops listing rather than a partial one,
 * and it says so in the notes where somebody will see it before reaching the
 * end. The complete set is the Excel export, which costs a fifth as much per row
 * and is the right artefact for data anyway.
 *
 * If this needs raising, raise `maxDuration` in `vercel.json` in the same change
 * and re-measure — the response body also has a platform ceiling, which these
 * figures put at roughly seventeen thousand rows.
 */
const MAX_PDF_DETAIL_ROWS = 3_000;

/** The table's own type: body and header sizes, and the padding either side. */
const BODY_FONT_SIZE = 7;
const HEAD_FONT_SIZE = 7.2;
const CELL_PADDING = 1.4;

/**
 * How many rows are measured when working out column widths.
 *
 * Every row would be exact and costs a `getTextWidth` per cell, which on a
 * five-thousand-row report is seventy-five thousand measurements before a single
 * line is drawn. The first few hundred rows settle the shape of a report; a
 * longer value further down wraps, which is what the remaining columns are sized
 * to allow for anyway.
 */
const WIDTH_SAMPLE_ROWS = 400;

/** jsPDF wants colours as RGB triples rather than hex. */
function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

const GREEN = rgb(BRAND_COLORS.green);
const DARK_GREEN = rgb(BRAND_COLORS.darkGreen);
const WHITE = rgb(BRAND_COLORS.white);
const MUTED = rgb(BRAND_COLORS.muted);
const PANEL = rgb(BRAND_COLORS.panel);
const BORDER = rgb(BRAND_COLORS.border);

/**
 * `finalY` is set on the document by autoTable itself.
 *
 * Not in its published types, but it is how the library is meant to be read
 * back — declared narrowly here rather than reaching for `any` at four call
 * sites.
 */
type PaginatedDoc = jsPDF & { lastAutoTable?: { finalY: number } };

export function reportDocumentToPdf(document: ReportDocument): Uint8Array<ArrayBuffer> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    // A report is a grid, and a grid is a content stream that repeats itself
    // thousands of times — it compresses by better than an order of magnitude,
    // which is the difference between a file that can be mailed and one that
    // cannot. Nothing about the rendering changes.
    compress: true,
  }) as PaginatedDoc;

  doc.setProperties({
    title: `${document.brand} — ${document.title}`,
    subject: document.periodLabel,
    author: document.brand,
    creator: document.brand,
  });

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const usable = width - PAGE_MARGIN * 2;

  /**
   * The letterhead and the footer, drawn onto whichever page is current.
   *
   * Hung off autoTable's own page hook rather than drawn in a loop afterwards,
   * so a page the tables create mid-flow gets its chrome as it appears — a page
   * added and then decorated is a page that can be missed.
   *
   * **Once per page.** Every table on the page fires the hook, so the first page
   * would otherwise have the band and the footer painted over themselves five
   * times — invisible, and five times the content stream for nothing.
   */
  const decorated = new Set<number>();

  const chrome = () => {
    const page = doc.getCurrentPageInfo().pageNumber;
    if (decorated.has(page)) return;

    decorated.add(page);
    drawLetterhead(doc, document, width);
    drawFooter(doc, document, width, height);
  };

  chrome();
  let y = CONTENT_TOP;

  // Capped for the medium rather than for the report — see `MAX_PDF_DETAIL_ROWS`.
  // The cap is named in the notes above the tables, where somebody reading the
  // last printed row will already have seen it.
  const capped = document.records.rows.length > MAX_PDF_DETAIL_ROWS;
  const records = capped
    ? { ...document.records, rows: document.records.rows.slice(0, MAX_PDF_DETAIL_ROWS) }
    : document.records;

  const notes = capped
    ? [
        ...document.notes,
        `This report holds ${document.records.rows.length.toLocaleString("en-GB")} records. The PDF prints the first ${MAX_PDF_DETAIL_ROWS.toLocaleString("en-GB")}; export to Excel or CSV for the complete set. Every figure above — the totals, the coverage and each individual summary — describes the whole report.`,
      ]
    : document.notes;

  y = writeBlock(doc, "Report details", document.identity, y, usable, chrome, height);
  y = writeBlock(doc, "Overall summary", document.summary, y, usable, chrome, height);

  if (notes.length > 0) {
    y = writeNotes(doc, notes, y, usable, chrome, height);
  }

  y = writeTable(doc, document.individuals, y, usable, chrome, height);
  writeTable(doc, records, y, usable, chrome, height);

  // Every footer written so far holds the token; this is where it becomes a
  // number, now that the count is finally known.
  doc.putTotalPages(TOTAL_PAGES_TOKEN);

  // A `Uint8Array` rather than a Node `Buffer`, for the reason the workbook
  // gives: it is what a web `Response` body accepts on every runtime.
  return new Uint8Array(doc.output("arraybuffer"));
}

/**
 * The Zovencia band across the top of every page.
 *
 * Dark green fill with the brand green as the wordmark on it — the FILL vs INK
 * rule the whole product follows. #0AEA0A is luminous enough to be unreadable as
 * text on white, so where it has to be *lettering* the surface beneath it goes
 * dark rather than the green being dulled.
 */
function drawLetterhead(doc: jsPDF, document: ReportDocument, width: number): void {
  doc.setFillColor(...DARK_GREEN);
  doc.rect(0, 0, width, BAND_HEIGHT, "F");

  doc.setFillColor(...GREEN);
  doc.rect(0, BAND_HEIGHT, width, 0.9, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...GREEN);
  doc.text(document.brand, PAGE_MARGIN, 11.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text(document.title, width - PAGE_MARGIN, 8.6, { align: "right" });

  doc.setFontSize(8);
  doc.setTextColor(...GREEN);
  doc.text(
    `${document.periodLabel}  ·  Generated ${document.generatedAt}`,
    width - PAGE_MARGIN,
    14.2,
    { align: "right" },
  );
}

/** The rule and the standing footer: what this is, and where you are in it. */
function drawFooter(doc: jsPDF, document: ReportDocument, width: number, height: number): void {
  const baseline = height - 7;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(PAGE_MARGIN, baseline - 4.5, width - PAGE_MARGIN, baseline - 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`${document.brand} — ${document.tagline}`, PAGE_MARGIN, baseline);
  doc.text(
    `Page ${doc.getCurrentPageInfo().pageNumber} of ${TOTAL_PAGES_TOKEN}`,
    width - PAGE_MARGIN,
    baseline,
    { align: "right" },
  );
}

/**
 * A section heading, with the page turned first when there is no room under it.
 *
 * A heading stranded at the foot of a page with its table overleaf is the
 * commonest way a generated PDF reads as machine output.
 */
function writeHeading(
  doc: jsPDF,
  text: string,
  y: number,
  usable: number,
  chrome: () => void,
  height: number,
): number {
  let top = y;

  if (top + 22 > height - FOOTER_SPACE) {
    doc.addPage();
    chrome();
    top = CONTENT_TOP;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK_GREEN);
  doc.text(text.toUpperCase(), PAGE_MARGIN, top);

  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN, top + 1.8, PAGE_MARGIN + usable, top + 1.8);

  return top + 6;
}

/** A heading and its label/value pairs, read down the page rather than across. */
function writeBlock(
  doc: PaginatedDoc,
  heading: string,
  entries: ReportFieldEntry[],
  y: number,
  usable: number,
  chrome: () => void,
  height: number,
): number {
  const top = writeHeading(doc, heading, y, usable, chrome, height);

  autoTable(doc, {
    startY: top,
    theme: "plain",
    margin: { top: CONTENT_TOP, left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: FOOTER_SPACE },
    styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 1, right: 2, bottom: 1, left: 0 } },
    columnStyles: {
      0: { cellWidth: 68, fontStyle: "bold", textColor: MUTED },
      1: { cellWidth: usable - 68 },
    },
    body: entries.map((entry) => [entry.label, entry.value]),
    didDrawPage: chrome,
  });

  return (doc.lastAutoTable?.finalY ?? top) + 7;
}

/** The findings that are not numbers in a column, set apart on a tinted panel. */
function writeNotes(
  doc: PaginatedDoc,
  notes: string[],
  y: number,
  usable: number,
  chrome: () => void,
  height: number,
): number {
  const top = writeHeading(doc, "Notes", y, usable, chrome, height);

  autoTable(doc, {
    startY: top,
    theme: "plain",
    margin: { top: CONTENT_TOP, left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: FOOTER_SPACE },
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: MUTED,
      fillColor: PANEL,
      cellPadding: 2.5,
    },
    columnStyles: { 0: { cellWidth: usable } },
    body: notes.map((note) => [note]),
    didDrawPage: chrome,
  });

  return (doc.lastAutoTable?.finalY ?? top) + 7;
}

/**
 * Column widths, measured rather than guessed.
 *
 * The document declares a width per column in characters, which is exactly what
 * a spreadsheet wants and is **not** enough here: a character count says nothing
 * about how wide those characters are at 7pt on 273mm of landscape A4. Scaling
 * those numbers directly is what this first did, and it broke `2026-08-18`
 * across two lines as `2026-08` and `-18`, turned `Administrator` into
 * `Administrat` / `or`, and split `APPROVED`. A wrapped sentence is ordinary; a
 * date cut in half is a document nobody trusts.
 *
 * So each column asks for two figures, both from jsPDF's own metrics for the
 * font actually being drawn:
 *
 * - **atomic** — its widest unbreakable *token*. Text wraps at spaces, so a date,
 *   an enum value or a single long word has to be given room outright, while
 *   "On leave" may fold onto two lines without losing anything.
 * - **natural** — the widest cell whole, which is what it would take to wrap
 *   nothing at all.
 *
 * Every column is guaranteed its atomic width, and whatever the page has left
 * over is shared out in proportion to how much each column would still like —
 * so the free-text columns absorb the shortfall and the dates, roles and
 * statuses stay intact. When even the atomic widths do not fit, everything is
 * scaled down together; that is the degenerate case, and wrapping mid-word is
 * the honest outcome of asking for more columns than the paper holds.
 */
function measureColumns(doc: jsPDF, table: ReportTable, usable: number): number[] {
  const padding = CELL_PADDING * 2;
  const sample = table.rows.slice(0, WIDTH_SAMPLE_ROWS);

  const widestToken = (text: string) =>
    text.split(/\s+/).reduce((widest, token) => Math.max(widest, doc.getTextWidth(token)), 0);

  const atomic: number[] = [];
  const natural: number[] = [];

  table.columns.forEach((column, index) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(HEAD_FONT_SIZE);

    let token = widestToken(column.header);
    let whole = doc.getTextWidth(column.header);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_FONT_SIZE);

    for (const row of sample) {
      const text = row[index] ?? "";
      token = Math.max(token, widestToken(text));
      whole = Math.max(whole, doc.getTextWidth(text));
    }

    atomic.push(token + padding);
    natural.push(whole + padding);
  });

  const atomicTotal = atomic.reduce((sum, width) => sum + width, 0);
  if (atomicTotal >= usable) return atomic.map((width) => (width / atomicTotal) * usable);

  const slack = atomic.map((width, index) => natural[index] - width);
  const slackTotal = slack.reduce((sum, width) => sum + width, 0);
  const spare = usable - atomicTotal;

  // Evenly when nothing wants more, so the table still fills the page rather
  // than huddling against the left margin.
  if (slackTotal <= 0) return atomic.map((width) => width + spare / atomic.length);

  return atomic.map((width, index) => width + (slack[index] / slackTotal) * spare);
}

/**
 * One of the document's tables, laid across the page.
 *
 * The header repeats on every page and a row is kept whole rather than split
 * across a break — a record cut in half is one somebody misreads rather than
 * one they scroll to finish.
 */
function writeTable(
  doc: PaginatedDoc,
  table: ReportTable,
  y: number,
  usable: number,
  chrome: () => void,
  height: number,
): number {
  const top = writeHeading(doc, table.title, y, usable, chrome, height);

  if (table.rows.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);

    const lines = doc.splitTextToSize(table.emptyNote, usable) as string[];
    doc.text(lines, PAGE_MARGIN, top + 2);

    return top + lines.length * 4.5 + 8;
  }

  const widths = measureColumns(doc, table, usable);

  autoTable(doc, {
    startY: top,
    theme: "striped",
    head: [table.columns.map((column) => column.header)],
    body: table.rows,
    margin: { top: CONTENT_TOP, left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: FOOTER_SPACE },
    tableWidth: usable,
    rowPageBreak: "avoid",
    showHead: "everyPage",
    styles: {
      font: "helvetica",
      fontSize: BODY_FONT_SIZE,
      cellPadding: CELL_PADDING,
      overflow: "linebreak",
      lineColor: BORDER,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: DARK_GREEN,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: HEAD_FONT_SIZE,
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: PANEL },
    columnStyles: Object.fromEntries(
      table.columns.map((column, index) => [
        index,
        { halign: column.align, cellWidth: widths[index] },
      ]),
    ),
    didDrawPage: chrome,
  });

  return (doc.lastAutoTable?.finalY ?? top) + 7;
}
