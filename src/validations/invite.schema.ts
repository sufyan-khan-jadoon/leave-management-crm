import { z } from "zod";

import { INVITE_ROLE_VALUES } from "@/lib/enums";

/** Which role a key grants. Never widened to SUPER_ADMIN — see `InviteKey`. */
export const inviteRoleSchema = z.enum(INVITE_ROLE_VALUES);

export const issueInviteSchema = z.object({
  role: inviteRoleSchema,
  /** Job title stamped on the account at sign-up. Omitted leaves it unset. */
  jobRoleId: z.string().trim().min(1).optional(),
  /** Optional note of who the key is for, so a list of keys stays readable. */
  label: z.string().trim().max(80, "Keep the note under 80 characters").optional(),
});

export const jobRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the role a name of at least 2 characters")
    .max(60, "Keep the name under 60 characters"),
});

export type JobRoleInput = z.infer<typeof jobRoleSchema>;

export type IssueInviteInput = z.infer<typeof issueInviteSchema>;

/** Narrows a list to one role; omitted means every role the viewer may see. */
export const listInvitesSchema = z.object({ role: inviteRoleSchema.optional() });

export const invitePermissionSchema = z.object({ canInviteEmployees: z.boolean() });

export type InvitePermissionInput = z.infer<typeof invitePermissionSchema>;

export const verifyInviteSchema = z.object({
  inviteKey: z.string().trim().min(1, "Enter your invite key").max(40, "That doesn't look like an invite key"),
});

export type VerifyInviteInput = z.infer<typeof verifyInviteSchema>;

export const adminDecisionSchema = z.object({ approve: z.boolean() });

export type AdminDecisionInput = z.infer<typeof adminDecisionSchema>;
