import { z } from "zod";

import {
  MAX_COMPLAINT_ATTACHMENTS,
  MAX_COMPLAINT_ATTACHMENT_BYTES,
  MAX_COMPLAINT_BODY_LENGTH,
  MAX_COMPLAINT_NOTES_LENGTH,
  MAX_COMPLAINT_SUBJECT_LENGTH,
} from "@/lib/constants";
import { COMPLAINT_STATUSES, requiresResolution, type ComplaintStatusValue } from "@/lib/complaint-status";

export const complaintStatusSchema = z.enum(["PENDING", "UNDER_REVIEW", "RESOLVED", "REJECTED"]);

const subjectSchema = z
  .string()
  .trim()
  .min(5, "Give the complaint a subject of at least 5 characters")
  .max(MAX_COMPLAINT_SUBJECT_LENGTH, `Keep the subject under ${MAX_COMPLAINT_SUBJECT_LENGTH} characters`);

const descriptionSchema = z
  .string()
  .trim()
  .min(20, "Describe what happened in at least 20 characters")
  .max(MAX_COMPLAINT_BODY_LENGTH, "That description is too long");

/**
 * One attached file, as a data URL.
 *
 * The project's existing answer to file storage, following `profilePhoto` — no
 * object store to stand up. The pattern is deliberately narrow: images and PDFs
 * only, because this string is rendered back to an administrator, and the two
 * formats that must never be here are SVG (a document that can carry script) and
 * anything `text/html`. An allowlist rather than a blocklist, exactly as
 * `email-attachments.ts` argues.
 *
 * `size` is **not** taken from the client. It is derived from the payload in
 * `describeAttachment` below, because a browser-reported length is a claim and
 * the thing that costs storage is the string that actually arrived.
 */
const attachmentSchema = z.strictObject({
  filename: z.string().trim().min(1, "A file needs a name").max(180),
  data: z
    .string()
    .trim()
    .regex(
      /^data:(image\/(png|jpeg|jpg|webp|gif)|application\/pdf);base64,[A-Za-z0-9+/=]+$/,
      "Attachments must be a PNG, JPEG, WebP, GIF or PDF",
    ),
});

export type ComplaintAttachmentInput = z.infer<typeof attachmentSchema>;

/**
 * What an employee submits.
 *
 * A `strictObject`, following `markAttendanceSchema`, and here the strictness is
 * doing something specific: **there is no field for who is complaining**, and a
 * body carrying `employeeId`, `status`, `resolution` or `resolvedById` is
 * refused outright rather than quietly stripped. The author comes off the
 * session and the status is the column default, so a caller trying to file under
 * somebody else's name — or to file something pre-resolved — gets an error
 * somebody sees rather than a complaint that appeared to work.
 */
export const submitComplaintSchema = z.strictObject({
  subject: subjectSchema,
  description: descriptionSchema,
  attachments: z
    .array(attachmentSchema)
    .max(MAX_COMPLAINT_ATTACHMENTS, `Attach no more than ${MAX_COMPLAINT_ATTACHMENTS} files`)
    .optional()
    .default([])
    .refine(
      (files) => files.reduce((total, file) => total + file.data.length, 0) <= MAX_COMPLAINT_ATTACHMENT_BYTES,
      `Those files come to more than ${Math.round(MAX_COMPLAINT_ATTACHMENT_BYTES / (1024 * 1024))} MB together`,
    ),
});

export type SubmitComplaintInput = z.infer<typeof submitComplaintSchema>;

/**
 * What an administrator changes.
 *
 * Every field optional so one thing can move without restating the others, and
 * at least one required so an empty body is reported rather than accepted as a
 * successful change of nothing — the same shape `adminPermissionsSchema` takes.
 *
 * `resolvedById` and `resolvedAt` are **absent by construction**. They are the
 * server's to write, from the session and the clock, and a schema that could
 * express them would be a schema somebody could use to credit a colleague with
 * their decision. Same for the employee: nothing here can move a complaint to a
 * different person.
 *
 * The cross-field rule is that a closing status needs words. It is checked here
 * *and* in the service, because this schema cannot see the complaint's current
 * resolution — somebody re-closing a complaint that already carries one is
 * legitimate and sends no text, so only the service can tell that apart from a
 * closure with nothing said at all.
 */
export const updateComplaintSchema = z
  .strictObject({
    status: complaintStatusSchema.optional(),
    resolution: z
      .string()
      .trim()
      .max(MAX_COMPLAINT_BODY_LENGTH, "That resolution is too long")
      .optional(),
    internalNotes: z
      .string()
      .trim()
      .max(MAX_COMPLAINT_NOTES_LENGTH, "Those notes are too long")
      .optional(),
  })
  .refine(
    (value) => value.status !== undefined || value.resolution !== undefined || value.internalNotes !== undefined,
    "Name something to change.",
  )
  .superRefine((value, ctx) => {
    // Only when the caller is *sending* a resolution alongside a closing status.
    // An empty string here is an explicit attempt to close with nothing said;
    // omitting the field entirely leaves the service to check what is stored.
    if (
      value.status &&
      requiresResolution(value.status as ComplaintStatusValue) &&
      value.resolution !== undefined &&
      value.resolution.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["resolution"],
        message: "Say what was decided before closing this.",
      });
    }
  });

export type UpdateComplaintInput = z.infer<typeof updateComplaintSchema>;

/**
 * How the admin list is narrowed.
 *
 * `employeeId` is a **filter**, not a scope: it narrows a list the caller is
 * already entitled to see in full, having passed `canManageComplaints`. That is
 * the opposite of `/api/complaints`, where the employee's own id replaces
 * anything sent and there is no way to widen it at all.
 */
export const complaintQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: complaintStatusSchema.optional(),
  employeeId: z.string().trim().min(1).max(40).optional(),
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export type ComplaintQuery = z.infer<typeof complaintQuerySchema>;

/** The employee's own list. No scope of any kind — the session decides. */
export const myComplaintQuerySchema = z.object({
  status: complaintStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export type MyComplaintQuery = z.infer<typeof myComplaintQuerySchema>;

/** Guards the label map against a status being added to the enum and forgotten. */
export const KNOWN_COMPLAINT_STATUSES = COMPLAINT_STATUSES;
