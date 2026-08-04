import { SignJWT, jwtVerify } from "jose";

import { OTP_TTL_MINUTES, RESET_TICKET_COOKIE } from "@/lib/constants";
import { serverEnv } from "@/lib/env";

/**
 * Proof that a reset code was entered correctly.
 *
 * The code-entry and password steps are separate pages, so something has to
 * carry that proof across the navigation. A signed httpOnly cookie is used
 * rather than a query parameter: the code would otherwise sit in the URL bar,
 * browser history and any referrer header.
 *
 * The ticket names the exact OTP row it was issued for, so it cannot outlive
 * that code — spending or reissuing the code invalidates the ticket too.
 */
export { RESET_TICKET_COOKIE };

export type ResetTicket = {
  employeeId: string;
  otpId: string;
  email: string;
};

function secret(): Uint8Array {
  return new TextEncoder().encode(serverEnv().NEXTAUTH_SECRET);
}

export async function signResetTicket(ticket: ResetTicket): Promise<string> {
  return new SignJWT({ ...ticket })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    // Matches the code's own lifetime; the password step cannot outlast it.
    .setExpirationTime(`${OTP_TTL_MINUTES}m`)
    .sign(secret());
}

export async function readResetTicket(token: string | undefined): Promise<ResetTicket | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    const { employeeId, otpId, email } = payload as Partial<ResetTicket>;

    if (!employeeId || !otpId || !email) return null;

    return { employeeId, otpId, email };
  } catch {
    // Tampered, expired or signed with a rotated secret — all mean "start over".
    return null;
  }
}

/** Cookie attributes shared by the set and clear paths so they always match. */
export function resetTicketCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export const RESET_TICKET_MAX_AGE = OTP_TTL_MINUTES * 60;
