import { z } from "zod";

import { OTP_LENGTH } from "@/lib/constants";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Enter a valid email address")
  .toLowerCase();

/**
 * Password policy: length plus mixed character classes. Enforced identically on
 * the client (instant feedback) and the server (authoritative).
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be 72 characters or fewer")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[0-9]/, "Include at least one number")
  .regex(/[^A-Za-z0-9]/, "Include at least one special character");

/**
 * The secret from an invitation link.
 *
 * Bounded rather than pinned to an exact length so the check reads as "roughly
 * the right shape" — the authoritative test is whether it matches a stored
 * hash, which no amount of validation here can stand in for. It lives beside
 * the register schema, its only consumer, rather than with the administrator's
 * invitation schemas, which would make the two files import each other.
 */
export const invitationTokenSchema = z
  .string()
  .trim()
  .min(20, "That invitation link is not valid")
  .max(200, "That invitation link is not valid");

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(80, "Name must be 80 characters or fewer")
      .regex(/^[\p{L}\p{M}'\-.\s]+$/u, "Name may only contain letters, spaces, hyphens and apostrophes"),
    /**
     * The address the invitation was sent to.
     *
     * Submitted even though the form shows it read-only, and compared against
     * the invitation server-side — a field the browser was told not to edit is
     * not a field the server may assume was left alone.
     */
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    /**
     * Required for everyone: registration is by invitation only, and the
     * invitation the token names decides whether the account becomes an
     * employee or an administrator.
     */
    token: invitationTokenSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/** The two sign-in screens. Each admits exactly one kind of account. */
export const LOGIN_PORTALS = ["employee", "admin"] as const;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
  /**
   * Which screen the attempt came from. Required rather than defaulted: a
   * request that omits it fails validation and is refused outright, so the
   * check cannot be skipped by simply leaving the field off.
   */
  portal: z.enum(LOGIN_PORTALS),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyOtpSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .length(OTP_LENGTH, `Enter the ${OTP_LENGTH}-digit code`)
    .regex(/^\d+$/, "The code contains digits only"),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const resendOtpSchema = z.object({ email: emailSchema });

export type ResendOtpInput = z.infer<typeof resendOtpSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * The final reset step carries only the password: the account and the code it
 * belongs to come from the signed ticket set when the code was verified, so
 * neither is accepted from the request body.
 */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Changing your own password from the profile screen.
 *
 * The current password stands in for the emailed code the reset flow uses: a
 * signed-in session alone is not proof enough, since it may be an unattended
 * machine, and this is the one change that would lock the real owner out.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.password !== data.currentPassword, {
    message: "Choose a password you haven't used here before",
    path: ["password"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
