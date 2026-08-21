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
 * There is deliberately **no `reason` field**, unlike `markEmployeePresentSchema`
 * beside it. This is a one-click correction: the name, the role, both statuses
 * and the moment are captured automatically, which is the whole of what an audit
 * needs, and a box demanding a sentence is a box somebody fills with "n/a".
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
