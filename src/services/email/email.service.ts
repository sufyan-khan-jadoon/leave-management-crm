import nodemailer, { type Transporter } from "nodemailer";

import { serverEnv } from "@/lib/env";
import {
  accountStatusTemplate,
  emailVerifiedTemplate,
  leaveApprovedTemplate,
  leaveRejectedTemplate,
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

  sendOtp(to: string, name: string, code: string) {
    return send(to, otpTemplate(name, code));
  },

  sendPasswordResetOtp(to: string, name: string, code: string) {
    return send(to, passwordResetOtpTemplate(name, code));
  },

  sendPasswordChanged(to: string, name: string) {
    return send(to, passwordChangedTemplate(name));
  },

  sendEmailVerified(to: string, name: string) {
    return send(to, emailVerifiedTemplate(name));
  },

  sendLeaveApproved(to: string, name: string, leaveDate: Date, reason: string, remaining: number) {
    return send(to, leaveApprovedTemplate(name, leaveDate, reason, remaining));
  },

  sendLeaveRejected(to: string, name: string, leaveDate: Date, reason: string, explanation: string) {
    return send(to, leaveRejectedTemplate(name, leaveDate, reason, explanation));
  },

  sendProfileUpdated(to: string, name: string, changedBy: "you" | "an administrator") {
    return send(to, profileUpdatedTemplate(name, changedBy));
  },

  sendAccountStatusChanged(to: string, name: string, suspended: boolean) {
    return send(to, accountStatusTemplate(name, suspended));
  },
};
