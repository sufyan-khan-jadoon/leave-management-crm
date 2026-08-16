/**
 * A generated report, as a document.
 *
 * **This is the one place a report becomes headings, labels, columns and cells**,
 * and the three exported formats are three renderers of it: `report-csv.ts`
 * flattens it, `report-xlsx.ts` styles it into a workbook, `report-pdf.ts` paints
 * it onto pages. A spreadsheet and a PDF assembled independently would be two
 * more implementations of a report that already exists, and they would disagree
 * with each other long before anybody noticed — in the copies that get archived
 * and mailed around, where nothing can be checked against the screen they came
 * from.
 *
 * Pure, and free of Prisma and of Next, so it can be driven with a real report
 * and read on its own — the same shape `report-period.ts` and `report-labels.ts`
 * beside it take. Every renderer is left holding only what is genuinely specific
 * to its format.
 *
 * **It never recomputes anything.** Every figure written out is one
 * `report.service.ts` put on the report; a formatter that added its own
 * arithmetic would be a second answer, and this is the layer furthest from
 * anyone able to spot it.
 *
 * The columns follow the **record types the report holds**, exactly as
 * `ReportSummary` and `ReportTable` do on screen — a leave-only report carries no
 * check-in times, so those columns are absent rather than a page of blanks, and a
 * `Absent: 0` line in a report that never asked about absence is a statement
 * about the period masquerading as a finding. That rule lives here once so the
 * screen, the CSV, the spreadsheet and the PDF cannot answer it differently.
 */
import { friendlyTimeLabel } from "@/lib/attendance-policy";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { formatDateTime, formatTimeInAppZone, toIsoDate } from "@/lib/date";
import { formatDistance } from "@/lib/geo";
import {
  dayStatusLabel,
  describePeopleSelection,
  describeRecordTypes,
  describeReportRefinements,
  recordTypeLabel,
  roleLabel,
} from "@/lib/report-labels";
import type { ReportPeriod } from "@/lib/report-period";
import type {
  ReportPersonSummary,
  ReportResult,
  ReportRow,
  ReportTotals,
} from "@/services/report.service";

/** What is narrowing the report beyond its period, people and record types. */
export type ReportRefinements = Parameters<typeof describeReportRefinements>[0];

/** A label and its value, as a summary block is read: down, not across. */
export type ReportFieldEntry = { label: string; value: string };

export type ReportColumn = {
  header: string;
  /** Numbers right, words left — honoured by every renderer that has a choice. */
  align: "left" | "right";
  /**
   * A width in characters, which is what a spreadsheet column takes directly and
   * what a PDF divides its page across proportionally. Not pixels: the point is
   * the *relation* between the columns, which survives both.
   */
  width: number;
};

/** A titled table of already-formatted strings. */
export type ReportTable = {
  title: string;
  columns: ReportColumn[];
  rows: string[][];
  /** What to say in place of the table when it holds nothing. */
  emptyNote: string;
};

/**
 * Everything an exported report says, in the order it says it.
 *
 * It leads with its own identity because an exported file outlives the screen: a
 * bare grid of dates cannot say what question it answered, and this is the copy
 * that gets filed.
 */
export type ReportDocument = {
  brand: string;
  tagline: string;
  title: string;
  /** The period, in the one wording every surface uses. */
  periodLabel: string;
  generatedAt: string;
  /** Period, people, records, filters, generation time. */
  identity: ReportFieldEntry[];
  summary: ReportFieldEntry[];
  /**
   * Facts about the report that are not numbers in a column — an empty period, a
   * period reaching into the future, people who resolved to nobody. Reported
   * rather than dropped: a file quietly covering four of five chosen people is
   * indistinguishable from one whose totals are simply low.
   */
  notes: string[];
  individuals: ReportTable;
  records: ReportTable;
  /** `Zovencia_Report_2026-08-16`, without an extension. */
  fileStem: string;
};

/** The heading every exported copy of a report carries. */
const DOCUMENT_TITLE = "Attendance, Absence & Leave Report";

/**
 * The filename an export downloads as, without its extension.
 *
 * The brand leads so a folder of these sorts together, and the dates are ISO so
 * they sort chronologically within it. A single day names itself once rather
 * than as "16 to 16".
 */
export function reportFileStem(period: ReportPeriod): string {
  const from = toIsoDate(period.from);
  const to = toIsoDate(period.to);

  return from === to
    ? `${BRAND_NAME}_Report_${from}`
    : `${BRAND_NAME}_Report_${from}_to_${to}`;
}

export function buildReportDocument(
  report: ReportResult,
  refinements: ReportRefinements,
): ReportDocument {
  const shows = (type: "ATTENDANCE" | "ABSENT" | "LEAVE") => report.recordTypes.includes(type);
  const described = describeReportRefinements(refinements);

  return {
    brand: BRAND_NAME,
    tagline: BRAND_TAGLINE,
    title: DOCUMENT_TITLE,
    periodLabel: report.periodLabel,
    generatedAt: formatDateTime(report.generatedAt),
    identity: [
      { label: "Period", value: report.periodLabel },
      { label: "People", value: describePeopleSelection(report.people, report.peopleCount) },
      { label: "Records", value: describeRecordTypes(report.recordTypes) },
      // Only when something is actually narrowing. A line reading "Filters: none"
      // is something to read past on every export for the sake of the few where
      // it says anything.
      ...(described.length > 0 ? [{ label: "Filters", value: described.join("; ") }] : []),
      { label: "Generated", value: formatDateTime(report.generatedAt) },
    ],
    summary: summaryEntries(report, shows),
    notes: notesFor(report),
    individuals: individualsTable(report.summaries, shows),
    records: recordsTable(report.rows, shows),
    fileStem: reportFileStem(report.period),
  };
}

type Shows = (type: "ATTENDANCE" | "ABSENT" | "LEAVE") => boolean;

/**
 * What the whole report adds up to.
 *
 * The coverage lines say **per person** out loud, because they are not sums: 22
 * working days is a property of the calendar, and adding it across eleven people
 * to report 242 is a number nobody asked for and everybody misreads.
 */
function summaryEntries(report: ReportResult, shows: Shows): ReportFieldEntry[] {
  const totals: ReportTotals = report.totals;

  return [
    { label: "Working days in period (per person)", value: String(report.coverage.workingDays) },
    { label: "Days off in period (per person)", value: String(report.coverage.daysOff) },
    { label: "Office closures in period", value: String(report.coverage.closedDays) },
    { label: "People covered", value: String(report.peopleCount) },
    { label: "Records", value: String(totals.records) },
    ...(shows("ATTENDANCE") ? [{ label: "Present days", value: String(totals.present) }] : []),
    ...(shows("ABSENT") ? [{ label: "Absent days", value: String(totals.absent) }] : []),
    ...(shows("LEAVE") ? [{ label: "Leave days", value: String(totals.onLeave) }] : []),
    ...(shows("ATTENDANCE")
      ? [
          // Named as a share of the present days rather than as a total beside
          // them, because it is one: somebody late was still there, and the two
          // added together would overshoot the headcount.
          { label: `Late arrivals (of ${totals.present} present)`, value: String(totals.late) },
          { label: "Total minutes late", value: String(totals.lateMinutes) },
        ]
      : []),
  ];
}

/** The findings that are not numbers in a column, in the words the screen uses. */
function notesFor(report: ReportResult): string[] {
  const notes: string[] = [];

  if (report.coverage.noRecordDays > 0) {
    notes.push(
      `${report.coverage.noRecordDays} working ${plural(report.coverage.noRecordDays, "day", "days")} in this period hold nothing at all — no check-ins and no leave for anybody in the company. Nobody is counted absent for them, and they appear in no record below.`,
    );
  }

  if (report.coverage.upcomingDays > 0) {
    notes.push(
      `This period reaches ${report.coverage.upcomingDays} working ${plural(report.coverage.upcomingDays, "day", "days")} that have not happened yet. Nobody can have missed them, so they are counted as neither present nor absent. Leave booked across them still appears.`,
    );
  }

  if (report.missingSelections.length > 0) {
    notes.push(
      `${report.missingSelections.length} of the people selected are no longer available to report on — their accounts may have been deleted, or they may not belong to the population this report covers. They are not included.`,
    );
  }

  return notes;
}

function individualsTable(summaries: ReportPersonSummary[], shows: Shows): ReportTable {
  const columns: ReportColumn[] = [
    { header: "Name", align: "left", width: 24 },
    { header: "Email", align: "left", width: 28 },
    { header: "Role", align: "left", width: 15 },
    { header: "Department", align: "left", width: 18 },
    { header: "Working days", align: "right", width: 13 },
    { header: "Days off", align: "right", width: 10 },
    ...(shows("ATTENDANCE") ? [right("Present", 10)] : []),
    ...(shows("ABSENT") ? [right("Absent", 10)] : []),
    ...(shows("LEAVE") ? [right("Leave", 10)] : []),
    ...(shows("ATTENDANCE") ? [right("Late", 8), right("Minutes late", 13)] : []),
    { header: "Joined during period", align: "left", width: 20 },
  ];

  return {
    title: "Individual summary",
    columns,
    rows: summaries.map((summary) => [
      summary.employee.name,
      summary.employee.email,
      roleLabel(summary.employee.role),
      summary.employee.department ?? "",
      String(summary.coverage.workingDays),
      String(summary.coverage.daysOff),
      ...(shows("ATTENDANCE") ? [String(summary.totals.present)] : []),
      ...(shows("ABSENT") ? [String(summary.totals.absent)] : []),
      ...(shows("LEAVE") ? [String(summary.totals.onLeave)] : []),
      ...(shows("ATTENDANCE")
        ? [String(summary.totals.late), String(summary.totals.lateMinutes)]
        : []),
      // Reported, never acted on — `describeDay` takes no notice of when somebody
      // started, so a day before their first one reads exactly as it does on the
      // attendance roster. Naming the date lets a reader account for a short
      // first month rather than reading it as absence.
      summary.joinedDuringPeriod ? toIsoDate(summary.joinedDuringPeriod) : "",
    ]),
    emptyNote: "This report covers nobody. The selection matched no accounts.",
  };
}

function recordsTable(rows: ReportRow[], shows: Shows): ReportTable {
  const columns: ReportColumn[] = [
    { header: "Date", align: "left", width: 12 },
    { header: "Name", align: "left", width: 24 },
    { header: "Email", align: "left", width: 28 },
    { header: "Role", align: "left", width: 15 },
    { header: "Department", align: "left", width: 18 },
    { header: "Record type", align: "left", width: 13 },
    { header: "Status", align: "left", width: 12 },
    ...(shows("ATTENDANCE")
      ? [
          { header: "Check-in", align: "left" as const, width: 11 },
          right("Late (minutes)", 14),
          // The deadline as well as the figure, because a file outlives the
          // setting: "15" alone becomes unreadable the day somebody moves the
          // cutoff, and this is the column an argument about timekeeping is had
          // over.
          { header: "Late measured from", align: "left" as const, width: 18 },
          right("Distance", 11),
          // A hand-recorded day stays distinguishable from a proved one here
          // above all, since this is the copy that gets archived — the geofence
          // is the whole difference, and a blank distance with a name beside it
          // is what says which happened.
          { header: "Recorded by", align: "left" as const, width: 20 },
          { header: "Recorded reason", align: "left" as const, width: 30 },
        ]
      : []),
    ...(shows("LEAVE")
      ? [
          { header: "Leave status", align: "left" as const, width: 13 },
          { header: "Leave reason", align: "left" as const, width: 30 },
        ]
      : []),
  ];

  return {
    title: "Detailed records",
    columns,
    rows: rows.map((row) => [
      toIsoDate(row.date),
      row.name,
      row.email,
      roleLabel(row.role),
      row.department ?? "",
      // In the words the screen uses, not the enum values behind them: an
      // exported file is read by whoever it is mailed to, and `ON_LEAVE` beside
      // a screen saying "On leave" is one report described twice.
      recordTypeLabel(row.recordType),
      dayStatusLabel(row.status),
      ...(shows("ATTENDANCE")
        ? [
            // The arrival time on the company's clock, not a UTC instant: this
            // file is read by people who were in that office, and a timestamp
            // five hours off is the sort of thing that gets argued about rather
            // than noticed.
            row.checkInAt ? formatTimeInAppZone(row.checkInAt) : "",
            row.checkInAt ? String(row.lateMinutes) : "",
            row.lateBasisMinutes !== null ? friendlyTimeLabel(row.lateBasisMinutes) : "",
            // Never a fabricated zero — a null distance means nobody measured
            // one, and `Recorded by` beside it is what happened instead.
            row.distanceMeters !== null ? formatDistance(row.distanceMeters) : "",
            row.markedBy?.name ?? "",
            row.markedReason ?? "",
          ]
        : []),
      ...(shows("LEAVE") ? [row.leaveStatus ?? "", row.leaveReason ?? ""] : []),
    ]),
    emptyNote:
      "Nothing was recorded for the people and period chosen. The days may all be closures or weekly days off, the period may not have happened yet, or these people may simply have nothing on record for it.",
  };
}

/** A right-aligned column, which is every column holding a number. */
function right(header: string, width: number): ReportColumn {
  return { header, align: "right", width };
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
