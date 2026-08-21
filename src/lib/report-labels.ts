/**
 * How a report describes itself.
 *
 * One wording, shared by the three surfaces that state what a report covers: the
 * banner above the table, the printed page, and the header block of the exported
 * spreadsheet. They are the same claim about the same report, and a file
 * archived saying "Selected employees" beside a screen that said "4 people" is
 * how two copies of one report come to be argued over.
 *
 * Free of Prisma and of React so it can be read on its own, exactly as
 * `report-period.ts` beside it is, and imported by both a route handler and a
 * client component without either pulling in the other's world.
 */
import type { PeopleSelection, ReportRecordType } from "@/validations/report.schema";

const PEOPLE_LABELS: Record<PeopleSelection, string> = {
  SELECTED_EMPLOYEES: "Selected employees",
  SELECTED_ADMINS: "Selected administrators",
  ALL_EMPLOYEES: "All employees",
  ALL_ADMINS: "All administrators",
  EVERYONE: "Everyone",
};

const RECORD_TYPE_LABELS: Record<ReportRecordType, string> = {
  ATTENDANCE: "Attendance",
  ABSENT: "Absent",
  LEAVE: "Leave",
  REMOTE: "Remote",
};

/** "All employees", or "Selected employees (4)" once a report has resolved them. */
export function describePeopleSelection(selection: PeopleSelection, count?: number): string {
  const label = PEOPLE_LABELS[selection];
  return count === undefined ? label : `${label} — ${count} ${count === 1 ? "person" : "people"}`;
}

export function peopleSelectionLabel(selection: PeopleSelection): string {
  return PEOPLE_LABELS[selection];
}

export function recordTypeLabel(type: ReportRecordType): string {
  return RECORD_TYPE_LABELS[type];
}

/**
 * A role, as the screens say it.
 *
 * Here rather than as a ternary at each call site, because the exports need it
 * too and `SUPER_ADMIN` printed raw into a document somebody circulates is
 * jargon leaking out of a schema.
 */
export function roleLabel(role: string): string {
  if (role === "EMPLOYEE") return "Employee";
  if (role === "ADMIN") return "Administrator";
  return "Super admin";
}

/**
 * A day's verdict, in the one wording every surface uses.
 *
 * **All eight**, and `AttendanceStatusBadge` reads them from here rather than
 * keeping its own copy — a spreadsheet reading `ON_LEAVE` beside a screen
 * reading "On leave" is the same day described twice, and the badge and the
 * calendar cell beside it saying different words about one date is the same
 * mistake one level down.
 *
 * The exports only ever reach four of them: `recordTypeOf` maps closures, weekly
 * days off, empty days and the future to nothing, because each is the *absence*
 * of a record and is counted in the coverage instead. The calendar reaches all
 * eight, because a month with the weekends missing is not a month.
 */
export const DAY_STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  ON_LEAVE: "On leave",
  // The word §19 asks an export to print for these days. A file archived and
  // mailed around reading "Absent" for a day somebody worked from home is the
  // exact mistake this feature exists to stop, and unlike a screen there is
  // nothing beside it to check against.
  REMOTE: "Remote",
  CLOSED: "Office closed",
  NON_WORKING: "Non-working day",
  NO_RECORD: "No record",
  UPCOMING: "Not yet",
};

export function dayStatusLabel(status: string): string {
  return DAY_STATUS_LABELS[status] ?? status;
}

/**
 * An attendance rate, as every surface says it.
 *
 * One rounding, shared by the tile on the screen and the summary line in the
 * PDF, the workbook and the CSV — a report reading 87.5% beside a file reading
 * 88% is the same figure described twice, and the file is the copy that gets
 * archived. One decimal place, because a whole number hides the difference
 * between 16 of 17 and 17 of 18 on the short periods this screen is most often
 * read over.
 *
 * **Null is not zero.** A period with no attendance-eligible days in it — a week
 * of closures, somebody remote throughout — has no rate, and printing "0%" would
 * be a verdict on somebody for a calendar they had no part in.
 */
export function formatAttendanceRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 1000) / 10}%`;
}

/**
 * "All", or the chosen types in a fixed order.
 *
 * The complete set reads as **All** rather than as three names, which is the
 * screen's own rule turned into a sentence: there is no `ALL` value to send, so
 * having all three chosen is the only way to mean it, and the label is where
 * that becomes visible. The order is the declaration order rather than the order
 * somebody clicked, so two reports over the same records describe themselves
 * identically.
 */
export function describeRecordTypes(types: readonly ReportRecordType[]): string {
  const chosen = (Object.keys(RECORD_TYPE_LABELS) as ReportRecordType[]).filter((type) =>
    types.includes(type),
  );

  if (chosen.length === 0) return "None";
  if (chosen.length === Object.keys(RECORD_TYPE_LABELS).length) return "All";

  return chosen.map(recordTypeLabel).join(" + ");
}

/** The status filter, in the words the screen offers it in. */
const STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present",
  LATE: "Late",
  ABSENT: "Absent",
  ON_LEAVE: "On leave",
  REMOTE: "Remote",
};

/**
 * What is narrowing a report beyond its period, people and record types.
 *
 * Returned as a list rather than a sentence so a caller can render it as chips
 * or join it, and **empty when nothing is narrowing** — which is what lets the
 * export leave the line out entirely rather than print "Filters: none" on every
 * file for the sake of the few where it says something.
 */
export function describeReportRefinements(refinements: {
  search?: string;
  role: "ALL" | "EMPLOYEE" | "ADMIN";
  status: "ALL" | "PRESENT" | "LATE" | "ABSENT" | "ON_LEAVE" | "REMOTE";
}): string[] {
  const described: string[] = [];

  if (refinements.search) described.push(`Search: "${refinements.search}"`);
  if (refinements.role !== "ALL") {
    described.push(`Role: ${refinements.role === "ADMIN" ? "Administrators" : "Employees"}`);
  }
  if (refinements.status !== "ALL") {
    described.push(`Status: ${STATUS_LABELS[refinements.status] ?? refinements.status}`);
  }

  return described;
}
