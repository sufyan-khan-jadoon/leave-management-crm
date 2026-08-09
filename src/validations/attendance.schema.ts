import { z } from "zod";

import { calendarDateSchema } from "@/validations/holiday.schema";

/**
 * What the browser is allowed to say about itself.
 *
 * Three numbers, and `.strict()` so nothing else gets through. That refusal is
 * the point rather than tidiness: a body carrying `distance`, `isInsideOffice`
 * or `isPresent` is a client trying to hand the server a verdict, and the server
 * has no field to receive one into. Stripping them silently would work too, but
 * failing loudly means an attempt to pass one shows up as an error somebody sees
 * instead of as attendance that quietly worked.
 */
export const markAttendanceSchema = z.strictObject({
  latitude: z.coerce.number().min(-90, "Invalid latitude").max(90, "Invalid latitude"),
  longitude: z.coerce.number().min(-180, "Invalid longitude").max(180, "Invalid longitude"),
  /**
   * Not bounded above here. A hopeless fix is a real reading that the geofence
   * rule refuses with an explanation, not malformed input — and
   * `MAX_ACCURACY_METERS` belongs with the rule, not with the parser.
   */
  accuracyMeters: z.coerce.number().positive("Invalid accuracy"),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

/** The employee's own history. Scope is taken from the session, never the query. */
export const attendanceHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export type AttendanceHistoryQuery = z.infer<typeof attendanceHistoryQuerySchema>;

/**
 * The admin day roster.
 *
 * Day-centric because "present or absent" is only answerable about one day at a
 * time: absence is the lack of a row, so it exists per-day-per-person rather
 * than as anything to page through. Moving the date is how history is read.
 */
export const attendanceRosterQuerySchema = z.object({
  /** Defaults to today, on the company's clock, in the service. */
  date: calendarDateSchema.optional(),
  employeeId: z.string().trim().max(40).optional(),
  department: z.string().trim().max(60).optional(),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["ALL", "PRESENT", "ABSENT", "ON_LEAVE"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AttendanceRosterQuery = z.infer<typeof attendanceRosterQuerySchema>;

/**
 * The super admin's attendance policy.
 *
 * The cutoff arrives as "HH:MM" because that is what a time input produces, and
 * is stored as minutes because every use of it is a comparison. Both fields are
 * optional so the panel can save one without restating the other, but an empty
 * body is refused — a request that changes nothing is a mistake worth reporting.
 *
 * `workingDays` is deliberately absent, though it lives on the same row. The
 * working week governs leave as well as attendance, so it is written through
 * `/api/admin/working-days` and nowhere else: two endpoints writing one value is
 * how the two come to disagree about which days count.
 */
export const updateAttendancePolicySchema = z
  .object({
    cutoff: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time between 00:00 and 23:59")
      .transform((value) => {
        const [hour, minute] = value.split(":").map(Number);
        return hour * 60 + minute;
      })
      .optional(),
    warningsEnabled: z.boolean().optional(),
  })
  .refine(
    (value) => value.cutoff !== undefined || value.warningsEnabled !== undefined,
    "Change something first.",
  )
  .transform(({ cutoff, ...rest }) => ({ ...rest, cutoffMinutes: cutoff }));

export type UpdateAttendancePolicyInput = z.infer<typeof updateAttendancePolicySchema>;
