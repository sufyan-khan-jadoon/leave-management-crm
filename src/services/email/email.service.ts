import nodemailer, { type Transporter } from "nodemailer";
import { Role } from "@prisma/client";

import { friendlyTimeLabel } from "@/lib/attendance-policy";
import { ROUTES } from "@/lib/constants";
import { appConfig, serverEnv } from "@/lib/env";
import {
  accountLockedTemplate,
  accountStatusTemplate,
  adminDecisionTemplate,
  attendanceWarningTemplate,
  customEmailTemplate,
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

/**
 * A file to hang off a message, in the shape nodemailer builds a MIME part from.
 *
 * `content` is a Buffer rather than a path: nothing in this system writes an
 * upload to disk, so there is no temporary file to remove after a send and none
 * left behind by a failed one. The buffers are held for the length of the
 * request and released with it.
 *
 * `filename` has already been through `sanitizeAttachmentName` and `contentType`
 * was derived from its extension — see `email-attachments.ts`. Neither is ever
 * taken from what a browser claimed.
 */
export type MailAttachment = { filename: string; content: Buffer; contentType: string };

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
async function send(to: string, template: Template, attachments?: MailAttachment[]): Promise<boolean> {
  try {
    await transporter().sendMail({
      from: serverEnv().EMAIL_FROM,
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      // Omitted entirely rather than sent as `[]`, so a text-only message
      // produces exactly the single-part MIME structure it always has.
      ...(attachments?.length ? { attachments } : {}),
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

  /**
   * The warning letter for a missed working day.
   *
   * Takes the cutoff as minutes and phrases it here, so every place that shows a
   * deadline reads it off the one stored number rather than restating "5 PM" in
   * prose that would quietly go stale the moment the super admin changed it.
   */
  sendAttendanceWarning(
    to: string,
    options: { name: string; date: Date; cutoffMinutes: number; consecutiveMissed: number },
  ) {
    return send(
      to,
      attendanceWarningTemplate({
        name: options.name,
        date: options.date,
        cutoffLabel: friendlyTimeLabel(options.cutoffMinutes),
        consecutiveMissed: options.consecutiveMissed,
      }),
    );
  },

  /**
   * A message an administrator wrote by hand, with whatever they attached to it.
   *
   * `html` must already have been through `sanitizeEmailHtml` — this is the one
   * template whose body is not escaped, and `custom-email.service.ts` is the
   * only caller precisely so that neither the sanitising nor the attachment
   * rules can be forgotten.
   *
   * The same attachment buffers are handed to every recipient's message. They
   * are read once for the whole send rather than once per person, which is what
   * keeps a five-file message to forty people from being forty copies of it in
   * memory.
   */
  sendCustomEmail(
    to: string,
    options: {
      recipientName: string;
      senderName: string;
      subject: string;
      html: string;
      text: string;
      attachments?: MailAttachment[];
    },
  ) {
    return send(
      to,
      customEmailTemplate({
        ...options,
        // The template lists what is attached by name; the transport carries the
        // bytes. Both read the same array, so they cannot disagree.
        attachments: options.attachments?.map((file) => file.filename) ?? [],
      }),
      options.attachments,
    );
  },

  sendProfileUpdated(to: string, name: string, changedBy: "you" | "an administrator") {
    return send(to, profileUpdatedTemplate(name, changedBy));
  },

  sendAccountStatusChanged(to: string, name: string, suspended: boolean) {
    return send(to, accountStatusTemplate(name, suspended));
  },
};
