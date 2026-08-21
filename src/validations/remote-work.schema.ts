import { z } from "zod";

import { MAX_REMOTE_WORK_RANGE_DAYS, MAX_REMOTE_WORK_REASON_LENGTH } from "@/lib/constants";
import { REMOTE_WORK_TYPE, REMOTE_WORK_TYPE_VALUES } from "@/lib/remote-work";
import { calendarDateSchema } from "@/validations/holiday.schema";

export const remoteWorkReasonSchema = z
  .string()
  .trim()
  .min(3, "Say why this person is working remotely")
  .max(MAX_REMOTE_WORK_REASON_LENGTH, `Keep the reason under ${MAX_REMOTE_WORK_REASON_LENGTH} characters`);

/**
 * Assigning somebody a remote-work period.
 *
 * **Discriminated on `type`**, following `reportRequestSchema`, so the fields
 * belonging to one shape cannot be sent with another: "One week" has no end date
 * to disagree with the week it means, and a custom range has no meaning without
 * both of its own. The alternative — one flat object with optional dates and a
 * refinement — would accept `{ type: "TODAY", endDate: "2030-01-01" }` and then
 * have to decide which half to believe.
 *
 * Every branch is a `strictObject`, for the reason `markAttendanceSchema` is:
 * there is no field here for a computed duration, a day count or a status,
 * because the browser computes none of them and the server derives all of them.
 * A payload carrying one is a client telling the server what its own records
 * mean, and it is refused loudly rather than stripped in silence.
 */
const assignmentFields = {
  employeeId: z.string().trim().min(1, "Choose an employee").max(40),
  reason: remoteWorkReasonSchema,
};

export const createRemoteWorkSchema = z.discriminatedUnion("type", [
  // The four fixed durations. Each resolves to real dates in
  // `resolveRemotePeriod` against the company's calendar day, so none of them
  // carries a date the browser worked out — a client whose clock said yesterday
  // would otherwise book a period beginning yesterday.
  z.strictObject({ type: z.literal(REMOTE_WORK_TYPE.TODAY), ...assignmentFields }),
  z.strictObject({ type: z.literal(REMOTE_WORK_TYPE.TOMORROW), ...assignmentFields }),
  z.strictObject({ type: z.literal(REMOTE_WORK_TYPE.WEEK), ...assignmentFields }),
  z.strictObject({ type: z.literal(REMOTE_WORK_TYPE.MONTH), ...assignmentFields }),
  z.strictObject({ type: z.literal(REMOTE_WORK_TYPE.UNTIL_REVOKED), ...assignmentFields }),
  z
    .strictObject({
      type: z.literal(REMOTE_WORK_TYPE.CUSTOM),
      startDate: calendarDateSchema,
      endDate: calendarDateSchema,
      ...assignmentFields,
    })
    .refine((value) => value.endDate.getTime() >= value.startDate.getTime(), {
      message: "The end date cannot be before the start date.",
      path: ["endDate"],
    })
    .refine((value) => withinRangeCap(value.startDate, value.endDate), {
      message: `A remote period can cover at most ${MAX_REMOTE_WORK_RANGE_DAYS} days. Choose "Until revoked" for an open-ended arrangement.`,
      path: ["endDate"],
    }),
]);

export type CreateRemoteWorkInput = z.infer<typeof createRemoteWorkSchema>;

/**
 * Changing a period that already exists.
 *
 * Both dates are named outright rather than a `type` being re-chosen, because
 * "make it one week" means nothing once a period has been running for three
 * days — the administrator is moving an end, not picking a duration afresh.
 * `endDate: null` is how a bounded period becomes open-ended, which is why the
 * field is nullable rather than merely optional: an absent key means *leave it
 * alone*, and an explicit null means *remove it*. Those are different
 * instructions and a single optional field could not express both.
 */
export const updateRemoteWorkSchema = z
  .strictObject({
    startDate: calendarDateSchema.optional(),
    endDate: calendarDateSchema.nullable().optional(),
    reason: remoteWorkReasonSchema.optional(),
  })
  .refine(
    (value) => value.startDate !== undefined || value.endDate !== undefined || value.reason !== undefined,
    "Change the dates or the reason.",
  );

export type UpdateRemoteWorkInput = z.infer<typeof updateRemoteWorkSchema>;

/**
 * Calling a period off.
 *
 * The reason is optional here and required on assignment, which is the right way
 * round: putting somebody beyond the attendance register is the act that needs
 * explaining, and putting them back is the default state resuming.
 */
export const revokeRemoteWorkSchema = z.strictObject({
  reason: remoteWorkReasonSchema.optional(),
});

export type RevokeRemoteWorkInput = z.infer<typeof revokeRemoteWorkSchema>;

/**
 * The states the management screen can narrow to.
 *
 * `ALL` is the unfiltered view. The other four mirror `RemoteWorkState` exactly
 * — they are derived from the dates rather than stored, so this is a filter the
 * service applies in memory, the same trade `attendanceRosterQuerySchema` makes
 * for a status that does not exist as a column.
 */
export const REMOTE_WORK_STATE_FILTERS = ["ALL", "ACTIVE", "SCHEDULED", "EXPIRED", "REVOKED"] as const;

export const remoteWorkQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  employeeId: z.string().trim().max(40).optional(),
  state: z.enum(REMOTE_WORK_STATE_FILTERS).default("ACTIVE"),
  /**
   * Which population to report on, exactly as the attendance roster means it —
   * and gated by the same `canViewAdminRecords`, through `populationService`.
   * Separating the administrators out is the same disclosure here as there.
   */
  population: z.enum(["ALL", "EMPLOYEE", "ADMIN"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RemoteWorkQuery = z.infer<typeof remoteWorkQuerySchema>;

/** Candidates for the dialog's employee picker. */
export const remoteWorkPeopleQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type RemoteWorkPeopleQuery = z.infer<typeof remoteWorkPeopleQuerySchema>;

/** Every duration the picker offers, in the order it offers them. */
export const REMOTE_WORK_TYPES = REMOTE_WORK_TYPE_VALUES;

function withinRangeCap(from: Date, to: Date): boolean {
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  return days <= MAX_REMOTE_WORK_RANGE_DAYS;
}
