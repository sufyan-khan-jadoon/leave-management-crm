import { z } from "zod";

import {
  MAX_MONTH,
  MAX_REPORT_RANGE_DAYS,
  MAX_REPORT_YEAR,
  MIN_MONTH,
  MIN_REPORT_YEAR,
  isReportableRange,
  monthlyRange,
  type ReportPeriod,
} from "@/lib/report-period";
import { calendarDateSchema } from "@/validations/holiday.schema";

/**
 * How many people one report may name explicitly.
 *
 * A bound on the *selection*, not on the report: `ALL_EMPLOYEES` and `EVERYONE`
 * are unbounded by construction, because they are a description of the
 * organisation rather than a list somebody typed. This exists so a hand-written
 * request cannot post ten thousand ids and have the server expand them into a
 * row set it then has to hold. Anybody genuinely reporting on more than this
 * wants one of the bulk selections.
 */
export const MAX_SELECTED_PEOPLE = 200;

/**
 * Which people a report covers.
 *
 * Five modes rather than a role plus a list, because "all the employees" and
 * "these four employees" are different questions and only one of them has ids.
 * The bulk three are resolved against the database at generation time, so a
 * report run twice a month apart reflects who was there each time rather than
 * whoever the browser had cached.
 *
 * `EVERYONE` is deliberately not `ALL_EMPLOYEES` plus `ALL_ADMINS` assembled by
 * the client: an account is in exactly one of the two populations, and letting a
 * caller send both would be the one way to get somebody counted twice.
 */
export const PEOPLE_SELECTIONS = [
  "SELECTED_EMPLOYEES",
  "SELECTED_ADMINS",
  "ALL_EMPLOYEES",
  "ALL_ADMINS",
  "EVERYONE",
] as const;

export type PeopleSelection = (typeof PEOPLE_SELECTIONS)[number];

/** Whether a selection is one somebody names people for. */
export function isExplicitSelection(selection: PeopleSelection): boolean {
  return selection === "SELECTED_EMPLOYEES" || selection === "SELECTED_ADMINS";
}

/**
 * What kind of record a row is.
 *
 * The three the report can produce, and deliberately **not** an
 * `AttendanceDayStatus`: those are seven values describing what a day amounted
 * to, and four of them (`CLOSED`, `NON_WORKING`, `NO_RECORD`, `UPCOMING`) are
 * not records at all — they are the absence of one, said precisely. This is the
 * filter an administrator actually reaches for, and `report.service.ts` maps it
 * onto those statuses rather than duplicating them.
 *
 * There is no `ALL` literal. "All" is the three of them selected, which is what
 * the screen shows when the set is complete — a fourth value meaning "the other
 * three" would be a second way to say one thing, and the two would drift.
 */
export const REPORT_RECORD_TYPES = ["ATTENDANCE", "ABSENT", "LEAVE"] as const;

export type ReportRecordType = (typeof REPORT_RECORD_TYPES)[number];

/**
 * Everything a report request carries besides the period.
 *
 * Spread into each branch of the union below rather than intersected onto it,
 * because `strictObject` and `z.intersection` cannot both hold: an intersection
 * hands the whole payload to both halves, and a strict half refuses every field
 * belonging to the other. Spreading keeps the strictness, which is the property
 * worth keeping — there is no field here for a total, a count or a summary,
 * because the browser computes none of them. A payload carrying one is a client
 * trying to tell the server what its own records add up to, and it is refused
 * loudly rather than stripped in silence.
 */
const reportFields = {
  people: z.enum(PEOPLE_SELECTIONS),
  /**
   * Accepted on every selection and required by none. The service ignores it for
   * the bulk modes and refuses an empty list for the explicit ones — the
   * looser-schema-with-the-real-check-behind-it split the invitation and roster
   * routes already use, kept because a shape that could not express the request
   * would mean two endpoints for one screen.
   */
  selectedUserIds: z
    .array(z.string().trim().min(1).max(40))
    .max(MAX_SELECTED_PEOPLE, `Choose at most ${MAX_SELECTED_PEOPLE} people.`)
    .default([]),
  recordTypes: z
    .array(z.enum(REPORT_RECORD_TYPES))
    .min(1, "Choose at least one record type.")
    // De-duplicated rather than refused: a repeated value is a client bug, not
    // an instruction, and the set it describes is unambiguous either way.
    .transform((types) => [...new Set(types)]),

  /**
   * Narrowing applied to a report that has already been generated.
   *
   * Sent back to the server rather than applied in the browser, and that is not
   * ceremony: the report is paged, so a search applied to the page in front of
   * somebody would miss every match on page two, and the summary beside it would
   * describe rows the table was no longer showing. Every number in a report
   * describes the rows the report currently holds — see `report.service.ts`.
   */
  search: z.string().trim().max(120).optional(),
  role: z.enum(["ALL", "EMPLOYEE", "ADMIN"]).default("ALL"),
  /**
   * Narrows to one day status inside the record types already chosen.
   *
   * A second, finer filter rather than a duplicate of `recordTypes`: an absence
   * report has one status, but an attendance report holds present and late days
   * together, and "just the late ones" is the question somebody asks of it.
   * `LATE` is not a status — it is present *and* past the deadline, exactly as
   * on the attendance roster, and it is applied as that.
   */
  status: z.enum(["ALL", "PRESENT", "LATE", "ABSENT", "ON_LEAVE"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
};

/**
 * A request for a report.
 *
 * Discriminated on `period` so the fields belonging to one shape cannot be sent
 * with another — a month has no end date, and a single day has no year to
 * disagree with it. Every branch resolves to an inclusive `from`/`to` pair in
 * the transform below, so there is exactly one place a month becomes two dates
 * and the service never learns which of the three ways it was described except
 * to print it.
 */
export const reportRequestSchema = z
  .discriminatedUnion("period", [
    z.strictObject({
      period: z.literal("MONTHLY"),
      month: z.coerce
        .number()
        .int("Choose a month.")
        .min(MIN_MONTH, "Choose a month.")
        .max(MAX_MONTH, "Choose a month."),
      year: z.coerce
        .number()
        .int("Choose a year.")
        .min(MIN_REPORT_YEAR, `Choose a year from ${MIN_REPORT_YEAR} onwards.`)
        .max(MAX_REPORT_YEAR, `Choose a year up to ${MAX_REPORT_YEAR}.`),
      ...reportFields,
    }),
    z.strictObject({
      period: z.literal("CUSTOM"),
      startDate: calendarDateSchema,
      endDate: calendarDateSchema,
      ...reportFields,
    }),
    z.strictObject({
      period: z.literal("DAILY"),
      date: calendarDateSchema,
      ...reportFields,
    }),
  ])
  .transform((value) => {
    const period: ReportPeriod =
      value.period === "MONTHLY"
        ? { kind: "MONTHLY", ...monthlyRange(value.year, value.month) }
        : value.period === "DAILY"
          ? { kind: "DAILY", from: value.date, to: value.date }
          : { kind: "CUSTOM", from: value.startDate, to: value.endDate };

    return {
      period,
      people: value.people,
      selectedUserIds: value.selectedUserIds,
      recordTypes: value.recordTypes,
      search: value.search,
      role: value.role,
      status: value.status,
      page: value.page,
      pageSize: value.pageSize,
    };
  })
  // Checked after the transform so one rule covers all three shapes. A month and
  // a single day can never fail either, which is exactly why they are not worth
  // writing three times — the path names the field only the custom range has.
  .refine(({ period }) => period.from.getTime() <= period.to.getTime(), {
    message: "The end date cannot be before the start date.",
    path: ["endDate"],
  })
  .refine(({ period }) => isReportableRange(period.from, period.to), {
    message: `A report can cover at most ${MAX_REPORT_RANGE_DAYS} days. Choose a shorter range.`,
    path: ["endDate"],
  });

export type ReportRequest = z.infer<typeof reportRequestSchema>;

/** The picker's own query: who may this report be about? */
export const reportPeopleQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  /**
   * Which population to offer. `ALL` is both, for the picker that lets somebody
   * mix an administrator and an employee into one selection.
   */
  population: z.enum(["ALL", "EMPLOYEE", "ADMIN"]).default("ALL"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type ReportPeopleQuery = z.infer<typeof reportPeopleQuerySchema>;
