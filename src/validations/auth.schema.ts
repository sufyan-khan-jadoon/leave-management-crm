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

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(80, "Name must be 80 characters or fewer")
      .regex(/^[\p{L}\p{M}'\-.\s]+$/u, "Name may only contain letters, spaces, hyphens and apostrophes"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    /**
     * Required for everyone: registration is invite-only, and the key decides
     * whether the account becomes an employee or an administrator.
     */
    inviteKey: z
      .string()
      .trim()
      .min(1, "An invite key is required")
      .max(40, "That doesn't look like an invite key"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Kept as a named alias: both sign-up screens now demand a key, so the two
 * schemas are identical. The server decides the role from the key regardless.
 */
export const adminRegisterSchema = registerSchema;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
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
