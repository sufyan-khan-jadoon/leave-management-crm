import { z } from "zod";

import {
  MAX_EMAIL_BODY_LENGTH,
  MAX_EMAIL_RECIPIENTS,
  MAX_EMAIL_SUBJECT_LENGTH,
} from "@/lib/constants";

/**
 * Who a custom email is going to.
 *
 * Parsed as an enum rather than taken as a string so an unknown audience is
 * refused by the parser, before any code has a chance to treat it as a default.
 * Which of these the caller may actually use is decided in
 * `custom-email.service.ts` against their role and grants — this only settles
 * that the value is one of the five that exist.
 */
export const emailAudienceSchema = z.enum([
  "INDIVIDUAL",
  "EMPLOYEES",
  "ADMINS",
  "SELECTED_ADMINS",
  "ALL_MEMBERS",
]);

export const emailSubjectSchema = z
  .string()
  .trim()
  .min(3, "Give the message a subject")
  .max(MAX_EMAIL_SUBJECT_LENGTH, `Keep the subject under ${MAX_EMAIL_SUBJECT_LENGTH} characters`);

/**
 * The message body, as HTML from the composer.
 *
 * Only bounded here. What the markup is *allowed to contain* is not a parsing
 * question — it is a security one, settled by the allowlist in
 * `sanitize-html.ts` after this passes, so that the rule lives with the thing
 * that understands HTML rather than with the thing that counts characters.
 */
export const emailBodySchema = z
  .string()
  .min(1, "Write a message")
  .max(MAX_EMAIL_BODY_LENGTH, "That message is too long to send");

/**
 * The hand-picked recipients, as they arrive over the wire.
 *
 * A comma-separated string rather than a repeated field, because the whole
 * message is `multipart/form-data` — one encoding whether or not files ride
 * along — and `parseMultipart` folds repeated text parts down to one value.
 * Sending a list as a single field is the honest way to carry it through that,
 * and cuids contain no commas.
 *
 * Deduplicated here rather than downstream: a set sent twice over is a client
 * bug, not an instruction to write to somebody twice, and the count the sender
 * confirmed has to be the count that goes.
 */
const selectedRecipientsSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(z.string().min(1).max(40))
      .min(1, "Choose at least one administrator.")
      .max(MAX_EMAIL_RECIPIENTS, `Choose no more than ${MAX_EMAIL_RECIPIENTS} people.`),
  )
  .transform((ids) => [...new Set(ids)]);

/**
 * `recipientId` belongs to INDIVIDUAL, `recipientIds` to SELECTED_ADMINS, and
 * each is refused everywhere else.
 *
 * Refused rather than ignored: a body carrying both `audience: "ALL_MEMBERS"`
 * and a `recipientId` is a caller who has misunderstood something, and silently
 * dropping one of the two would send a message to the wrong set of people while
 * appearing to work. The two recipient fields cannot be combined for the same
 * reason — "one person and also these six" is not a request this can serve, and
 * guessing which half was meant is how somebody gets a message they should not
 * have.
 *
 * Note what this deliberately does *not* check: whether the caller may use the
 * audience, and whether the ids name administrators they may write to. Both are
 * settled in `custom-email.service.ts` against the grants read from the
 * database, because neither is a question about the shape of the request.
 */
export const sendCustomEmailSchema = z
  .strictObject({
    audience: emailAudienceSchema,
    recipientId: z.string().trim().min(1).max(40).optional(),
    recipientIds: selectedRecipientsSchema.optional(),
    subject: emailSubjectSchema,
    body: emailBodySchema,
  })
  .superRefine((value, ctx) => {
    if (value.audience === "INDIVIDUAL" && !value.recipientId) {
      ctx.addIssue({ code: "custom", path: ["recipientId"], message: "Choose who this is going to." });
    }

    if (value.audience !== "INDIVIDUAL" && value.recipientId) {
      ctx.addIssue({
        code: "custom",
        path: ["recipientId"],
        message: "A single recipient cannot be combined with a group audience.",
      });
    }

    if (value.audience === "SELECTED_ADMINS" && !value.recipientIds?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["recipientIds"],
        message: "Choose at least one administrator.",
      });
    }

    if (value.audience !== "SELECTED_ADMINS" && value.recipientIds) {
      ctx.addIssue({
        code: "custom",
        path: ["recipientIds"],
        message: "A chosen list of administrators only applies when sending to selected administrators.",
      });
    }
  });

export type SendCustomEmailInput = z.infer<typeof sendCustomEmailSchema>;

export const emailLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export type EmailLogQuery = z.infer<typeof emailLogQuerySchema>;

/**
 * Filters the recipient picker.
 *
 * `scope` says which of the two pickers is asking — the one-person picker, or
 * the administrator multi-select — and nothing more. It is **not** an audience
 * and cannot widen anything: each scope has its own permission check and builds
 * its own eligible population in `custom-email.service.ts`, so asking for the
 * administrator list without the grant is refused there rather than filtered
 * here. It defaults to the narrower of the two.
 */
export const emailRecipientQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  scope: z.enum(["INDIVIDUAL", "ADMINS"]).default("INDIVIDUAL"),
});

export type EmailRecipientQuery = z.infer<typeof emailRecipientQuerySchema>;
