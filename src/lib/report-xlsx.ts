/**
 * A report document, as an Excel workbook.
 *
 * The second of the three renderers over `report-document.ts`. It decides
 * nothing about *what* the report says — every heading, column, figure and note
 * arrives already built — and owns only what is genuinely specific to a
 * spreadsheet: sheets, column widths, frozen headers, filters and the Zovencia
 * letterhead.
 *
 * **Three sheets rather than one long one**, because that is what a spreadsheet
 * is for: an administrator opening this wants to sort the records, filter them
 * and total a column, and none of that works when a summary block sits above the
 * header row. The identity of the report leads the first sheet and is repeated
 * as a band on the other two, so a sheet copied out of the workbook still says
 * which report it came from.
 *
 * Free of Prisma and of Next — it takes a document and returns bytes, so the
 * route is left holding the guard and the response.
 */
import ExcelJS from "exceljs";

import { BRAND_COLORS } from "@/lib/brand";
import type { ReportDocument, ReportFieldEntry, ReportTable } from "@/lib/report-document";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Excel wants ARGB without the hash, and opaque is `FF`. */
function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

const FONT = "Calibri";

/**
 * A figure, written as a number rather than as the text of one.
 *
 * The document hands every renderer strings, because a CSV and a PDF have
 * nothing else — but a spreadsheet does, and a column of counts stored as text
 * cannot be summed, sorted or charted, and Excel marks every cell of it with a
 * warning. So the strings that are *wholly* a number become numbers here, in the
 * one renderer that has somewhere to put them.
 *
 * Deliberately strict about what counts. "42 m" is a distance the document
 * already formatted and "5:00 PM" is a time; both stay text, because a number
 * with its unit stripped off is a different fact. Nothing is parsed, rounded or
 * recomputed — a string either *is* a number or it is left exactly as it came.
 */
function cellValue(text: string): string | number {
  return text !== "" && /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text;
}

/** How wide the letterhead band spans when a sheet has few columns of its own. */
const MIN_BAND_COLUMNS = 4;

export async function reportDocumentToXlsx(document: ReportDocument): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();

  // Document properties, which is where a file's provenance survives being
  // renamed. Excel shows these in File → Info, and they outlive the filename.
  workbook.creator = document.brand;
  workbook.lastModifiedBy = document.brand;
  workbook.created = new Date();
  workbook.title = `${document.brand} — ${document.title}`;
  workbook.subject = document.periodLabel;
  workbook.company = document.brand;

  writeSummarySheet(workbook, document);
  writeTableSheet(workbook, document, document.individuals, "Individual Summary");
  writeTableSheet(workbook, document, document.records, "Detailed Records");

  // `writeBuffer` resolves to ExcelJS's own Buffer alias, which is an
  // ArrayBuffer at runtime. Normalised to a `Uint8Array` rather than a Node
  // `Buffer` because that is what a `Response` body accepts on every runtime —
  // `Buffer` is a Node type the web `BodyInit` does not name.
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

/** The first sheet: what this report is, and what it comes to overall. */
function writeSummarySheet(workbook: ExcelJS.Workbook, document: ReportDocument): void {
  const sheet = workbook.addWorksheet("Report Summary", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.getColumn(1).width = 38;
  sheet.getColumn(2).width = 62;

  writeLetterhead(sheet, document, 2);

  writeBlock(sheet, "REPORT DETAILS", document.identity, 2);
  writeBlock(sheet, "OVERALL SUMMARY", document.summary, 2);

  if (document.notes.length > 0) {
    writeHeading(sheet, "NOTES", 2);

    for (const note of document.notes) {
      const row = sheet.addRow([note]);
      sheet.mergeCells(row.number, 1, row.number, 2);
      row.getCell(1).alignment = { wrapText: true, vertical: "top" };
      row.getCell(1).font = { name: FONT, size: 10, color: { argb: argb(BRAND_COLORS.muted) } };
      // Wrapped text needs a height Excel will not work out for itself once the
      // cell is merged; four lines is generous for the longest note here.
      row.height = Math.min(60, 14 * Math.ceil(note.length / 90) + 6);
    }
  }
}

/** A sheet that is one table, with the letterhead above it and nothing else. */
function writeTableSheet(
  workbook: ExcelJS.Workbook,
  document: ReportDocument,
  table: ReportTable,
  name: string,
): void {
  const sheet = workbook.addWorksheet(name, {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  table.columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });

  writeLetterhead(sheet, document, Math.max(table.columns.length, MIN_BAND_COLUMNS));

  if (table.rows.length === 0) {
    const row = sheet.addRow([table.emptyNote]);
    sheet.mergeCells(row.number, 1, row.number, Math.max(table.columns.length, MIN_BAND_COLUMNS));
    row.getCell(1).font = { name: FONT, size: 11, italic: true, color: { argb: argb(BRAND_COLORS.muted) } };
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    row.height = 32;
    return;
  }

  const headerRow = sheet.addRow(table.columns.map((column) => column.header));
  headerRow.height = 22;

  headerRow.eachCell((cell, index) => {
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: argb(BRAND_COLORS.white) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(BRAND_COLORS.darkGreen) } };
    cell.alignment = {
      vertical: "middle",
      horizontal: table.columns[index - 1]?.align ?? "left",
    };
    cell.border = { bottom: { style: "thin", color: { argb: argb(BRAND_COLORS.green) } } };
  });

  for (const values of table.rows) {
    const row = sheet.addRow(values.map(cellValue));

    row.eachCell((cell, index) => {
      cell.font = { name: FONT, size: 10 };
      cell.alignment = {
        vertical: "middle",
        horizontal: table.columns[index - 1]?.align ?? "left",
      };
      cell.border = { bottom: { style: "hair", color: { argb: argb(BRAND_COLORS.border) } } };
    });

    // Banded rows, which is what makes a wide table readable across the page.
    if (row.number % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(BRAND_COLORS.panel) } };
      });
    }
  }

  // The header stays in view while the records scroll, and carries the filter
  // dropdowns — the two things somebody opens a spreadsheet to do.
  sheet.views = [{ state: "frozen", ySplit: headerRow.number, showGridLines: false }];
  sheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number + table.rows.length, column: table.columns.length },
  };

  // The column headers repeat at the top of every printed page — a twelve-page
  // grid of dates is unreadable without them. Resolved from the row that was
  // actually written rather than hard-coded, since the letterhead above it can
  // grow.
  sheet.pageSetup.printTitlesRow = `${headerRow.number}:${headerRow.number}`;
}

/**
 * The Zovencia band every sheet opens with.
 *
 * Dark green fill with the brand green as the wordmark on top of it, which is
 * the FILL vs INK rule the whole product follows: #0AEA0A is luminous enough to
 * be unreadable as text on white, so where it has to be *lettering* the surface
 * beneath it goes dark rather than the green being dulled.
 */
function writeLetterhead(sheet: ExcelJS.Worksheet, document: ReportDocument, span: number): void {
  const brandRow = sheet.addRow([document.brand]);
  sheet.mergeCells(brandRow.number, 1, brandRow.number, span);
  brandRow.height = 34;

  paintBand(sheet, brandRow.number, span);
  brandRow.getCell(1).font = {
    name: FONT,
    size: 20,
    bold: true,
    color: { argb: argb(BRAND_COLORS.green) },
  };
  brandRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const titleRow = sheet.addRow([`${document.title}  ·  ${document.periodLabel}`]);
  sheet.mergeCells(titleRow.number, 1, titleRow.number, span);
  titleRow.height = 20;

  paintBand(sheet, titleRow.number, span);
  titleRow.getCell(1).font = { name: FONT, size: 11, color: { argb: argb(BRAND_COLORS.white) } };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const stampRow = sheet.addRow([`Generated ${document.generatedAt}  ·  ${document.tagline}`]);
  sheet.mergeCells(stampRow.number, 1, stampRow.number, span);
  stampRow.height = 18;

  paintBand(sheet, stampRow.number, span);
  stampRow.getCell(1).font = { name: FONT, size: 9, color: { argb: argb(BRAND_COLORS.green) } };
  stampRow.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  sheet.addRow([]);
}

/**
 * Fills a whole band row, not only its first cell.
 *
 * A merged range in Excel keeps its constituent cells, and only the top-left one
 * carries a fill applied through the merge — so the band would stop at column A
 * and the rest of the row would stay white.
 */
function paintBand(sheet: ExcelJS.Worksheet, rowNumber: number, span: number): void {
  for (let column = 1; column <= span; column += 1) {
    sheet.getCell(rowNumber, column).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(BRAND_COLORS.darkGreen) },
    };
  }
}

function writeHeading(sheet: ExcelJS.Worksheet, text: string, span: number): void {
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, span);
  row.height = 20;

  row.getCell(1).font = {
    name: FONT,
    size: 11,
    bold: true,
    color: { argb: argb(BRAND_COLORS.darkGreen) },
  };
  row.getCell(1).alignment = { vertical: "middle" };
  row.getCell(1).border = { bottom: { style: "thin", color: { argb: argb(BRAND_COLORS.green) } } };
}

/** A heading and its label/value pairs, laid out down the sheet rather than across. */
function writeBlock(
  sheet: ExcelJS.Worksheet,
  heading: string,
  entries: ReportFieldEntry[],
  span: number,
): void {
  writeHeading(sheet, heading, span);

  for (const entry of entries) {
    const row = sheet.addRow([entry.label, cellValue(entry.value)]);

    row.getCell(1).font = { name: FONT, size: 10, bold: true, color: { argb: argb(BRAND_COLORS.muted) } };
    row.getCell(2).font = { name: FONT, size: 10 };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }

  sheet.addRow([]);
}
