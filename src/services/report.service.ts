import { EmployeeStatus, type LeaveStatus, type Role } from "@prisma/client";

import { toIsoDate } from "@/lib/date";
import { rolesInPopulation, ROLE } from "@/lib/enums";
import { ValidationError } from "@/lib/errors";
import { describeReportPeriod, type ReportPeriod } from "@/lib/report-period";
import {
  employeeRepository,
  type ReportSubject,
} from "@/repositories/employee.repository";
import { leaveRepository, type LeaveDto } from "@/repositories/leave.repository";
import type { AttendanceDto } from "@/repositories/attendance.repository";
import {
  attendanceService,
  lateMinutesOf,
  type AttendanceDayStatus,
  type DayRecord,
} from "@/services/attendance.service";
import { populationService, type PopulationActor } from "@/services/population.service";
import {
  isExplicitSelection,
  type PeopleSelection,
  type ReportPeopleQuery,
  type ReportRecordType,
  type ReportRequest,
} from "@/validations/report.schema";

/**
 * The workforce report: attendance, absence and leave over a period, for people
 * an administrator chooses.
 *
 * **It owns no facts.** Every date it judges comes back from
 * `attendanceService.historiesFor`, which is `describeDay` — the same rule the
 * attendance roster, the warning sweep and the assistant are decided by. A
 * closure, the working week, approved leave, the future and `NO_RECORD` are all
 * honoured here for free rather than re-derived, and lateness is
 * `lateMinutesOf` reading the basis frozen on each row. A second opinion about
 * what a day meant is the one thing a reporting feature must not introduce: it
 * would be wrong in a spreadsheet somebody archives and mails around, where
 * nothing can be checked against the screen that disagreed with it.
 *
 * So what this service actually does is narrower than it looks — it decides
 * **who** the report is about, **which** of those days are records worth
 * printing, and **what they add up to**. Nothing else.
 */

/** One line of a report: one person, one date, one thing that happened. */
export type ReportRow = {
  date: Date;
  employeeId: string;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  position: string | null;
  recordType: ReportRecordType;
  /** The roster's own verdict, unchanged — `PRESENT`, `ABSENT` or `ON_LEAVE`. */
  status: AttendanceDayStatus;
  checkInAt: Date | null;
  lateMinutes: number;
  /** The deadline this day was judged against, so a stored figure stays readable. */
  lateBasisMinutes: number | null;
  distanceMeters: number | null;
  /** Who vouched for the day when the geofence did not — null on a real check-in. */
  markedBy: { id: string; name: string } | null;
  markedAt: Date | null;
  /** Why an administrator recorded it by hand. */
  markedReason: string | null;
  /**
   * The leave held on this date, if any — carried on **every** row rather than
   * only on leave rows. A day holding both a check-in and approved leave is one
   * record, not two (see `rowsFor`), and it reads `PRESENT`; without this the
   * leave would simply vanish from the report rather than sitting beside the
   * attendance that outranked it.
   */
  leaveStatus: LeaveStatus | null;
  leaveReason: string | null;
};

/** What a set of rows adds up to. Counted off the rows, never tracked beside them. */
export type ReportTotals = {
  records: number;
  present: number;
  absent: number;
  onLeave: number;
  /** Present, and past the deadline. A **subset of `present`** — see the roster. */
  late: number;
  lateMinutes: number;
};

/**
 * Facts about the period itself, true of everybody in it.
 *
 * Kept apart from `ReportTotals` because they are not sums. "22 working days" is
 * a property of the calendar; adding it up across eleven people to report 242
 * would be a number nobody asked for and everybody would misread. The per-person
 * summaries carry their own copy for the same reason — a person the report
 * covers has 22 working days, not a share of 242.
 */
export type ReportCoverage = {
  calendarDays: number;
  /** Days the ordinary week works and no closure took away. */
  workingDays: number;
  /** Weekly days off and declared closures together. */
  daysOff: number;
  /** Of `daysOff`, the ones a declared closure accounts for. */
  closedDays: number;
  /**
   * Working days on which the system holds nothing for anybody.
   *
   * Reported rather than hidden: after a reset these are what an empty period
   * looks like, and a report that showed zero absences without saying why would
   * read as a clean month. Nobody is accused for them — see `dayHoldsRecord`.
   */
  noRecordDays: number;
  /** Working days still to come, which nobody can yet have missed. */
  upcomingDays: number;
};

/** One person's section of the report. */
export type ReportPersonSummary = {
  employee: {
    id: string;
    name: string;
    email: string;
    role: Role;
    status: EmployeeStatus;
    department: string | null;
    position: string | null;
    profilePhoto: string | null;
  };
  totals: ReportTotals;
  coverage: ReportCoverage;
  /**
   * Their joining date, when it falls inside the period.
   *
   * Surfaced rather than acted on. `describeDay` takes no notice of when
   * somebody started, so a day before their first one reads exactly as it does
   * on the attendance roster — and quietly reclassifying it here would be this
   * service forming an opinion about a date, which is the one thing it must not
   * do. Naming the date lets the screen mark the section instead, which is what
   * an administrator reading a short first month actually needs.
   */
  joinedDuringPeriod: Date | null;
};

export type ReportResult = {
  period: ReportPeriod;
  periodLabel: string;
  people: PeopleSelection;
  recordTypes: ReportRecordType[];
  /** When this was generated, for the header of anything printed or exported. */
  generatedAt: Date;
  coverage: ReportCoverage;
  totals: ReportTotals;
  peopleCount: number;
  summaries: ReportPersonSummary[];
  rows: ReportRow[];
  /** Rows matching the report before paging — what `totals` describes. */
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /**
   * Ids that were asked for and resolved to nobody.
   *
   * Reported rather than ignored: an id that names a deleted account, or one
   * outside the population being asked about, would otherwise leave a report
   * quietly covering four people when five were chosen — and a total that is
   * short by one person is indistinguishable from a total that is simply low.
   */
  missingSelections: string[];
};

/** One candidate in the people picker. */
export type ReportPerson = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: EmployeeStatus;
  department: string | null;
  position: string | null;
};

/**
 * Standing a bulk selection admits: the office as it stands.
 *
 * The same rule `listAttendanceRoster` applies, deliberately — "all employees"
 * has to mean the same set of people on this screen as on the one beside it.
 */
const BULK_STATUSES: EmployeeStatus[] = [EmployeeStatus.ACTIVE];

/**
 * Standing a named selection admits.
 *
 * Wider than the bulk one on purpose. Naming somebody is an explicit instruction
 * about them, and their history did not stop existing when their account was
 * suspended — an administrator asking what a suspended employee's last month
 * looked like is asking a real question with a real answer. `PENDING_APPROVAL`
 * and `REJECTED` are absent because those accounts were never part of the
 * office, so there is nothing about them to report.
 */
const NAMED_STATUSES: EmployeeStatus[] = [EmployeeStatus.ACTIVE, EmployeeStatus.SUSPENDED];

/** Which roles a people selection covers. */
function rolesFor(selection: PeopleSelection): Role[] | undefined {
  switch (selection) {
    case "SELECTED_EMPLOYEES":
    case "ALL_EMPLOYEES":
      return rolesInPopulation(ROLE.EMPLOYEE);

    // Both administrator roles, because `rolesInPopulation` counts the owner as
    // an administrator in every *report* — an account in neither population
    // would vanish from its own organisation's figures, its leave counted
    // nowhere and its attendance in no tile. This is that rule, not an exception
    // to it. Nothing here can act on the owner: the report reads.
    case "SELECTED_ADMINS":
    case "ALL_ADMINS":
      return rolesInPopulation(ROLE.ADMIN);

    // Undefined rather than both lists concatenated: "everyone" is the absence
    // of a role filter, and spelling it out is how a fourth role added later
    // would silently drop out of the organisation-wide report.
    case "EVERYONE":
      return undefined;
  }
}

/**
 * Who the report is about.
 *
 * The one place a selection becomes people, so the picker, the summaries and the
 * row set cannot disagree about the set. A named selection is resolved **by id
 * within the roles it claims**, which is what stops `SELECTED_EMPLOYEES`
 * carrying an administrator's id and reporting on them under a heading that says
 * otherwise — the id is re-checked against the population rather than trusted
 * for having arrived in that field.
 */
async function resolveSubjects(
  selection: PeopleSelection,
  selectedUserIds: string[],
): Promise<{ subjects: ReportSubject[]; missing: string[] }> {
  const roles = rolesFor(selection);

  if (!isExplicitSelection(selection)) {
    return { subjects: await employeeRepository.listReportSubjects({ statuses: BULK_STATUSES, roles }), missing: [] };
  }

  const ids = [...new Set(selectedUserIds)];

  if (ids.length === 0) {
    throw new ValidationError("Choose the people this report is about.", {
      selectedUserIds: "Select at least one person, or report on everybody.",
    });
  }

  const subjects = await employeeRepository.listReportSubjects({
    statuses: NAMED_STATUSES,
    roles,
    ids,
  });

  const found = new Set(subjects.map((subject) => subject.id));

  return { subjects, missing: ids.filter((id) => !found.has(id)) };
}

/**
 * Which record type a day's verdict amounts to, or nothing at all.
 *
 * The whole mapping between what the roster decides and what a report prints,
 * and it is deliberately partial. `CLOSED`, `NON_WORKING`, `NO_RECORD` and
 * `UPCOMING` return null because none of them is a record: they are the absence
 * of one, stated precisely, and printing a row for each would fill an absence
 * report for August with weekends. They are counted in `ReportCoverage` instead,
 * where they belong — the office being shut is a fact about the period.
 */
function recordTypeOf(status: AttendanceDayStatus): ReportRecordType | null {
  switch (status) {
    case "PRESENT":
      return "ATTENDANCE";
    case "ABSENT":
      return "ABSENT";
    case "ON_LEAVE":
      return "LEAVE";
    default:
      return null;
  }
}

/** What a person's days come to, before any record-type filter is applied. */
function coverageOf(days: DayRecord[]): ReportCoverage {
  const count = (predicate: (status: AttendanceDayStatus) => boolean) =>
    days.filter((day) => predicate(day.status)).length;

  const closedDays = count((status) => status === "CLOSED");
  const weeklyOff = count((status) => status === "NON_WORKING");

  return {
    calendarDays: days.length,
    workingDays: days.length - closedDays - weeklyOff,
    daysOff: closedDays + weeklyOff,
    closedDays,
    noRecordDays: count((status) => status === "NO_RECORD"),
    upcomingDays: count((status) => status === "UPCOMING"),
  };
}

/** What a set of rows comes to. Counted off the rows so nothing can drift. */
function totalsOf(rows: ReportRow[]): ReportTotals {
  return {
    records: rows.length,
    present: rows.filter((row) => row.status === "PRESENT").length,
    absent: rows.filter((row) => row.status === "ABSENT").length,
    onLeave: rows.filter((row) => row.status === "ON_LEAVE").length,
    late: rows.filter((row) => row.lateMinutes > 0).length,
    lateMinutes: rows.reduce((sum, row) => sum + row.lateMinutes, 0),
  };
}

/**
 * One person's days, turned into the rows a report prints.
 *
 * **Exactly one row per person per day, and never two.** That is what makes
 * selecting every record type impossible to double-count: the row's type comes
 * from the day's single verdict, so a day cannot be both an attendance record
 * and a leave record however many boxes are ticked. Where a date holds a
 * check-in *and* approved leave the roster ranks the check-in first — it is the
 * stronger evidence — so the row reads `PRESENT`, and the leave rides along on
 * `leaveStatus`/`leaveReason` rather than being lost or printed twice.
 */
function rowsFor(
  subject: ReportSubject,
  days: DayRecord[],
  leavesByDate: Map<string, LeaveDto>,
  recordTypes: Set<ReportRecordType>,
): ReportRow[] {
  const rows: ReportRow[] = [];

  for (const day of days) {
    const recordType = recordTypeOf(day.status);
    if (!recordType || !recordTypes.has(recordType)) continue;

    const leave = leavesByDate.get(toIsoDate(day.date)) ?? null;
    const attendance: AttendanceDto | null = day.attendance;

    rows.push({
      date: day.date,
      employeeId: subject.id,
      name: subject.name,
      email: subject.email,
      role: subject.role,
      department: subject.department,
      position: subject.position,
      recordType,
      status: day.status,
      checkInAt: attendance?.checkInAt ?? null,
      // Computed by the one function that turns a row into minutes, so the
      // report, the roster, the CSV and the assistant cannot arrive at different
      // answers about the same morning.
      lateMinutes: lateMinutesOf(attendance),
      lateBasisMinutes: attendance?.lateBasisMinutes ?? null,
      distanceMeters: attendance?.distanceMeters ?? null,
      markedBy: attendance?.markedBy ?? null,
      markedAt: attendance?.markedAt ?? null,
      markedReason: attendance?.reason ?? null,
      leaveStatus: leave?.status ?? null,
      leaveReason: leave?.reason ?? null,
    });
  }

  return rows;
}

/**
 * The in-report narrowing: search, role and status.
 *
 * Applied on the server over the whole row set rather than in the browser over
 * the page in front of somebody, which is the difference between "no matches"
 * meaning *nobody matches* and meaning *nobody on page one matches*.
 *
 * `LATE` is not a status and is not treated as one: it narrows within `PRESENT`
 * to the rows past the deadline, exactly as it does on the attendance roster.
 */
function refine(rows: ReportRow[], request: ReportRequest): ReportRow[] {
  const term = request.search?.toLowerCase();

  return rows.filter((row) => {
    if (request.role !== "ALL" && !rolesInPopulation(request.role).includes(row.role)) return false;

    if (request.status === "LATE") {
      if (row.status !== "PRESENT" || row.lateMinutes <= 0) return false;
    } else if (request.status !== "ALL" && row.status !== request.status) {
      return false;
    }

    if (term && !`${row.name} ${row.email}`.toLowerCase().includes(term)) return false;

    return true;
  });
}

export const reportService = {
  /**
   * Generates a report, and everything in it.
   *
   * The whole thing is assembled and summarised in memory and only then paged,
   * which is the same trade `attendanceService.roster` makes and for the same
   * reason: the thing a row is filtered on — its record type — **does not exist
   * in the database to filter by**. It is derived per person per day from four
   * tables and the working week. Paging in SQL first would return a page of
   * whoever sorted first and then discard most of it, so "the absences in
   * August" would come back holding three rows and a promise that there were
   * more. The bound that makes this safe is `MAX_REPORT_RANGE_DAYS` on one axis
   * and `MAX_SELECTED_PEOPLE` on the other; the queries behind it are six bulk
   * reads regardless of how many people are named.
   *
   * Every number returned describes **the rows the report currently holds** —
   * the record types chosen, then the search, role and status narrowing on top.
   * One rule for the whole payload, so the summary, the individual sections, the
   * table and the export cannot say different things about one report.
   * `coverage` is the exception that proves it: the calendar does not narrow
   * when somebody types a name into a search box.
   */
  async generate(actor: PopulationActor, request: ReportRequest): Promise<ReportResult> {
    // First, and before a single record is read. A refusal that arrives after
    // the query is a refusal that already did the work.
    await populationService.assertMayReport(actor);

    const { period, recordTypes } = request;
    const { subjects, missing } = await resolveSubjects(request.people, request.selectedUserIds);

    const ids = subjects.map((subject) => subject.id);

    const [histories, leaves] = await Promise.all([
      attendanceService.historiesFor(ids, period.from, period.to),
      leaveRepository.listForEmployeesBetween(ids, period.from, period.to),
    ]);

    // Keyed by person and date so a row can be found without scanning, and
    // last-write-wins on the impossible duplicate: `bookLeave` writes one row per
    // person per day, and a report is not the place to discover otherwise.
    const leavesByPerson = new Map<string, Map<string, LeaveDto>>();

    for (const leave of leaves) {
      const forPerson = leavesByPerson.get(leave.employeeId) ?? new Map<string, LeaveDto>();
      forPerson.set(toIsoDate(leave.leaveDate), leave);
      leavesByPerson.set(leave.employeeId, forPerson);
    }

    const wanted = new Set(recordTypes);
    const noLeave = new Map<string, LeaveDto>();

    const sections = subjects.map((subject) => {
      const days = histories.get(subject.id) ?? [];
      const rows = rowsFor(subject, days, leavesByPerson.get(subject.id) ?? noLeave, wanted);

      return { subject, days, rows };
    });

    // The narrowing is applied per person so a section that loses every row can
    // be dropped whole — an individual summary reading nothing but zeroes for
    // somebody the search excluded is noise, not a finding.
    const refinedSections = sections
      .map((section) => ({ ...section, rows: refine(section.rows, request) }))
      .filter((section) => section.rows.length > 0 || !isNarrowed(request));

    const summaries: ReportPersonSummary[] = refinedSections.map(({ subject, days, rows }) => ({
      employee: {
        id: subject.id,
        name: subject.name,
        email: subject.email,
        role: subject.role,
        status: subject.status,
        department: subject.department,
        position: subject.position,
        profilePhoto: subject.profilePhoto,
      },
      totals: totalsOf(rows),
      coverage: coverageOf(days),
      joinedDuringPeriod: joiningInside(subject.joiningDate, period),
    }));

    // Sorted by date first and then by name: a report is read as a diary of the
    // period, not as a list of people who each happen to have days. One person
    // reads as their own history either way, since every row shares their name.
    const rows = refinedSections
      .flatMap((section) => section.rows)
      .sort(
        (a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name),
      );

    const totalRows = rows.length;
    const start = (request.page - 1) * request.pageSize;

    return {
      period,
      periodLabel: describeReportPeriod(period),
      people: request.people,
      recordTypes,
      generatedAt: new Date(),
      // The calendar, taken from the first person's day walk — every person in
      // one report walks the same dates, so any of them answers, and asking one
      // avoids summing a fact that is not a sum. An empty selection still has to
      // describe its period, which is what the fallback is for.
      coverage: sections[0] ? coverageOf(sections[0].days) : emptyCoverage(period),
      totals: totalsOf(rows),
      peopleCount: summaries.length,
      summaries,
      rows: rows.slice(start, start + request.pageSize),
      totalRows,
      page: request.page,
      pageSize: request.pageSize,
      totalPages: Math.max(1, Math.ceil(totalRows / request.pageSize)),
      missingSelections: missing,
    };
  },

  /**
   * Every row of a report, unpaged — what the export writes.
   *
   * Deliberately the *same* call with the page size opened up rather than a
   * second path: an export of "page one of the report" is not what anybody means
   * by exporting a report, and an export assembled by different code is the one
   * that comes to disagree with the screen it was taken from.
   */
  async generateAll(actor: PopulationActor, request: ReportRequest): Promise<ReportResult> {
    return this.generate(actor, { ...request, page: 1, pageSize: Number.MAX_SAFE_INTEGER });
  },

  /**
   * People a report may be pointed at.
   *
   * Behind the same assert as the report itself, because the list says what
   * everybody is — that is the whole thing `canViewAdminRecords` gates, and a
   * picker open to anybody would hand it over without a report ever being run.
   *
   * It offers accounts that have been part of the office, active or suspended,
   * matching what a named selection will accept. Offering somebody the report
   * would then leave out is the failure worth avoiding here.
   */
  async people(actor: PopulationActor, query: ReportPeopleQuery): Promise<ReportPerson[]> {
    await populationService.assertMayReport(actor);

    const subjects = await employeeRepository.listReportSubjects({
      statuses: NAMED_STATUSES,
      roles: query.population === "ALL" ? undefined : rolesInPopulation(query.population),
      search: query.search,
      limit: query.limit,
    });

    return subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      email: subject.email,
      role: subject.role,
      status: subject.status,
      department: subject.department,
      position: subject.position,
    }));
  },
};

/** Whether anything beyond the record types is narrowing the report. */
function isNarrowed(request: ReportRequest): boolean {
  return Boolean(request.search) || request.role !== "ALL" || request.status !== "ALL";
}

/** Their joining date, when the period actually contains it. */
function joiningInside(joiningDate: Date | null, period: ReportPeriod): Date | null {
  if (!joiningDate) return null;

  const joined = toIsoDate(joiningDate);
  return joined >= toIsoDate(period.from) && joined <= toIsoDate(period.to) ? joiningDate : null;
}

/**
 * The period as it stands with nobody in it.
 *
 * A report covering no people still covers a stretch of calendar, and saying
 * "0 working days" about August would be a second falsehood on top of the empty
 * result. The working week and closures are not consulted, because there is
 * nobody to have worked them — every field beyond the day count is left at zero
 * and the screen says the selection matched nobody, which is the actual finding.
 */
function emptyCoverage(period: ReportPeriod): ReportCoverage {
  const calendarDays =
    Math.round((period.to.getTime() - period.from.getTime()) / 86_400_000) + 1;

  return {
    calendarDays,
    workingDays: 0,
    daysOff: 0,
    closedDays: 0,
    noRecordDays: 0,
    upcomingDays: 0,
  };
}
