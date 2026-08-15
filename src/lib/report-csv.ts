/**
 * A report, as a spreadsheet.
 *
 * Pure, and free of Prisma and of Next: it takes a report that has already been
 * generated and returns rows of strings, so it can be driven with a real report
 * and read on its own — the same shape `report-period.ts` and `report-labels.ts`
 * beside it take. The route is left holding the two things only a route can do,
 * which are the guard and the response.
 *
 * **It never recomputes anything.** Every figure written out is one the service
 * put on the report; a formatter that added its own arithmetic would be a second
 * answer landing in the copy that gets archived, where nothing can be checked
 * against the screen it came from.
 */
import { friendlyTimeLabel } from "@/lib/attendance-policy";
import { formatDateTime, formatTimeInAppZone, toIsoDate } from "@/lib/date";
import { formatDistance } from "@/lib/geo";
import {
  describePeopleSelection,
  describeRecordTypes,
  describeReportRefinements,
} from "@/lib/report-labels";
import type { ReportResult, ReportRow, ReportTotals } from "@/services/report.service";

/** What is narrowing the report beyond its period, people and record types. */
export type ReportCsvRefinements = Parameters<typeof describeReportRefinements>[0];

/**
 * The whole file: an identifying header, the overall summary, one line per
 * person, then the records.
 *
 * It leads with the report's identity because a CSV outlives the screen — a bare
 * grid of dates cannot say what question it answered, and this is the copy that
 * gets mailed around and filed.
 */
export function reportToCsvRows(
  report: ReportResult,
  organisation: string,
  refinements: ReportCsvRefinements,
): string[][] {
  const described = describeReportRefinements(refinements);

  return [
    [organisation.toUpperCase()],
    ["Attendance, absence and leave report"],
    [],
    ["Period", report.periodLabel],
    ["People", describePeopleSelection(report.people, report.peopleCount)],
    ["Records", describeRecordTypes(report.recordTypes)],
    // Only when something is actually narrowing. A line reading "Filters: none"
    // is something to read past on every export for the sake of the few where it
    // says anything.
    ...(described.length > 0 ? [["Filters", described.join("; ")]] : []),
    ["Generated", formatDateTime(report.generatedAt)],
    [],

    ["OVERALL SUMMARY"],
    // Labelled "per person" because it is not a sum: 22 working days is a
    // property of the calendar, and adding it across eleven people to report 242
    // is a number nobody asked for and everybody misreads.
    ["Working days in period (per person)", String(report.coverage.workingDays)],
    ["Days off in period (per person)", String(report.coverage.daysOff)],
    ["Office closures in period", String(report.coverage.closedDays)],
    ["People covered", String(report.peopleCount)],
    ...totalsRows(report.totals),
    [],

    ["INDIVIDUAL SUMMARIES"],
    [
      "Name",
      "Email",
      "Role",
      "Department",
      "Working days",
      "Days off",
      "Present",
      "Absent",
      "Leave",
      "Late",
      "Minutes late",
      "Joined during period",
    ],
    ...report.summaries.map((summary) => [
      summary.employee.name,
      summary.employee.email,
      summary.employee.role,
      summary.employee.department ?? "",
      String(summary.coverage.workingDays),
      String(summary.coverage.daysOff),
      String(summary.totals.present),
      String(summary.totals.absent),
      String(summary.totals.onLeave),
      String(summary.totals.late),
      String(summary.totals.lateMinutes),
      summary.joinedDuringPeriod ? toIsoDate(summary.joinedDuringPeriod) : "",
    ]),
    [],

    ["DETAILED RECORDS"],
    [
      "Date",
      "Name",
      "Email",
      "Role",
      "Department",
      "Record type",
      "Status",
      "Check-in",
      "Late (minutes)",
      // The deadline as well as the figure, because a spreadsheet outlives the
      // setting: "15" alone becomes unreadable the day somebody moves the
      // cutoff, and this is the column an argument about timekeeping is had
      // over. The attendance export already follows the same reasoning.
      "Late measured from",
      "Distance",
      // A hand-recorded day stays distinguishable from a proved one here above
      // all, since this is the copy that gets archived — the geofence is the
      // whole difference, and a blank distance with a name beside it is what
      // says which happened.
      "Recorded by",
      "Recorded reason",
      "Leave status",
      "Leave reason",
    ],
    ...report.rows.map(detailRow),
  ];
}

/**
 * The totals, written as label/value pairs rather than as a header and a row.
 *
 * A summary block read by a person, not a table read by a machine: pairs stay
 * legible when a line is added and do not have to be scrolled sideways to match
 * a number to its name.
 */
function totalsRows(totals: ReportTotals): string[][] {
  return [
    ["Records", String(totals.records)],
    ["Present days", String(totals.present)],
    ["Absent days", String(totals.absent)],
    ["Leave days", String(totals.onLeave)],
    ["Late arrivals", String(totals.late)],
    ["Total minutes late", String(totals.lateMinutes)],
  ];
}

function detailRow(row: ReportRow): string[] {
  return [
    toIsoDate(row.date),
    row.name,
    row.email,
    row.role,
    row.department ?? "",
    row.recordType,
    row.status,
    // The arrival time on the company's clock, not a UTC instant: this file is
    // read by people who were in that office, and a timestamp five hours off is
    // the sort of thing that gets argued about rather than noticed.
    row.checkInAt ? formatTimeInAppZone(row.checkInAt) : "",
    row.checkInAt ? String(row.lateMinutes) : "",
    row.lateBasisMinutes !== null ? friendlyTimeLabel(row.lateBasisMinutes) : "",
    // Never a fabricated zero — a null distance means nobody measured one, and
    // `Recorded by` beside it is what happened instead.
    row.distanceMeters !== null ? formatDistance(row.distanceMeters) : "",
    row.markedBy?.name ?? "",
    row.markedReason ?? "",
    row.leaveStatus ?? "",
    row.leaveReason ?? "",
  ];
}

/** The organisation's name, as a filename can carry it. */
export function organisationSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
}
