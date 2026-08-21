import { z } from "zod";

import { EMPLOYEE_REPORT_RANGES } from "@/lib/employee-report-range";
import { MAX_REPORT_RANGE_DAYS, isReportableRange } from "@/lib/report-period";
import { calendarDateSchema } from "@/validations/holiday.schema";

/**
 * What one person's report is asked for.
 *
 * Deliberately far narrower than `reportRequestSchema`. That one describes a
 * report somebody composes — who it covers, which records, then a search, a role
 * and a status narrowing what came back. This one covers exactly one person, who
 * is named in the path rather than in the body, and **has no in-report
 * narrowing at all**.
 *
 * That absence is a decision rather than an omission. `report.service.ts` holds
 * one rule for the whole payload — every number describes the rows the report
 * currently holds — and on a screen with a headline attendance rate, tiles, a
 * calendar and a chart beside the table, honouring that rule against a status
 * filter would move all four every time somebody narrowed the table to look at
 * something. So there is nothing to narrow with: the period is the only filter,
 * every record type is always included, and the figures describe the period.
 *
 * `strictObject` for the reason `markAttendanceSchema` is one, and the reason is
 * the same here as there: there is no field for a total, a rate, a working-day
 * count or a day's verdict, because the browser computes none of them. A payload
 * carrying one is a client telling the server what its own records add up to,
 * and it is refused loudly rather than stripped in silence.
 */
export const employeeReportRequestSchema = z
  .strictObject({
    range: z.enum(EMPLOYEE_REPORT_RANGES),
    /**
     * Only ever sent with `CUSTOM`, and refused with anything else — see below.
     * Optional rather than absent because a discriminated union of six branches
     * that differ in two fields is five copies of one shape.
     */
    startDate: calendarDateSchema.optional(),
    endDate: calendarDateSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(31),
  })
  .superRefine((value, ctx) => {
    if (value.range === "CUSTOM") {
      if (!value.startDate) {
        ctx.addIssue({ code: "custom", path: ["startDate"], message: "Choose a start date." });
      }
      if (!value.endDate) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "Choose an end date." });
      }

      // A field that failed its own shape check reaches here **unparsed** — zod
      // runs an object's checks over what it has rather than stopping at the
      // first bad field — so `2026-02-30` arrives as the string it was posted
      // as. Comparing two of those would throw out of the parser and surface as
      // a 500 on a request whose real answer is "that is not a real date", which
      // the field's own issue already says. So there is nothing to add here.
      if (!(value.startDate instanceof Date) || !(value.endDate instanceof Date)) return;

      if (value.startDate.getTime() > value.endDate.getTime()) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "The end date cannot be before the start date.",
        });
        return;
      }

      if (!isReportableRange(value.startDate, value.endDate)) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: `A report can cover at most ${MAX_REPORT_RANGE_DAYS} days. Choose a shorter range.`,
        });
      }

      return;
    }

    // A preset that arrives carrying its own dates is **refused, not ignored**.
    // The dates a preset resolves to are the server's to work out against the
    // company's calendar day — see `employee-report-range.ts` — so a body
    // holding both is a client that believes it decided something it did not,
    // and quietly dropping the fields would leave it believing that. The same
    // stance `remote-work.schema.ts` takes towards a fixed duration sending its
    // own dates.
    if (value.startDate || value.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["range"],
        message: "Only a custom range carries its own dates.",
      });
    }
  });

export type EmployeeReportRequest = z.infer<typeof employeeReportRequestSchema>;
