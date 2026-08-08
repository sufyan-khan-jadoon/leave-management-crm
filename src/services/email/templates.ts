import type { Role } from "@prisma/client";

import { appConfig } from "@/lib/env";
import { MAX_LOGIN_ATTEMPTS, MONTHLY_LEAVE_ALLOWANCE, OTP_TTL_MINUTES } from "@/lib/constants";
import { formatDate, formatDateRange } from "@/lib/date";

type Template = { subject: string; html: string; text: string };

const BRAND = "#5b5bd6";

/** Escapes user-supplied values before they are interpolated into HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(heading: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(24,24,60,0.08);">
            <tr>
              <td style="background:${BRAND};padding:24px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.2px;">${esc(appConfig.name)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:#16192b;">${esc(heading)}</h1>
                <div style="font-size:15px;line-height:1.65;color:#4a4f68;">${body}</div>
                ${
                  cta
                    ? `<div style="margin-top:28px;">
                         <a href="${esc(cta.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;">${esc(cta.label)}</a>
                       </div>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #eceef6;font-size:12px;color:#8b90a8;">
                This is an automated message from ${esc(appConfig.name)}. Please do not reply.
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
    subject: `Welcome to ${appConfig.name}`,
    html: layout(
      `Welcome aboard, ${esc(name)}!`,
      `<p>Your account has been created successfully.</p>
       <p>We've sent a separate email with your 6-digit verification code. Enter it to activate your account, then complete your profile to start requesting leave.</p>
       <p>You can request leave in plain English — just describe it, and our assistant will handle the rest.</p>`,
      { label: "Go to sign in", url: `${appConfig.url}/login` },
    ),
    text: `Welcome aboard, ${name}!\n\nYour ${appConfig.name} account has been created. Check your inbox for a 6-digit verification code, then sign in at ${appConfig.url}/login.`,
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

  const detail = (label: string, value: string) =>
    `<tr><td style="padding:14px 18px;border-bottom:1px solid #eceef6;color:#8b90a8;font-size:13px;">${esc(label)}</td><td style="padding:14px 18px;border-bottom:1px solid #eceef6;font-weight:600;color:#16192b;">${esc(value)}</td></tr>`;

  return {
    subject: `You're invited to ${appConfig.name}`,
    html: layout(
      `You've been invited to ${esc(appConfig.name)}`,
      `<p>${esc(options.inviterName)} has invited you to join ${esc(appConfig.name)}, where you'll request and track your leave.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;border:1px solid #eceef6;border-radius:12px;">
         ${detail("Your role", roleLabel)}
         ${options.jobTitle ? detail("Your job title", options.jobTitle) : ""}
         ${detail("Invitation valid until", expiry)}
       </table>
       <p>Use the button below to create your account. It's tied to this email address, so register with the address this message was sent to.</p>
       ${
         isAdmin
           ? `<p>Once you've verified your email, a super administrator reviews your request before you can sign in.</p>`
           : `<p>Once you've verified your email, you can sign in straight away.</p>`
       }
       <p style="color:#8b90a8;">This invitation expires on ${esc(expiry)}. If it lapses, ask ${esc(options.inviterName)} to send another. If you weren't expecting it, you can ignore this email.</p>`,
      { label: "Accept invitation", url: options.url },
    ),
    text: `${options.inviterName} has invited you to join ${appConfig.name} as ${isAdmin ? "an administrator" : "an employee"}${options.jobTitle ? ` (${options.jobTitle})` : ""}.\n\nCreate your account here:\n${options.url}\n\nRegister with the address this message was sent to. The invitation expires on ${expiry}.`,
  };
}

export function otpTemplate(name: string, code: string): Template {
  return {
    subject: `${code} is your ${appConfig.name} verification code`,
    html: layout(
      "Verify your email address",
      `<p>Hi ${esc(name)}, use the code below to verify your email address.</p>
       <div style="margin:24px 0;padding:20px;background:#f4f5fb;border-radius:12px;text-align:center;">
         <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#16192b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(code)}</div>
       </div>
       <p>This code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>.</p>
       <p style="color:#8b90a8;">If you didn't create an account, you can safely ignore this email.</p>`,
    ),
    text: `Hi ${name},\n\nYour ${appConfig.name} verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.\n\nIf you didn't create an account, ignore this email.`,
  };
}

export function passwordResetOtpTemplate(name: string, code: string): Template {
  return {
    subject: `${code} is your ${appConfig.name} password reset code`,
    html: layout(
      "Reset your password",
      `<p>Hi ${esc(name)}, use the code below to choose a new password.</p>
       <div style="margin:24px 0;padding:20px;background:#f4f5fb;border-radius:12px;text-align:center;">
         <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#16192b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(code)}</div>
       </div>
       <p>This code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>.</p>
       <p style="color:#8b90a8;">If you didn't ask to reset your password, ignore this email — your current password still works.</p>`,
      { label: "Reset your password", url: `${appConfig.url}/reset-password` },
    ),
    text: `Hi ${name},\n\nYour ${appConfig.name} password reset code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.\n\nIf you didn't request this, ignore this email — your current password still works.`,
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
    subject: `${code} is your ${appConfig.name} unlock code`,
    html: layout(
      "Your account is locked",
      `<p>Hi ${esc(name)}, there have been ${MAX_LOGIN_ATTEMPTS} failed sign-in attempts on your ${esc(appConfig.name)} account, so we've locked it. Use the code below to verify your email address and unlock it.</p>
       <div style="margin:24px 0;padding:20px;background:#f4f5fb;border-radius:12px;text-align:center;">
         <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#16192b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(code)}</div>
       </div>
       <p>This code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>. Your password still works — it is the lock, not the password, that is stopping you signing in.</p>
       <p style="color:#8b90a8;">If those attempts weren't you, somebody is guessing at your password. Unlock your account, then change it.</p>`,
      { label: "Unlock your account", url: `${appConfig.url}/verify-email` },
    ),
    text: `Hi ${name},\n\nThere have been ${MAX_LOGIN_ATTEMPTS} failed sign-in attempts on your ${appConfig.name} account, so it has been locked.\n\nYour unlock code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. Enter it at ${appConfig.url}/verify-email.\n\nIf those attempts weren't you, change your password once you're back in.`,
  };
}

export function passwordChangedTemplate(name: string): Template {
  return {
    subject: "Your password was changed",
    html: layout(
      "Password changed",
      `<p>Hi ${esc(name)}, your ${esc(appConfig.name)} password was just changed.</p>
       <p style="color:#8b90a8;">If this wasn't you, reset your password immediately and contact your HR administrator.</p>`,
      { label: "Go to sign in", url: `${appConfig.url}/login` },
    ),
    text: `Hi ${name},\n\nYour ${appConfig.name} password was just changed. If this wasn't you, reset it immediately and contact your HR administrator.`,
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
           <p style="color:#8b90a8;">If you believe this is a mistake, contact your super administrator.</p>`,
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
       <p>Next, complete your profile so your leave requests route to the right department.</p>`,
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
       <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;border:1px solid #eceef6;border-radius:12px;">
         <tr><td style="padding:14px 18px;border-bottom:1px solid #eceef6;color:#8b90a8;font-size:13px;">Dates</td><td style="padding:14px 18px;border-bottom:1px solid #eceef6;font-weight:600;color:#16192b;">${esc(range)} (${esc(dayCount)})</td></tr>
         <tr><td style="padding:14px 18px;color:#8b90a8;font-size:13px;">Reason</td><td style="padding:14px 18px;font-weight:600;color:#16192b;">${esc(reason)}</td></tr>
       </table>
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

export function profileUpdatedTemplate(name: string, changedBy: "you" | "an administrator"): Template {
  return {
    subject: "Your profile was updated",
    html: layout(
      "Profile updated",
      `<p>Hi ${esc(name)}, your profile details were updated by ${esc(changedBy)}.</p>
       <p>If you didn't expect this change, please contact your HR administrator right away.</p>`,
      { label: "Review your profile", url: `${appConfig.url}/profile` },
    ),
    text: `Hi ${name}, your ${appConfig.name} profile was updated by ${changedBy}. If this wasn't expected, contact HR.`,
  };
}

export function accountStatusTemplate(name: string, suspended: boolean): Template {
  return {
    subject: suspended ? "Your account has been suspended" : "Your account has been reactivated",
    html: layout(
      suspended ? "Account suspended" : "Account reactivated",
      suspended
        ? `<p>Hi ${esc(name)}, your account has been suspended by an administrator. You will not be able to sign in or submit leave requests until it is reactivated.</p>
           <p>Please contact your HR administrator for details.</p>`
        : `<p>Hi ${esc(name)}, your account is active again. You can sign in and submit leave requests as usual.</p>`,
      suspended ? undefined : { label: "Sign in", url: `${appConfig.url}/login` },
    ),
    text: suspended
      ? `Hi ${name}, your ${appConfig.name} account has been suspended. Contact HR for details.`
      : `Hi ${name}, your ${appConfig.name} account has been reactivated. Sign in at ${appConfig.url}/login.`,
  };
}
