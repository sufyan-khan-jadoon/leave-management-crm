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
 * Every time arrives as "HH:MM" because that is what a time input produces, and
 * is stored as minutes because every use of it is a comparison. All fields are
 * optional so the panel can save one without restating the others, but an empty
 * body is refused — a request that changes nothing is a mistake worth reporting.
 *
 * The opening and closing times are published hours, not a rule: nothing here or
 * downstream judges a check-in by them. They are validated as a pair so that
 * "closes before it opens" is refused at the door rather than reaching a screen
 * that would have to describe it.
 *
 * `workingDays` is deliberately absent, though it lives on the same row. The
 * working week governs leave as well as attendance, so it is written through
 * `/api/admin/working-days` and nowhere else: two endpoints writing one value is
 * how the two come to disagree about which days count.
 */
const timeOfDay = (label: string) =>
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, label)
    .transform((value) => {
      const [hour, minute] = value.split(":").map(Number);
      return hour * 60 + minute;
    });

export const updateAttendancePolicySchema = z
  .object({
    cutoff: timeOfDay("Enter a time between 00:00 and 23:59").optional(),
    opening: timeOfDay("Enter an opening time between 00:00 and 23:59").optional(),
    closing: timeOfDay("Enter a closing time between 00:00 and 23:59").optional(),
    warningsEnabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.cutoff !== undefined ||
      value.opening !== undefined ||
      value.closing !== undefined ||
      value.warningsEnabled !== undefined,
    "Change something first.",
  )
  // Both halves or neither, because the pair is judged as a pair. Accepting a
  // lone closing time would mean comparing it against a stored opening the
  // sender never saw, and reporting a contradiction they did not write.
  .refine(
    (value) => (value.opening === undefined) === (value.closing === undefined),
    { message: "Set the opening and closing time together.", path: ["closing"] },
  )
  .refine(
    (value) => value.opening === undefined || value.closing === undefined || value.opening < value.closing,
    { message: "The office must close after it opens.", path: ["closing"] },
  )
  .transform(({ cutoff, opening, closing, ...rest }) => ({
    ...rest,
    cutoffMinutes: cutoff,
    openingMinutes: opening,
    closingMinutes: closing,
  }));

export type UpdateAttendancePolicyInput = z.infer<typeof updateAttendancePolicySchema>;

/** The word an all-time reset must carry, typed out by the person asking for it. */
export const RESET_CONFIRMATION = "RESET";

/**
 * Erasing check-ins — one day, or every one ever recorded.
 *
 * A discriminated union rather than an optional date, because the two are
 * different acts and only one of them is routine. `date` cannot be left off an
 * `ALL_TIME` reset by accident, and cannot be smuggled into one either.
 *
 * `confirm` is required on the all-time branch and checked **here**, not only in
 * the dialog. A confirmation that lives in the browser is a courtesy to the
 * person clicking; this one is the rule, so a curl at the endpoint has to spell
 * out the same word as the screen does. The day branch deliberately has no such
 * field — that reset is recoverable by asking people to mark present again, and
 * a ceremony demanded for every ordinary fix is a ceremony that gets automated
 * away.
 */
export const resetAttendanceSchema = z.discriminatedUnion("scope", [
  z.strictObject({
    scope: z.literal("DATE"),
    date: calendarDateSchema,
  }),
  z.strictObject({
    scope: z.literal("ALL_TIME"),
    confirm: z.literal(RESET_CONFIRMATION, {
      message: `Type ${RESET_CONFIRMATION} to confirm erasing every check-in.`,
    }),
  }),
]);

export type ResetAttendanceInput = z.infer<typeof resetAttendanceSchema>;

/** What the dialog asks before it shows a number: how much would this remove? */
export const resetAttendancePreviewSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("DATE"), date: calendarDateSchema }),
  z.object({ scope: z.literal("ALL_TIME") }),
]);

export type ResetAttendancePreviewQuery = z.infer<typeof resetAttendancePreviewSchema>;
