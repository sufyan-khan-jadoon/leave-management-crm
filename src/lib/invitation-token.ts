import { createHash, randomBytes } from "node:crypto";

/**
 * The secret carried by an invitation link.
 *
 * Deliberately not a JWT like the reset ticket: that one proves something to
 * the same browser a moment later and is meant to be self-contained, whereas
 * this has to be single-use and withdrawable — an administrator who cancels an
 * invitation expects the link in that mailbox to stop working immediately. Only
 * a row in the database can say that, so the token is a plain random string
 * looked up against one.
 *
 * 32 bytes is far beyond guessing, which is what lets the link stand alone as
 * proof: there is nothing else for the recipient to type.
 */
const TOKEN_BYTES = 32;

export function generateInvitationToken(): { token: string; tokenHash: string } {
  // base64url: safe in a query string without escaping, and shorter than hex,
  // so the link survives being wrapped by a mail client.
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  return { token, tokenHash: hashInvitationToken(token) };
}

/**
 * Hashes a token for storage and lookup.
 *
 * Unsalted SHA-256 rather than bcrypt: the input is 256 bits of entropy, so
 * there is no dictionary to defend against, and the hash has to be searchable
 * by equality for the lookup to be a single indexed query.
 */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
