import { appConfig } from "@/lib/env";
import { MONTHLY_LEAVE_ALLOWANCE, OTP_TTL_MINUTES } from "@/lib/constants";
import { formatDate } from "@/lib/date";

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

export function leaveApprovedTemplate(name: string, leaveDate: Date, reason: string, remaining: number): Template {
  return {
    subject: `Leave approved for ${formatDate(leaveDate)}`,
    html: layout(
      "Your leave has been approved",
      `<p>Hi ${esc(name)}, your leave request has been approved.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;border:1px solid #eceef6;border-radius:12px;">
         <tr><td style="padding:14px 18px;border-bottom:1px solid #eceef6;color:#8b90a8;font-size:13px;">Date</td><td style="padding:14px 18px;border-bottom:1px solid #eceef6;font-weight:600;color:#16192b;">${esc(formatDate(leaveDate))}</td></tr>
         <tr><td style="padding:14px 18px;color:#8b90a8;font-size:13px;">Reason</td><td style="padding:14px 18px;font-weight:600;color:#16192b;">${esc(reason)}</td></tr>
       </table>
       <p>You have <strong>${remaining} of ${MONTHLY_LEAVE_ALLOWANCE}</strong> leaves remaining this month.</p>`,
      { label: "View leave history", url: `${appConfig.url}/leaves` },
    ),
    text: `Hi ${name}, your leave on ${formatDate(leaveDate)} (${reason}) has been approved. You have ${remaining} of ${MONTHLY_LEAVE_ALLOWANCE} leaves remaining this month.`,
  };
}

export function leaveRejectedTemplate(name: string, leaveDate: Date, reason: string, explanation: string): Template {
  return {
    subject: `Leave request declined for ${formatDate(leaveDate)}`,
    html: layout(
      "Your leave request was declined",
      `<p>Hi ${esc(name)}, unfortunately your leave request could not be approved.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;width:100%;border:1px solid #eceef6;border-radius:12px;">
         <tr><td style="padding:14px 18px;border-bottom:1px solid #eceef6;color:#8b90a8;font-size:13px;">Date</td><td style="padding:14px 18px;border-bottom:1px solid #eceef6;font-weight:600;color:#16192b;">${esc(formatDate(leaveDate))}</td></tr>
         <tr><td style="padding:14px 18px;color:#8b90a8;font-size:13px;">Reason</td><td style="padding:14px 18px;font-weight:600;color:#16192b;">${esc(reason)}</td></tr>
       </table>
       <p style="padding:14px 18px;background:#fff5f5;border-left:3px solid #e5484d;border-radius:6px;color:#16192b;">${esc(explanation)}</p>`,
      { label: "View leave history", url: `${appConfig.url}/leaves` },
    ),
    text: `Hi ${name}, your leave request for ${formatDate(leaveDate)} (${reason}) was declined.\n\n${explanation}`,
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
