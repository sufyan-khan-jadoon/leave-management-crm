import { z } from "zod";

import { MAX_EMAIL_BODY_LENGTH, MAX_EMAIL_SUBJECT_LENGTH } from "@/lib/constants";

/**
 * Who a custom email is going to.
 *
 * Parsed as an enum rather than taken as a string so an unknown audience is
 * refused by the parser, before any code has a chance to treat it as a default.
 * Which of these the caller may actually use is decided in
 * `custom-email.service.ts` against their role and grant — this only settles
 * that the value is one of the four that exist.
 */
export const emailAudienceSchema = z.enum(["INDIVIDUAL", "EMPLOYEES", "ADMINS", "ALL_MEMBERS"]);

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
 * `recipientId` is required for INDIVIDUAL and refused for everything else.
 *
 * Refused rather than ignored: a body carrying both `audience: "ALL_MEMBERS"`
 * and a `recipientId` is a caller who has misunderstood something, and silently
 * dropping one of the two would send a message to the wrong set of people while
 * appearing to work.
 */
export const sendCustomEmailSchema = z
  .strictObject({
    audience: emailAudienceSchema,
    recipientId: z.string().trim().min(1).max(40).optional(),
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
  });

export type SendCustomEmailInput = z.infer<typeof sendCustomEmailSchema>;

export const emailLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export type EmailLogQuery = z.infer<typeof emailLogQuerySchema>;

/** Filters the recipient picker. Never accepts an audience — that is the service's to decide. */
export const emailRecipientQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
});

export type EmailRecipientQuery = z.infer<typeof emailRecipientQuerySchema>;
