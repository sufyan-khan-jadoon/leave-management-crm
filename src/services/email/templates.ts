import type { Role } from "@prisma/client";

import { appConfig } from "@/lib/env";
import { ordinal } from "@/lib/attendance-policy";
import { MAX_LOGIN_ATTEMPTS, MONTHLY_LEAVE_ALLOWANCE, OTP_TTL_MINUTES } from "@/lib/constants";
import { formatDate, formatDateRange } from "@/lib/date";

type Template = { subject: string; html: string; text: string };

/**
 * The name every email is signed with.
 *
 * Deliberately a literal rather than `appConfig.name`. The app name is an
 * environment variable, so reading it here would let a stale `APP_NAME` in one
 * deployment's dashboard put the wrong company on outgoing mail — the one place
 * the mistake is unrecoverable, because the message has already left. The
 * screens may be configurable; the letterhead is not.
 *
 * It is the brand alone: no product name, no tagline, no descriptor.
 */
const BRAND = "Zovencia";

/**
 * The Zovencia palette, and nothing outside it.
 *
 * `green` is exact and never approximated — it is the brand. It is also
 * extremely luminous (roughly 1.6:1 against white), so it is used for *fills*
 * and never for text on a light background; `darkGreen` is what green words are
 * written in. Putting the bright green on white would be unreadable, which is
 * the whole reason the pair exists.
 *
 * The greys are pure neutrals (R=G=B) on purpose. The palette this replaced
 * drifted blue in its "neutrals" — #f4f5fb, #8b90a8 — which is what made the
 * old mail read as a purple template even where no purple was declared.
 */
const C = {
  green: "#0AEA0A",
  darkGreen: "#023506",
  black: "#000000",
  white: "#FFFFFF",
  page: "#F5F5F5",
  panel: "#F5F5F5",
  border: "#E5E5E5",
  muted: "#5A5A5A",
  faint: "#767676",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapes user-supplied values before they are interpolated into HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A label/value table, as the invitation, leave and closure notices all use.
 *
 * Extracted so the three of them cannot drift apart: the borders and the label
 * colour are stated once, and a fourth caller inherits them rather than
 * copying a hex code that was right on the day it was pasted.
 */
function detailTable(rows: Array<[label: string, value: string]>): string {
  const cells = rows
    .map(([label, value], index) => {
      const edge = index === rows.length - 1 ? "" : `border-bottom:1px solid ${C.border};`;

      return `<tr>
        <td style="padding:14px 18px;${edge}color:${C.muted};font-size:13px;font-family:${FONT};">${esc(label)}</td>
        <td style="padding:14px 18px;${edge}font-weight:700;color:${C.black};font-size:14px;font-family:${FONT};">${esc(value)}</td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;width:100%;border:1px solid ${C.border};border-radius:12px;border-collapse:separate;">${cells}</table>`;
}

/** The one-time codes, set large enough to read off a phone at arm's length. */
function codeBlock(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;">
    <tr>
      <td align="center" style="background:${C.panel};border:1px solid ${C.border};border-left:4px solid ${C.green};border-radius:12px;padding:20px;">
        <div style="font-size:32px;letter-spacing:8px;font-weight:700;color:${C.darkGreen};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${esc(code)}</div>
      </td>
    </tr>
  </table>`;
}

/**
 * The shared shell every message is poured into.
 *
 * Table-based and fully inline because this is mail, not a page: Outlook renders
 * through Word, Gmail strips most of what a stylesheet would say, and anything
 * that depends on a class is a coin toss. The `<style>` block carries only a
 * mobile padding tweak, so a client that discards it loses nothing that matters —
 * the layout is fluid to begin with, `width:100%` under a `max-width`.
 *
 * `color-scheme: light` asks the dark-mode clients not to invert us. Gmail and
 * Apple Mail otherwise re-tint the header, and a brand green they have decided
 * to darken is no longer the brand green.
 */
function layout(heading: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${esc(heading)}</title>
    <style>
      @media only screen and (max-width: 600px) {
        .zv-pad { padding: 24px 20px !important; }
        .zv-head { padding: 20px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${C.page};font-family:${FONT};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};padding:32px 16px;border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:${C.white};border-radius:16px;overflow:hidden;border:1px solid ${C.border};border-collapse:separate;">
            <tr>
              <td class="zv-head" style="background:${C.green};padding:24px 32px;border-radius:16px 16px 0 0;">
                <span style="color:${C.black};font-size:22px;font-weight:700;letter-spacing:-0.3px;font-family:${FONT};">${BRAND}</span>
              </td>
            </tr>
            <tr>
              <td class="zv-pad" style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:${C.darkGreen};font-weight:700;font-family:${FONT};">${esc(heading)}</h1>
                <div style="font-size:15px;line-height:1.65;color:${C.black};font-family:${FONT};">${body}</div>
                ${
                  cta
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                         <tr>
                           <td style="background:${C.green};border-radius:8px;">
                             <a href="${esc(cta.url)}" style="display:inline-block;background:${C.green};color:${C.black};text-decoration:none;padding:13px 26px;border-radius:8px;font-size:15px;font-weight:700;font-family:${FONT};">${esc(cta.label)}</a>
                           </td>
                         </tr>
                       </table>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td class="zv-pad" style="padding:20px 32px;border-top:1px solid ${C.border};background:${C.white};">
                <div style="font-size:14px;font-weight:700;color:${C.darkGreen};font-family:${FONT};">${BRAND}</div>
                <div style="margin-top:6px;font-size:12px;line-height:1.5;color:${C.faint};font-family:${FONT};">
                  This is an automated message. Please do not reply.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function welcomeTemplate(name: string): Template {
  return {
    subject: `Welcome to ${BRAND}`,
    html: layout(
      // Raw on purpose: `layout` escapes the heading itself, and escaping here
      // too rendered an apostrophe as a literal "&#39;" in the subject line of
      // the message body. The only template that puts a name in the heading.
      `Welcome aboard, ${name}!`,
      `<p>Your account has been created successfully.</p>
       <p>We've sent a separate email with your 6-digit verification code. Enter it to activate your account, then complete your profile.</p>
       <p>Once you're in, you can mark your attendance from the dashboard and request leave in plain English — just describe it, and our assistant will handle the rest.</p>`,
      { label: "Go to sign in", url: `${appConfig.url}/login` },
    ),
    text: `Welcome aboard, ${name}!\n\nYour ${BRAND} account has been created. Check your inbox for a 6-digit verification code, then sign in at ${appConfig.url}/login.`,
  };
}

/**
 * The invitation itself — the one email that has to carry a working link, since
 * there is no other way into the application.
 *
 * The assigned role is stated plainly. An administrator invitation ends in an
 * approval step rather than a sign-in, and someone told only "you've been
 * invited" would reasonably read that wait as a fault.
 */
export function invitationTemplate(options: {
  role: Role;
  jobTitle: string | null;
  inviterName: string;
  url: string;
  expiresAt: Date;
}): Template {
  const isAdmin = options.role === "ADMIN";
  const roleLabel = isAdmin ? "Administrator" : "Employee";
  const expiry = formatDate(options.expiresAt);

  return {
    subject: `You're invited to ${BRAND}`,
    html: layout(
      `You've been invited to ${BRAND}`,
      `<p>${esc(options.inviterName)} has invited you to join ${BRAND}, where you'll mark your attendance and request your leave.</p>
       ${detailTable([
         ["Your role", roleLabel],
         ...(options.jobTitle ? ([["Your job title", options.jobTitle]] as Array<[string, string]>) : []),
         ["Invitation valid until", expiry],
       ])}
       <p>Use the button below to create your account. It's tied to this email address, so register with the address this message was sent to.</p>
       ${
         isAdmin
           ? `<p>Once you've verified your email, a super administrator reviews your request before you can sign in.</p>`
           : `<p>Once you've verified your email, you can sign in straight away.</p>`
       }
       <p style="color:${C.muted};">This invitation expires on ${esc(expiry)}. If it lapses, ask ${esc(options.inviterName)} to send another. If you weren't expecting it, you can ignore this email.</p>`,
      { label: "Accept invitation", url: options.url },
    ),
    text: `${options.inviterName} has invited you to join ${BRAND} as ${isAdmin ? "an administrator" : "an employee"}${options.jobTitle ? ` (${options.jobTitle})` : ""}.\n\nCreate your account here:\n${options.url}\n\nRegister with the address this message was sent to. The invitation expires on ${expiry}.`,
  };
}

export function otpTemplate(name: string, code: string): Template {
  return {
    subject: `${code} is your ${BRAND} verification code`,
    html: layout(
      "Verify your email address",
      `<p>Hi ${esc(name)}, use the code below to verify your email address.</p>
       ${codeBlock(code)}
       <p>This code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>.</p>
       <p style="color:${C.muted};">If you didn't create an account, you can safely ignore this email.</p>`,
    ),
    text: `Hi ${name},\n\nYour ${BRAND} verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.\n\nIf you didn't create an account, ignore this email.`,
  };
}

export function passwordResetOtpTemplate(name: string, code: string): Template {
  return {
    subject: `${code} is your ${BRAND} password reset code`,
    html: layout(
      "Reset your password",
      `<p>Hi ${esc(name)}, use the code below to choose a new password.</p>
       ${codeBlock(code)}
       <p>This code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>.</p>
       <p style="color:${C.muted};">If you didn't ask to reset your password, ignore this email — your current password still works.</p>`,
      { label: "Reset your password", url: `${appConfig.url}/reset-password` },
    ),
    text: `Hi ${name},\n\nYour ${BRAND} password reset code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.\n\nIf you didn't request this, ignore this email — your current password still works.`,
  };
}

/**
 * Sent when an account locks itself after too many failed sign-ins.
 *
 * Carries the code rather than only the news, because the two are the same
 * errand: the lock is asking the mailbox to prove itself, and this is the
 * mailbox. It also doubles as the warning that somebody was guessing — which
 * is why it never suggests ignoring the message.
 */
export function accountLockedTemplate(name: string, code: string): Template {
  return {
    subject: `${code} is your ${BRAND} unlock code`,
    html: layout(
      "Your account is locked",
      `<p>Hi ${esc(name)}, there have been ${MAX_LOGIN_ATTEMPTS} failed sign-in attempts on your ${BRAND} account, so we've locked it. Use the code below to verify your email address and unlock it.</p>
       ${codeBlock(code)}
       <p>This code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>. Your password still works — it is the lock, not the password, that is stopping you signing in.</p>
       <p style="color:${C.muted};">If those attempts weren't you, somebody is guessing at your password. Unlock your account, then change it.</p>`,
      { label: "Unlock your account", url: `${appConfig.url}/verify-email` },
    ),
    text: `Hi ${name},\n\nThere have been ${MAX_LOGIN_ATTEMPTS} failed sign-in attempts on your ${BRAND} account, so it has been locked.\n\nYour unlock code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. Enter it at ${appConfig.url}/verify-email.\n\nIf those attempts weren't you, change your password once you're back in.`,
  };
}

export function passwordChangedTemplate(name: string): Template {
  return {
    subject: "Your password was changed",
    html: layout(
      "Password changed",
      `<p>Hi ${esc(name)}, your ${BRAND} password was just changed.</p>
       <p style="color:${C.muted};">If this wasn't you, reset your password immediately and contact your HR administrator.</p>`,
      { label: "Go to sign in", url: `${appConfig.url}/login` },
    ),
    text: `Hi ${name},\n\nYour ${BRAND} password was just changed. If this wasn't you, reset it immediately and contact your HR administrator.`,
  };
}

export function adminDecisionTemplate(name: string, approved: boolean): Template {
  return approved
    ? {
        subject: "Your administrator access is approved",
        html: layout(
          "Administrator access approved",
          `<p>Hi ${esc(name)}, your administrator request has been approved. You can sign in now.</p>`,
          { label: "Go to admin sign in", url: `${appConfig.url}/admin/login` },
        ),
        text: `Hi ${name}, your administrator request has been approved. Sign in at ${appConfig.url}/admin/login.`,
      }
    : {
        subject: "Your administrator request was declined",
        html: layout(
          "Administrator request declined",
          `<p>Hi ${esc(name)}, your administrator request was declined.</p>
           <p style="color:${C.muted};">If you believe this is a mistake, contact your super administrator.</p>`,
        ),
        text: `Hi ${name}, your administrator request was declined. Contact your super administrator if you believe this is a mistake.`,
      };
}

export function emailVerifiedTemplate(name: string): Template {
  return {
    subject: "Your email is verified",
    html: layout(
      "Email verified",
      `<p>Thanks ${esc(name)} — your email address is confirmed and your account is active.</p>
       <p>Next, complete your profile so your attendance and leave records sit with the right department.</p>`,
      { label: "Complete your profile", url: `${appConfig.url}/profile/setup` },
    ),
    text: `Thanks ${name} — your email is verified. Complete your profile at ${appConfig.url}/profile/setup.`,
  };
}

/** A request may cover several consecutive days, so the range is reported. */
export function leaveApprovedTemplate(name: string, dates: Date[], reason: string, remaining: number): Template {
  const range = formatDateRange(dates);
  const dayCount = `${dates.length} day${dates.length === 1 ? "" : "s"}`;

  return {
    subject: `Leave approved for ${range}`,
    html: layout(
      "Your leave has been approved",
      `<p>Hi ${esc(name)}, your leave request has been approved.</p>
       ${detailTable([
         ["Dates", `${range} (${dayCount})`],
         ["Reason", reason],
       ])}
       <p>You have <strong>${remaining} of ${MONTHLY_LEAVE_ALLOWANCE}</strong> leaves remaining this month.</p>`,
      { label: "View leave history", url: `${appConfig.url}/leaves` },
    ),
    text: `Hi ${name}, your leave on ${range} (${dayCount}, ${reason}) has been approved. You have ${remaining} of ${MONTHLY_LEAVE_ALLOWANCE} leaves remaining this month.`,
  };
}

// A "your leave was declined" template used to live here. Nothing can send one
// any more: a request that does not fit the allowance is refused in the chat
// before a row is written, so the employee is told there and then rather than
// by email afterwards, and no administrator can decline one that did fit.

/**
 * The office-closed announcement, sent the day before to everyone on the books.
 *
 * It says "tomorrow" without hedging because it is only ever sent the day
 * before — an announcement whose moment has passed is skipped rather than sent
 * late, so this wording cannot go out on the day itself. It states the two
 * things people would otherwise write in to ask: that no attendance is expected,
 * and that the day does not come out of their leave.
 */
export function officeClosedTemplate(options: {
  name: string;
  weekday: string;
  date: Date;
  reason: string;
}): Template {
  const longDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(options.date);

  return {
    subject: `Office closed tomorrow — ${options.reason}`,
    html: layout(
      "The office is closed tomorrow",
      `<p>Hello ${esc(options.name)},</p>
       <p>Please be informed that the office will be closed tomorrow, <strong>${esc(longDate)}</strong>, for ${esc(options.reason)}.</p>
       ${detailTable([
         ["Day", options.weekday],
         ["Date", longDate],
         ["Reason", options.reason],
       ])}
       <p>No attendance is required on this day, and it will not be counted as leave or absence.</p>
       <p>Enjoy the holiday!</p>
       <p style="color:${C.muted};">Regards,<br />${BRAND}</p>`,
    ),
    text: `Hello ${options.name},\n\nPlease be informed that the office will be closed tomorrow, ${longDate}, for ${options.reason}.\n\nNo attendance is required on this day, and it will not be counted as leave or absence.\n\nEnjoy the holiday!\n\nRegards,\n${BRAND}`,
  };
}

/**
 * The warning letter for a working day that went unmarked.
 *
 * Written to be answerable rather than merely stern: it says which day, what the
 * deadline was, and what to do about it, because the commonest cause of one of
 * these is somebody who was at their desk and forgot to press the button.
 *
 * The run of missed days is stated only when there is one — a person on their
 * fourth in a row is in a different conversation from a person on their first.
 * Closures and approved leave never count towards it, and the letter says so, so
 * the number can be defended when somebody writes back to argue with it.
 */
export function attendanceWarningTemplate(options: {
  name: string;
  date: Date;
  cutoffLabel: string;
  consecutiveMissed: number;
}): Template {
  const longDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(options.date);

  const repeated = options.consecutiveMissed > 1;

  const runHtml = repeated
    ? `<p>Our records show this is the <strong>${esc(ordinal(options.consecutiveMissed))} working day in a row</strong> with no attendance recorded. Office closures and approved leave are not counted towards this.</p>`
    : "";

  const runText = repeated
    ? `\n\nOur records show this is the ${ordinal(options.consecutiveMissed)} working day in a row with no attendance recorded. Office closures and approved leave are not counted towards this.`
    : "";

  return {
    subject: repeated
      ? `Attendance warning — ${options.consecutiveMissed} working days missed`
      : "Attendance warning — no attendance recorded",
    html: layout(
      "Attendance warning",
      `<p>Hello ${esc(options.name)},</p>
       <p>No attendance was recorded for you on <strong>${esc(longDate)}</strong>. Attendance had to be marked from the office by <strong>${esc(options.cutoffLabel)}</strong>.</p>
       ${runHtml}
       <p>If you were at work, please remember to mark yourself present from your dashboard while you are at the office. If you were unable to attend, speak to your administrator so the record can be corrected.</p>
       <p style="color:${C.muted};font-size:13px;">This is an automated notice, sent after the day's deadline had passed.</p>
       <p style="color:${C.muted};">Regards,<br />${BRAND}</p>`,
    ),
    text: `Hello ${options.name},\n\nNo attendance was recorded for you on ${longDate}. Attendance had to be marked from the office by ${options.cutoffLabel}.${runText}\n\nIf you were at work, please remember to mark yourself present from your dashboard while you are at the office. If you were unable to attend, speak to your administrator so the record can be corrected.\n\nThis is an automated notice, sent after the day's deadline had passed.\n\nRegards,\n${BRAND}`,
  };
}

/**
 * A message somebody wrote by hand, in the same envelope as everything else.
 *
 * `body` arrives as HTML and is interpolated **unescaped** — the only place in
 * this file that happens, and the reason `custom-email.service.ts` runs it
 * through the allowlist in `sanitize-html.ts` first. Nothing else here may
 * follow that pattern: every other value is user data and is escaped.
 *
 * The sender is named in the body rather than in the From header. The header
 * stays the company mailbox so replies reach a monitored address and the domain's
 * SPF record keeps passing, but a recipient still needs to know which person
 * wrote to them.
 */
export function customEmailTemplate(options: {
  recipientName: string;
  senderName: string;
  subject: string;
  /** Already sanitised. See `sanitizeEmailHtml`. */
  html: string;
  /** Derived from the sanitised markup, never from what the composer submitted. */
  text: string;
}): Template {
  return {
    subject: options.subject,
    html: layout(
      options.subject,
      `<p>Hello ${esc(options.recipientName)},</p>
       <div style="margin:16px 0;">${options.html}</div>
       <p style="color:${C.muted};margin-top:24px;">Sent by ${esc(options.senderName)}</p>`,
    ),
    text: `Hello ${options.recipientName},\n\n${options.text}\n\nSent by ${options.senderName}\n\n—\n${BRAND}`,
  };
}

export function profileUpdatedTemplate(name: string, changedBy: "you" | "an administrator"): Template {
  return {
    subject: "Your profile was updated",
    html: layout(
      "Profile updated",
      `<p>Hi ${esc(name)}, your profile details were updated by ${esc(changedBy)}.</p>
       <p>If you didn't expect this change, please contact your HR administrator right away.</p>`,
      { label: "Review your profile", url: `${appConfig.url}/profile` },
    ),
    text: `Hi ${name}, your ${BRAND} profile was updated by ${changedBy}. If this wasn't expected, contact HR.`,
  };
}

export function accountStatusTemplate(name: string, suspended: boolean): Template {
  return {
    subject: suspended ? "Your account has been suspended" : "Your account has been reactivated",
    html: layout(
      suspended ? "Account suspended" : "Account reactivated",
      suspended
        ? `<p>Hi ${esc(name)}, your account has been suspended by an administrator. You will not be able to sign in, mark attendance, or submit leave requests until it is reactivated.</p>
           <p>Please contact your HR administrator for details.</p>`
        : `<p>Hi ${esc(name)}, your account is active again. You can sign in, mark your attendance, and submit leave requests as usual.</p>`,
      suspended ? undefined : { label: "Sign in", url: `${appConfig.url}/login` },
    ),
    text: suspended
      ? `Hi ${name}, your ${BRAND} account has been suspended. Contact HR for details.`
      : `Hi ${name}, your ${BRAND} account has been reactivated. Sign in at ${appConfig.url}/login.`,
  };
}
