import { z } from "zod";

export const issueInviteSchema = z.object({
  /** Optional note of who the key is for, so a list of keys stays readable. */
  label: z.string().trim().max(80, "Keep the note under 80 characters").optional(),
});

export type IssueInviteInput = z.infer<typeof issueInviteSchema>;

export const verifyInviteSchema = z.object({
  inviteKey: z.string().trim().min(1, "Enter your invite key").max(40, "That doesn't look like an invite key"),
});

export type VerifyInviteInput = z.infer<typeof verifyInviteSchema>;

export const adminDecisionSchema = z.object({ approve: z.boolean() });

export type AdminDecisionInput = z.infer<typeof adminDecisionSchema>;
