import nodemailer, { type Transporter } from "nodemailer";
import { Role } from "@prisma/client";

import { ROUTES } from "@/lib/constants";
import { appConfig, serverEnv } from "@/lib/env";
import {
  accountLockedTemplate,
  accountStatusTemplate,
  adminDecisionTemplate,
  emailVerifiedTemplate,
  invitationTemplate,
  leaveApprovedTemplate,
  officeClosedTemplate,
  otpTemplate,
  passwordChangedTemplate,
  passwordResetOtpTemplate,
  profileUpdatedTemplate,
  welcomeTemplate,
} from "@/services/email/templates";

type Template = { subject: string; html: string; text: string };

const globalForMailer = globalThis as unknown as { mailer?: Transporter };

function transporter(): Transporter {
  if (globalForMailer.mailer) return globalForMailer.mailer;

  const env = serverEnv();
  const mailer = nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    secure: env.EMAIL_SECURE || env.EMAIL_PORT === 465,
    auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASSWORD },
  });

  globalForMailer.mailer = mailer;
  return mailer;
}

/**
 * Delivers a template. Notifications are deliberately non-blocking: a bounced
 * SMTP connection must never fail the user action that triggered it (a leave
 * approval is still valid even if the confirmation email doesn't send), so
 * failures are logged and swallowed.
 */
async function send(to: string, template: Template): Promise<boolean> {
  try {
    await transporter().sendMail({
      from: serverEnv().EMAIL_FROM,
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    return true;
  } catch (error) {
    console.error(`[email] Failed to deliver "${template.subject}" to ${to}:`, error);
    return false;
  }
}

export const emailService = {
  /** Verifies SMTP credentials — used by the health check. */
  async verifyConnection(): Promise<boolean> {
    try {
      await transporter().verify();
      return true;
    } catch (error) {
      console.error("[email] SMTP verification failed:", error);
      return false;
    }
  },

  sendWelcome(to: string, name: string) {
    return send(to, welcomeTemplate(name));
  },

  /**
   * Mails an invitation link.
   *
   * The link is built here rather than by the service, so the token is turned
   * into a URL in exactly one place — and administrators are sent to the screen
   * that explains the approval step rather than the employee one.
   */
  sendInvitation(
    to: string,
    invitation: { role: Role; jobTitle: string | null; inviterName: string; token: string; expiresAt: Date },
  ) {
    const path = invitation.role === Role.ADMIN ? ROUTES.adminRegister : ROUTES.register;
    const url = `${appConfig.url}${path}?token=${encodeURIComponent(invitation.token)}`;

    return send(to, invitationTemplate({ ...invitation, url }));
  },

  sendOtp(to: string, name: string, code: string) {
    return send(to, otpTemplate(name, code));
  },

  /** The code that releases an account locked by too many failed sign-ins. */
  sendAccountLockedOtp(to: string, name: string, code: string) {
    return send(to, accountLockedTemplate(name, code));
  },

  sendPasswordResetOtp(to: string, name: string, code: string) {
    return send(to, passwordResetOtpTemplate(name, code));
  },

  sendPasswordChanged(to: string, name: string) {
    return send(to, passwordChangedTemplate(name));
  },

  sendAdminDecision(to: string, name: string, approved: boolean) {
    return send(to, adminDecisionTemplate(name, approved));
  },

  sendEmailVerified(to: string, name: string) {
    return send(to, emailVerifiedTemplate(name));
  },

  sendLeaveApproved(to: string, name: string, dates: Date[], reason: string, remaining: number) {
    return send(to, leaveApprovedTemplate(name, dates, reason, remaining));
  },

  sendOfficeClosed(to: string, options: { name: string; weekday: string; date: Date; reason: string }) {
    return send(to, officeClosedTemplate(options));
  },

  sendProfileUpdated(to: string, name: string, changedBy: "you" | "an administrator") {
    return send(to, profileUpdatedTemplate(name, changedBy));
  },

  sendAccountStatusChanged(to: string, name: string, suspended: boolean) {
    return send(to, accountStatusTemplate(name, suspended));
  },
};
