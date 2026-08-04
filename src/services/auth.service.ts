import { randomInt } from "node:crypto";

import { EmployeeStatus, type Role } from "@prisma/client";

import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
} from "@/lib/constants";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import { employeeRepository, type EmployeeDto } from "@/repositories/employee.repository";
import { otpRepository } from "@/repositories/otp.repository";
import { emailService } from "@/services/email/email.service";
import type { LoginInput, RegisterInput, VerifyOtpInput } from "@/validations/auth.schema";

export type AuthenticatedEmployee = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: EmployeeStatus;
  profileComplete: boolean;
  image: string | null;
};

/** A profile is complete once every field required for leave routing is set. */
export function isProfileComplete(employee: {
  phone: string | null;
  department: string | null;
  position: string | null;
  joiningDate: Date | null;
}): boolean {
  return Boolean(employee.phone && employee.department && employee.position && employee.joiningDate);
}

function generateOtp(): string {
  // randomInt is cryptographically secure and unbiased, unlike Math.random.
  const max = 10 ** OTP_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_LENGTH, "0");
}

export const authService = {
  /**
   * Creates an unverified account and dispatches the welcome + OTP emails.
   * Re-registering an existing but unverified address reissues a code rather
   * than leaking that the address is taken.
   */
  async register(input: RegisterInput): Promise<{ email: string }> {
    const existing = await employeeRepository.findByEmail(input.email);

    if (existing) {
      if (existing.emailVerified) {
        throw new ConflictError("An account with this email already exists. Try signing in instead.");
      }

      await this.issueOtp(existing.id, existing.email, existing.name);
      return { email: existing.email };
    }

    const password = await hashPassword(input.password);
    const employee = await employeeRepository.create({
      name: input.name,
      email: input.email,
      password,
    });

    await emailService.sendWelcome(employee.email, employee.name);
    await this.issueOtp(employee.id, employee.email, employee.name);

    return { email: employee.email };
  },

  /** Issues a fresh OTP, invalidating any outstanding codes. */
  async issueOtp(employeeId: string, email: string, name: string): Promise<void> {
    const code = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

    await otpRepository.invalidateOutstanding(employeeId);
    await otpRepository.create({ employeeId, code, expiresAt });
    await emailService.sendOtp(email, name, code);
  },

  /** Re-sends a code, subject to the per-account cooldown. */
  async resendOtp(email: string): Promise<{ cooldownSeconds: number }> {
    const employee = await employeeRepository.findByEmail(email);

    // Always report success so this endpoint cannot enumerate accounts.
    if (!employee || employee.emailVerified) {
      return { cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS };
    }

    const latest = await otpRepository.findLatest(employee.id);

    if (latest) {
      const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        throw new RateLimitError(
          `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)} seconds before requesting another code.`,
          Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed),
        );
      }
    }

    await this.issueOtp(employee.id, employee.email, employee.name);
    return { cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  },

  /** Validates a submitted code and marks the address verified. */
  async verifyEmail(input: VerifyOtpInput): Promise<EmployeeDto> {
    const employee = await employeeRepository.findByEmail(input.email);
    if (!employee) throw new NotFoundError("We couldn't find an account for that email address.");

    if (employee.emailVerified) {
      throw new ConflictError("This email address is already verified. You can sign in now.");
    }

    const otp = await otpRepository.findActive(employee.id);
    if (!otp) {
      throw new ValidationError("That code has expired. Request a new one to continue.");
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await otpRepository.markConsumed(otp.id);
      throw new ValidationError("Too many incorrect attempts. Request a new code to continue.");
    }

    if (otp.code !== input.code) {
      await otpRepository.incrementAttempts(otp.id);
      const remaining = OTP_MAX_ATTEMPTS - otp.attempts - 1;
      throw new ValidationError(
        remaining > 0
          ? `That code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "That code is incorrect. Request a new code to continue.",
      );
    }

    await otpRepository.markConsumed(otp.id);
    const verified = await employeeRepository.markEmailVerified(employee.id);

    await emailService.sendEmailVerified(verified.email, verified.name);

    return verified;
  },

  /**
   * Credential check used by the NextAuth authorize callback.
   * Returns null for bad credentials so the provider surfaces a generic
   * failure; throws only for states the user must be told about explicitly.
   */
  async authenticate(input: LoginInput): Promise<AuthenticatedEmployee | null> {
    const employee = await employeeRepository.findByEmailWithSecret(input.email);
    if (!employee) return null;

    const valid = await verifyPassword(input.password, employee.password);
    if (!valid) return null;

    if (!employee.emailVerified) {
      throw new ForbiddenError("Please verify your email address before signing in.");
    }

    if (employee.status === EmployeeStatus.SUSPENDED) {
      throw new ForbiddenError("Your account has been suspended. Please contact your HR administrator.");
    }

    return {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      status: employee.status,
      profileComplete: isProfileComplete(employee),
      image: employee.profilePhoto,
    };
  },
};
