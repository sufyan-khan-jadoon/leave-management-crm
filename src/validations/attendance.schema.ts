import { z } from "zod";

import { MAX_HR_MARK_WINDOW_MINUTES, MIN_HR_MARK_WINDOW_MINUTES } from "@/lib/constants";
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
  /**
   * `LATE` is deliberately **not** an `AttendanceDayStatus`.
   *
   * It is a filter over one, and the distinction is what keeps `describeDay`
   * unchanged: somebody late is `PRESENT` — they were there — so a fifth day
   * status would have to be ordered against the other four and would make the
   * tiles double-count. Narrowing to it here means "present, and past the
   * deadline", and the service applies it as exactly that.
   */
  status: z.enum(["ALL", "PRESENT", "LATE", "ABSENT", "ON_LEAVE", "NO_RECORD"]).default("ALL"),
  /**
   * Which population to show — everybody, the employees, or the administrators.
   *
   * `population` rather than `role`, unlike `employeeQuerySchema`, because
   * `ADMIN` here covers two roles: the super admin is counted with the
   * administrators, as they are in every other report. Calling the field `role`
   * would promise a filter on one column and deliver a filter on two.
   *
   * `SUPER_ADMIN` is not a value, exactly as it is not one there. Narrowing a
   * screen down to a single named account is not a report on a population, and
   * the one account it would isolate is the one nothing may act on.
   *
   * Accepted from any administrator and refused for most of them in
   * `attendanceService.roster` — the looser-schema-with-the-real-check-behind-it
   * split the invitation routes use.
   */
  population: z.enum(["ALL", "EMPLOYEE", "ADMIN"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AttendanceRosterQuery = z.infer<typeof attendanceRosterQuerySchema>;

/**
 * An administrator recording somebody present for a past or current day.
 *
 * `strictObject` for the same reason `markAttendanceSchema` is one, and the
 * reason matters more here rather than less: that schema refuses a client's
 * verdict about a *position*, and this one refuses a client's verdict about
 * everything. There is no field for a status, because the only status this can
 * produce is `PRESENT`, and no field for a time, because nobody knows what time
 * somebody arrived on a day they failed to check in — inventing one would put a
 * precise-looking lie in the record.
 *
 * `date` is required rather than defaulting to today: the whole point is
 * correcting a day that has already gone wrong, and a default would make the
 * common case the one you get by forgetting to say which day you meant.
 */
export const markEmployeePresentSchema = z.strictObject({
  employeeId: z.string().trim().min(1, "Choose somebody").max(40),
  date: calendarDateSchema,
  /**
   * When the employee actually arrived, on the company's clock.
   *
   * **Required, and deliberately not defaulted to the current time.** An absent
   * person has no check-in to reuse — absence is the lack of a row — so this is
   * the only place the arrival time can come from, and defaulting it would mean
   * silently charging somebody the minutes between arriving and being recorded.
   * Somebody who came in at 17:15 and was written up at 17:20 was fifteen
   * minutes late, not twenty. The form prefills it with the current time so the
   * common case is one keystroke, but a prefilled field a person can see and
   * correct is a different thing from a default they never knew was applied.
   *
   * "HH:MM" rather than a full instant, matching how every other time of day in
   * this system is entered and stored: the server pairs it with the chosen date
   * in `APP_TIME_ZONE`, so a browser in another timezone cannot shift the day.
   */
  arrivalTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time between 00:00 and 23:59"),
  /**
   * Optional, and trimmed to null when blank.
   *
   * Not required, because a correction refused for want of a sentence is a
   * correction somebody makes by typing "n/a" — which is worse than an empty
   * column, since it reads as though a reason was given. The name and timestamp
   * are the audit trail; this is the part only a person can add.
   */
  reason: z
    .string()
    .trim()
    .max(280, "Keep the reason under 280 characters")
    .optional()
    .transform((value) => value || null),
});

export type MarkEmployeePresentInput = z.infer<typeof markEmployeePresentSchema>;

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
    /**
     * Minutes, not a time of day — this is a duration measured from the cutoff,
     * so "HH:MM" would be the wrong shape and would cap it at midnight for no
     * reason. Bounded here and re-checked in the service, exactly as the cutoff
     * is: a window out of range refuses every correction silently rather than
     * failing where somebody would see it.
     */
    hrMarkWindowMinutes: z.coerce
      .number()
      .int("Enter a whole number of minutes.")
      .min(MIN_HR_MARK_WINDOW_MINUTES, "The window cannot be negative.")
      .max(MAX_HR_MARK_WINDOW_MINUTES, `Keep the window to ${MAX_HR_MARK_WINDOW_MINUTES} minutes or less.`)
      .optional(),
    warningsEnabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.cutoff !== undefined ||
      value.opening !== undefined ||
      value.closing !== undefined ||
      value.hrMarkWindowMinutes !== undefined ||
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
 * Matched case-insensitively, and trimmed.
 *
 * The ceremony is meant to make somebody stop and type a word on purpose, which
 * typing `reset` does just as completely as `RESET` — and an exact literal
 * turned a lowercase answer into a button that stayed disabled without saying
 * why, which reads as a broken reset rather than as a refused one. Deliberately
 * not relaxed any further than case: a prefix or a "close enough" match would be
 * a ceremony that no longer asks anything.
 */
const resetConfirmation = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .refine((value) => value === RESET_CONFIRMATION, {
    message: `Type ${RESET_CONFIRMATION} to confirm.`,
  });

/**
 * Which tables a reset reaches into.
 *
 * `ATTENDANCE` and `LEAVES` are apart because the two answer different
 * questions and are worth clearing separately: wiping a month of trial
 * check-ins should not have to cost everybody the leave they booked.
 *
 * `ABSENCES` clears `attendance_warnings`, which is the only place absence is
 * ever written down — the status itself is derived and cannot be deleted at
 * all. It is its own target because it is the only one whose risk is a
 * *duplicate letter* rather than a lost record.
 *
 * `ALL` is the three together rather than something a caller assembles by
 * firing three requests and hoping each of them lands.
 */
export const RESET_TARGETS = ["ATTENDANCE", "LEAVES", "ABSENCES", "ALL"] as const;

export type ResetTarget = (typeof RESET_TARGETS)[number];

/**
 * Erasing the record — **what** to clear, and **how far back**.
 *
 * Two fields rather than one flat list of scopes, because this is a grid: every
 * target is worth clearing for a single date as well as for all time, and eight
 * literals spelling out the combinations is how one of them comes to be spelt
 * wrong. The union discriminates on `range` so `date` cannot be left off a
 * single-day reset by accident and cannot be smuggled into an all-time one.
 *
 * `ALL_TIME` carries `confirm`, checked **here** rather than only in the dialog.
 * A confirmation that lives in the browser is a courtesy to the person clicking;
 * this one is the rule, so a curl at the endpoint has to spell out the same word
 * as the screen does.
 *
 * `DATE` deliberately has no such field, for **any** target. The word marks the
 * act that nothing can undo and no one can work around: all time. One day is a
 * correction — the wrong closure declared, a test run, a device that double
 * counted — and a ceremony demanded for every ordinary fix is a ceremony that
 * somebody eventually automates away. The dialog still names the exact rows and
 * still says out loud that a cleared leave cannot be re-booked by the person who
 * lost it, which is the part of a single day that does not grow back.
 */
export const resetAttendanceSchema = z.discriminatedUnion("range", [
  z.strictObject({
    range: z.literal("DATE"),
    target: z.enum(RESET_TARGETS),
    date: calendarDateSchema,
  }),
  z.strictObject({
    range: z.literal("ALL_TIME"),
    target: z.enum(RESET_TARGETS),
    confirm: resetConfirmation,
  }),
]);

export type ResetAttendanceInput = z.infer<typeof resetAttendanceSchema>;
export type ResetRange = ResetAttendanceInput["range"];

/** What the dialog asks before it shows a number: how much would this remove? */
export const resetAttendancePreviewSchema = z.discriminatedUnion("range", [
  z.object({ range: z.literal("DATE"), target: z.enum(RESET_TARGETS), date: calendarDateSchema }),
  z.object({ range: z.literal("ALL_TIME"), target: z.enum(RESET_TARGETS) }),
]);

export type ResetAttendancePreviewQuery = z.infer<typeof resetAttendancePreviewSchema>;
