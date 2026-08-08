import { randomInt } from "node:crypto";

import { EmployeeStatus, Role, type OtpPurpose } from "@prisma/client";

import {
  MAX_LOGIN_ATTEMPTS,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
} from "@/lib/constants";
import type { AppError } from "@/lib/errors";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";
import { OTP_PURPOSE, canSignIn, isAdminRole } from "@/lib/enums";
import type { ResetTicket } from "@/lib/auth/reset-ticket";
import { hashPassword, verifyPassword } from "@/lib/password";
import { employeeRepository, normalizeEmail, type EmployeeDto } from "@/repositories/employee.repository";
import { otpRepository } from "@/repositories/otp.repository";
import { emailService } from "@/services/email/email.service";
import { invitationService } from "@/services/invitation.service";
import { jobRoleService } from "@/services/job-role.service";
import type { LoginInput, RegisterInput, VerifyOtpInput } from "@/validations/auth.schema";

/**
 * What the sign-in callback hands to NextAuth, and so what ends up in the JWT.
 *
 * The profile photo is deliberately absent. Avatars are stored as data URLs, and
 * the session travels as a cookie on every request — putting one in here would
 * add tens of kilobytes to every header. The chrome reads it from the database
 * instead, which also means a new photo shows up straight away rather than at
 * the next sign-in. See `chromeUser`.
 */
export type AuthenticatedEmployee = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: EmployeeStatus;
  profileComplete: boolean;
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

/** Replaces any outstanding code of one purpose with a fresh one, unsent. */
async function mintOtp(employeeId: string, purpose: OtpPurpose): Promise<string> {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await otpRepository.invalidateOutstanding(employeeId, purpose);
  await otpRepository.create({ employeeId, code, purpose, expiresAt });

  return code;
}

/**
 * Whether the mailbox still owes an answer — because the address was never
 * proven, or because the sign-in lock is asking for that proof a second time.
 *
 * Both end at the same screen and are cleared by the same write, so every code
 * path asks this rather than testing one field and forgetting the other.
 */
function needsEmailProof(employee: { emailVerified: Date | null; lockedAt: Date | null }): boolean {
  return !employee.emailVerified || employee.lockedAt !== null;
}

/**
 * Mails the code that releases a locked account. The wording is its own, not
 * the sign-up one: somebody who verified months ago should be told a password
 * was being guessed at, not invited to ignore the message if they never
 * registered.
 */
async function sendUnlockCode(employee: { id: string; email: string; name: string }): Promise<void> {
  const code = await mintOtp(employee.id, OTP_PURPOSE.EMAIL_VERIFICATION);
  await emailService.sendAccountLockedOtp(employee.email, employee.name, code);
}

/**
 * Counts one failed sign-in and says what it cost — how many tries are left, or
 * that the account has just shut itself. Returns the refusal rather than
 * throwing it, so the one caller decides where it is raised.
 *
 * Counting down out loud is a deliberate trade. It tells anyone who can reach
 * the form which addresses have accounts here, since an unknown one keeps the
 * flat "incorrect email or password". That is accepted: a colleague mistyping
 * their password should be able to see the lock coming rather than meet it, and
 * this is an invitation-only system where the roster is hardly a secret. It
 * mirrors the countdown `assertOtp` already gives on a wrong code.
 *
 * A locked account never arrives here — `authenticate` turns it away before the
 * password is checked — so reaching the cap is what locks, and mails the code
 * that releases it.
 */
async function registerFailedLogin(employee: {
  id: string;
  email: string;
  name: string;
}): Promise<AppError> {
  const attempts = await employeeRepository.registerFailedLogin(employee.id);
  const remaining = MAX_LOGIN_ATTEMPTS - attempts;

  if (remaining > 0) {
    return new UnauthorizedError(
      `Incorrect email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before your account is locked.`,
    );
  }

  await employeeRepository.lockAccount(employee.id);
  await sendUnlockCode(employee);

  return new ForbiddenError(LOCKED_MESSAGE);
}

/**
 * Shown the moment an account locks, and on every attempt at it afterwards.
 *
 * It says "verify your email" on purpose: the sign-in form routes on that
 * phrase, and this ends at the same screen as an address that was never proven.
 */
const LOCKED_MESSAGE =
  "Too many failed sign-in attempts. We've emailed you a code — verify your email to unlock your account.";

/**
 * Checks a submitted code against the active OTP of one purpose, returning its
 * id. Wrong codes burn an attempt; the code is left usable so the caller
 * decides when it is spent.
 */
async function assertOtp(employeeId: string, code: string, purpose: OtpPurpose): Promise<string> {
  const otp = await otpRepository.findActive(employeeId, purpose);
  if (!otp) {
    throw new ValidationError("That code has expired. Request a new one to continue.");
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await otpRepository.markConsumed(otp.id);
    throw new ValidationError("Too many incorrect attempts. Request a new code to continue.");
  }

  if (otp.code !== code) {
    await otpRepository.incrementAttempts(otp.id);
    const remaining = OTP_MAX_ATTEMPTS - otp.attempts - 1;
    throw new ValidationError(
      remaining > 0
        ? `That code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
        : "That code is incorrect. Request a new code to continue.",
    );
  }

  return otp.id;
}

/**
 * Checks a code and spends it. Shared by email verification and password reset
 * so both enforce the same expiry, attempt cap and single-use semantics.
 */
async function consumeOtp(employeeId: string, code: string, purpose: OtpPurpose): Promise<void> {
  const otpId = await assertOtp(employeeId, code, purpose);
  await otpRepository.markConsumed(otpId);
}

export const authService = {
  /**
   * Creates an unverified account from an invitation, and dispatches the
   * welcome + OTP emails.
   *
   * The address is not the registrant's to choose: it is fixed by the
   * invitation, and a submitted address that differs is refused rather than
   * used. Otherwise a link sent to an employee could be answered with a
   * colleague's address, or with one nobody controls.
   */
  async register(input: RegisterInput): Promise<{ email: string; pendingApproval: boolean }> {
    // Resolved first, so nothing else happens for a link that names nothing.
    const invitation = await invitationService.forToken(input.token);
    const email = normalizeEmail(input.email);

    if (email !== invitation.email) {
      throw new ValidationError("This invitation was sent to a different email address.", {
        email: "This invitation was sent to a different email address.",
      });
    }

    const existing = await employeeRepository.findByEmail(email);

    // Reached by someone who registered but never verified, coming back through
    // the same link. Checked before the invitation is called spent, since
    // accepting it is exactly what they already did.
    if (existing) {
      if (existing.emailVerified) {
        throw new ConflictError("An account with this email already exists. Try signing in instead.");
      }

      await this.issueOtp(existing.id, existing.email, existing.name);
      return { email: existing.email, pendingApproval: existing.status === EmployeeStatus.PENDING_APPROVAL };
    }

    // Spent or lapsed invitations are refused here, before the account exists,
    // so a dead link never leaves a half-registered row behind.
    invitationService.assertUsable(invitation);

    // The role comes off the invitation, never off the request body — which is
    // what stops an employee invitation answered on the admin screen from
    // minting an administrator.
    const pendingApproval = invitation.role === Role.ADMIN;

    // The job title travels on the invitation the same way the role does, so it
    // is assigned rather than claimed. Copied by value: renaming or deleting the
    // job role later does not retitle people who already hold it.
    const position = invitation.jobRoleId
      ? await jobRoleService.nameFor(invitation.jobRoleId)
      : undefined;

    const password = await hashPassword(input.password);
    const employee = await employeeRepository.create({
      name: input.name,
      email,
      password,
      position,
      role: invitation.role,
      // An invited admin is inert until the super admin decides; an invited
      // employee is active the moment they verify their address, because
      // inviting them was already the decision.
      status: pendingApproval ? EmployeeStatus.PENDING_APPROVAL : EmployeeStatus.ACTIVE,
    });

    await invitationService.accept(invitation.id, employee.id);

    await emailService.sendWelcome(employee.email, employee.name);
    await this.issueOtp(employee.id, employee.email, employee.name);

    return { email: employee.email, pendingApproval };
  },

  /** Issues a fresh OTP for one purpose, invalidating outstanding codes of it. */
  async issueOtp(
    employeeId: string,
    email: string,
    name: string,
    purpose: OtpPurpose = OTP_PURPOSE.EMAIL_VERIFICATION,
  ): Promise<void> {
    const code = await mintOtp(employeeId, purpose);

    if (purpose === OTP_PURPOSE.PASSWORD_RESET) {
      await emailService.sendPasswordResetOtp(email, name, code);
    } else {
      await emailService.sendOtp(email, name, code);
    }
  },

  /** Re-sends a code, subject to the per-account cooldown. */
  async resendOtp(email: string): Promise<{ cooldownSeconds: number }> {
    const employee = await employeeRepository.findByEmail(email);

    // Always report success so this endpoint cannot enumerate accounts.
    if (!employee || !needsEmailProof(employee)) {
      return { cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS };
    }

    const latest = await otpRepository.findLatest(employee.id, OTP_PURPOSE.EMAIL_VERIFICATION);

    if (latest) {
      const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        throw new RateLimitError(
          `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)} seconds before requesting another code.`,
          Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed),
        );
      }
    }

    if (employee.lockedAt) {
      await sendUnlockCode(employee);
    } else {
      await this.issueOtp(employee.id, employee.email, employee.name);
    }

    return { cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS };
  },

  /**
   * Validates a submitted code and marks the address verified — which is also
   * how a locked account is released, since answering a code sent to the
   * mailbox is the proof the lock was holding out for.
   */
  async verifyEmail(input: VerifyOtpInput): Promise<EmployeeDto> {
    const employee = await employeeRepository.findByEmail(input.email);
    if (!employee) throw new NotFoundError("We couldn't find an account for that email address.");

    if (!needsEmailProof(employee)) {
      throw new ConflictError("This email address is already verified. You can sign in now.");
    }

    await consumeOtp(employee.id, input.code, OTP_PURPOSE.EMAIL_VERIFICATION);
    const verified = await employeeRepository.markEmailVerified(employee.id);

    // Only for a first verification. Telling someone who has been here for
    // months that their email is confirmed would bury the thing that actually
    // happened, which the lock notice they just answered already explained.
    if (!employee.emailVerified) {
      await emailService.sendEmailVerified(verified.email, verified.name);
    }

    return verified;
  },

  /**
   * Starts a password reset by mailing a code.
   *
   * Reports success regardless of whether the address exists or the account is
   * suspended, so the endpoint cannot be used to enumerate accounts. Suspended
   * accounts get no code — a new password would not let them in anyway.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const employee = await employeeRepository.findByEmail(email);
    if (!employee || !canSignIn(employee.status)) return;

    const latest = await otpRepository.findLatest(employee.id, OTP_PURPOSE.PASSWORD_RESET);

    if (latest) {
      const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        throw new RateLimitError(
          `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed)} seconds before requesting another code.`,
          Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed),
        );
      }
    }

    await this.issueOtp(employee.id, employee.email, employee.name, OTP_PURPOSE.PASSWORD_RESET);
  },

  /**
   * Confirms a reset code and returns what the password step needs to identify
   * it again. The code is checked but not spent — it is consumed only when the
   * new password is actually stored, so an abandoned attempt leaves it usable.
   */
  async verifyResetCode(input: VerifyOtpInput): Promise<ResetTicket> {
    const employee = await employeeRepository.findByEmail(input.email);

    // Mirrors the "expired code" wording used for a real account so a wrong
    // address cannot be distinguished from a wrong code.
    if (!employee || !canSignIn(employee.status)) {
      throw new ValidationError("That code has expired. Request a new one to continue.");
    }

    const otpId = await assertOtp(employee.id, input.code, OTP_PURPOSE.PASSWORD_RESET);

    return { employeeId: employee.id, otpId, email: employee.email };
  },

  /**
   * Stores the new password for a previously verified reset.
   *
   * The ticket is re-checked against the database rather than trusted: the code
   * it names must still be the live one, so a reset cannot be completed after
   * the code was spent, superseded by a newer request, or expired.
   */
  async resetPassword(ticket: ResetTicket, password: string): Promise<void> {
    const employee = await employeeRepository.findById(ticket.employeeId);

    if (!employee || !canSignIn(employee.status)) {
      throw new ValidationError("That code has expired. Request a new one to continue.");
    }

    const otp = await otpRepository.findActive(employee.id, OTP_PURPOSE.PASSWORD_RESET);

    if (!otp || otp.id !== ticket.otpId) {
      throw new ValidationError("That code has expired. Request a new one to continue.");
    }

    await otpRepository.markConsumed(otp.id);

    await employeeRepository.updatePassword(employee.id, await hashPassword(password));
    await emailService.sendPasswordChanged(employee.email, employee.name);
  },

  /**
   * Changes the password of the signed-in account, from the profile screen.
   *
   * The current password is re-proven rather than taken on the session's word:
   * a live session only shows someone reached the machine, and this is the one
   * change that would shut the real owner out of their own account. It is the
   * same standard the reset flow meets with an emailed code.
   *
   * Role plays no part — an administrator's password is no more and no less
   * theirs to change than anyone else's.
   */
  async changePassword(employeeId: string, currentPassword: string, password: string): Promise<void> {
    const employee = await employeeRepository.findByIdWithSecret(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    const valid = await verifyPassword(currentPassword, employee.password);

    // Keyed to the field so the form marks the box that was wrong, rather than
    // leaving it ambiguous which of the three is being complained about.
    if (!valid) {
      throw new ValidationError("That is not your current password.", {
        currentPassword: "That is not your current password.",
      });
    }

    await employeeRepository.updatePassword(employee.id, await hashPassword(password));
    await emailService.sendPasswordChanged(employee.email, employee.name);
  },

  /**
   * Credential check used by the NextAuth authorize callback.
   * Returns null for bad credentials so the provider surfaces a generic
   * failure; throws only for states the user must be told about explicitly.
   */
  async authenticate(input: LoginInput): Promise<AuthenticatedEmployee | null> {
    const employee = await employeeRepository.findByEmailWithSecret(input.email);
    if (!employee) return null;

    // Answered before the password is even looked at. Once an account is
    // locked, nothing else about it is true enough to act on — and someone
    // typing the password they know to be right would otherwise be refused
    // with no idea why, or told they had attempts left when they had none.
    if (employee.lockedAt) throw new ForbiddenError(LOCKED_MESSAGE);

    const valid = await verifyPassword(input.password, employee.password);

    // Thrown rather than answered with `null`, so the form can show the count
    // that is left instead of a flat "incorrect email or password".
    if (!valid) throw await registerFailedLogin(employee);

    // The count is of *consecutive* failures, so the right password ends the
    // run: an account is never locked by five typos spread over a year.
    if (employee.failedLoginAttempts > 0) {
      await employeeRepository.clearFailedLogins(employee.id);
    }

    // Each screen admits one kind of account. Checked only once the password has
    // been proven: doing it earlier would turn the sign-in form into a way of
    // asking "is this address an administrator?" without knowing the password.
    const wantsAdminPortal = input.portal === "admin";

    if (isAdminRole(employee.role) !== wantsAdminPortal) {
      throw new ForbiddenError(
        wantsAdminPortal
          ? "This is the administrator sign in. Please use the employee page."
          : "Administrators sign in from the administrator page.",
      );
    }

    if (!employee.emailVerified) {
      throw new ForbiddenError("Please verify your email address before signing in.");
    }

    if (employee.status === EmployeeStatus.PENDING_APPROVAL) {
      throw new ForbiddenError(
        "Your administrator request is awaiting approval. You'll be emailed once it's reviewed.",
      );
    }

    if (employee.status === EmployeeStatus.REJECTED) {
      throw new ForbiddenError("Your administrator request was declined. Please contact your super administrator.");
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
    };
  },
};
