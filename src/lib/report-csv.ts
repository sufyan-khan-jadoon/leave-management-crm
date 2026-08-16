/**
 * A report document, as a spreadsheet-shaped grid of text.
 *
 * The thinnest of the three renderers: it takes the document
 * `report-document.ts` already built and lays it out as rows of strings, because
 * CSV has no styling to apply and no pages to break. Everything it prints —
 * every heading, column, figure and note — was decided there, which is what
 * makes this file, the workbook and the PDF three views of one report rather
 * than three reports.
 *
 * Pure, and free of Prisma and of Next, so it can be driven with a real document
 * and read on its own. The route is left holding the two things only a route can
 * do, which are the guard and the response.
 *
 * **It never recomputes anything.** A formatter that added its own arithmetic
 * would be a second answer landing in the copy that gets archived, where nothing
 * can be checked against the screen it came from.
 */
import type { ReportDocument, ReportFieldEntry, ReportTable } from "@/lib/report-document";

/**
 * The whole file: an identifying header, the overall summary, one line per
 * person, then the records.
 *
 * It leads with the report's identity because a CSV outlives the screen — a bare
 * grid of dates cannot say what question it answered, and this is the copy that
 * gets mailed around and filed. The brand leads that, so a file found in a
 * folder a year later still says who produced it.
 */
export function reportDocumentToCsvRows(document: ReportDocument): string[][] {
  return [
    [document.brand.toUpperCase()],
    [document.title],
    [],
    ...document.identity.map(pair),
    [],

    ["OVERALL SUMMARY"],
    ...document.summary.map(pair),
    ...(document.notes.length > 0 ? [[], ["NOTES"], ...document.notes.map((note) => [note])] : []),
    [],

    ...tableRows(document.individuals),
    [],
    ...tableRows(document.records),
  ];
}

/**
 * A section title, its header row and its rows — or the title and the reason
 * there is nothing under it.
 *
 * An empty table printed as a bare header reads as a file that failed to write;
 * naming why it is empty is the difference between an answer and a blank.
 */
function tableRows(table: ReportTable): string[][] {
  return [
    [table.title.toUpperCase()],
    ...(table.rows.length === 0
      ? [[table.emptyNote]]
      : [table.columns.map((column) => column.header), ...table.rows]),
  ];
}

/**
 * A label and its value on one line, rather than a header row and a value row.
 *
 * A summary block is read by a person, not parsed by a machine: pairs stay
 * legible when a line is added and do not have to be scrolled sideways to match
 * a number to its name.
 */
function pair(entry: ReportFieldEntry): string[] {
  return [entry.label, entry.value];
}
