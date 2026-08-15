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
  status: "ALL" | "PRESENT" | "LATE" | "ABSENT" | "ON_LEAVE";
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
