import { z } from "zod";

import { EDITABLE_DAY_STATUSES } from "@/lib/attendance-edit";
import { calendarDateSchema } from "@/validations/holiday.schema";

/**
 * An administrator moving a past day from one status to another.
 *
 * `strictObject` for the reason `markAttendanceSchema` and
 * `markEmployeePresentSchema` are: there is no field for a previous status, a
 * count, or anything else the browser believes. What the day currently reads as
 * is **re-derived from the roster** when this runs, so a payload carrying its
 * own idea of it would be a client handing the server a verdict — and the
 * verdict is exactly what gets written into the audit log. A body carrying one
 * is refused loudly rather than stripped, so the attempt surfaces as an error
 * somebody sees instead of as an audit entry that quietly lied.
 *
 * `note` is **optional, and the optionality is the argument**. This file used to
 * say there was no reason field at all, on the grounds that a one-click
 * correction captures the name, the role, both statuses and the moment
 * automatically — which is the whole of what an audit needs — and that a box
 * demanding a sentence is a box somebody fills with "n/a". That reasoning was
 * about a *mandatory* box and it still holds: nothing here demands one, the
 * roster's dropdown sends none, and a day corrected without a word is recorded
 * exactly as it always was. What it never justified was refusing an
 * administrator who *does* have something to say — "phone died, seen in the
 * office by two people" is precisely the thing a register put right three weeks
 * later needs beside it, and there was nowhere to put it.
 *
 * There is no `arrivalTime` either, and that absence is load-bearing rather than
 * a simplification — see `attendance.service.ts`, which pins a corrected day's
 * check-in to that day's own cutoff rather than to whatever o'clock it happened
 * to be when the button was pressed.
 */
export const attendanceEditSchema = z.strictObject({
  employeeId: z.string().trim().min(1, "Choose somebody").max(40),
  /**
   * The day being corrected. Required, and refused unless it is genuinely past —
   * today belongs to `markPresentFor` and its window. See `isHistoricalDate`.
   */
  date: calendarDateSchema,
  /**
   * Where the day should end up.
   *
   * Only the three statuses a person can hold. `CLOSED`, `NON_WORKING`,
   * `REMOTE`, `UPCOMING` and `NO_RECORD` are not values here at all, so a
   * request to assert one is refused by the parser rather than reaching a
   * service that would have to explain itself — the same stance
   * `employeeQuerySchema` takes towards `SUPER_ADMIN`.
   */
  status: z.enum(EDITABLE_DAY_STATUSES),
  /**
   * Why, in the administrator's own words, when they have something to say.
   *
   * Trimmed and folded to `undefined` when it comes through empty, so a dialog
   * that always sends the field cannot write a row of whitespace into the audit
   * trail — the service stores `null` for it, which is the same record a
   * one-click correction leaves and is readable as "nothing was said" rather
   * than as an empty string somebody typed.
   */
  note: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type AttendanceEditInput = z.infer<typeof attendanceEditSchema>;

/**
 * The super admin reading back what administrators have changed.
 *
 * Every filter is optional and narrows rather than widens: an empty query is the
 * whole log, newest first, which is what the screen opens on. `employeeId` and
 * `editedById` are separate fields on purpose — "what was done to Ali" and "what
 * did Sarah do" are the two questions this log exists to answer, and folding
 * them into one search box would answer neither precisely.
 */
export const attendanceEditQuerySchema = z.object({
  /** Whose day was corrected. */
  employeeId: z.string().trim().max(40).optional(),
  /** Who did the correcting. */
  editedById: z.string().trim().max(40).optional(),
  /** The attendance date corrected — not the day the correction was made. */
  date: calendarDateSchema.optional(),
  previousStatus: z.enum(EDITABLE_DAY_STATUSES).optional(),
  newStatus: z.enum(EDITABLE_DAY_STATUSES).optional(),
  /** Free text over the subject's and the editor's names. */
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AttendanceEditQuery = z.infer<typeof attendanceEditQuerySchema>;
