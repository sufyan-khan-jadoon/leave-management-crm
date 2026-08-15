/**
 * Turning rows into a spreadsheet, in one place.
 *
 * Extracted when the third export arrived: the leave history and the attendance
 * roster had each carried their own copy of `escapeCsvCell`, identical down to
 * the comment, and a third would have made the formula-injection guard something
 * you have to remember to bring with you. Free of Prisma and of Next, so it can
 * be read and tested on its own like the other rule files here.
 */

/**
 * Quotes a cell and neutralises spreadsheet formula injection.
 *
 * A leading `=`, `+`, `-` or `@` is what Excel and Sheets read as the start of a
 * formula, so a name or a leave reason beginning with one would be *executed* by
 * whoever opened the file rather than displayed. Prefixing an apostrophe makes
 * it text. The tab and carriage return are in the set for the same reason —
 * both can lead a cell into the same interpretation.
 */
export function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Rows to CSV text, CRLF-separated as the format expects. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

/**
 * A CSV response, named and non-cacheable.
 *
 * The leading BOM is what makes Excel honour UTF-8: without it a name carrying
 * anything outside ASCII opens as mojibake, which is exactly the case a report
 * about people runs into.
 */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
