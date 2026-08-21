import { z } from "zod";

import { INVITE_ROLE_VALUES } from "@/lib/enums";
import { emailSchema } from "@/validations/auth.schema";

/** Which role an invitation grants. Never widened to SUPER_ADMIN — see `Invitation`. */
export const inviteRoleSchema = z.enum(INVITE_ROLE_VALUES);

export const createInvitationSchema = z.object({
  /** The mailbox the invitation admits, and nothing else. */
  email: emailSchema,
  role: inviteRoleSchema,
  /** Job title stamped on the account at sign-up. Omitted leaves it unset. */
  jobRoleId: z.string().trim().min(1).optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const jobRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the role a name of at least 2 characters")
    .max(60, "Keep the name under 60 characters"),
});

export type JobRoleInput = z.infer<typeof jobRoleSchema>;

/** Narrows a list to one role; omitted means every role the viewer may see. */
export const listInvitationsSchema = z.object({ role: inviteRoleSchema.optional() });

/**
 * What the super admin may delegate to one administrator.
 *
 * All optional so a screen can toggle one right without restating the others,
 * and at least one required so an empty body is reported rather than accepted
 * as a successful change of nothing.
 */
export const adminPermissionsSchema = z
  .object({
    canInviteEmployees: z.boolean().optional(),
    canManageHolidays: z.boolean().optional(),
    canSendEmails: z.boolean().optional(),
    canEmailAdmins: z.boolean().optional(),
    canViewAdminRecords: z.boolean().optional(),
    canMarkAttendance: z.boolean().optional(),
    canManageComplaints: z.boolean().optional(),
    canManageRemoteWork: z.boolean().optional(),
    canEditHistoricalAttendance: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((granted) => granted !== undefined),
    "Name a permission to change.",
  );

export type AdminPermissionsInput = z.infer<typeof adminPermissionsSchema>;

export const adminDecisionSchema = z.object({ approve: z.boolean() });

export type AdminDecisionInput = z.infer<typeof adminDecisionSchema>;
