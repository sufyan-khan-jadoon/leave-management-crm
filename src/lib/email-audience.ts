/**
 * Who may write to whom, as arithmetic.
 *
 * Extracted from `custom-email.service.ts` for the reason `geo.ts` and
 * `working-days.ts` were: this is the security rule of the whole feature, and a
 * rule that can only be exercised by standing up a database and a mail server is
 * a rule nobody exercises. Everything here is a pure function of a role and a
 * boolean, so `email-audience.test.ts` can enumerate the entire matrix — every
 * caller against every audience — and prove there is no combination that widens.
 *
 * The service still decides *nothing* on its own: it reads the grant fresh from
 * the database on every send and asks these functions, so the answer here is the
 * answer there. Prisma-free on purpose — the string literals mirror the enums the
 * same way `enums.ts` does, locked to them with `satisfies` at the call site.
 */
import type { EmailAudience, Role } from "@prisma/client";

import { ROLE, isSuperAdminRole } from "@/lib/enums";

export const EMAIL_AUDIENCE = {
  INDIVIDUAL: "INDIVIDUAL",
  EMPLOYEES: "EMPLOYEES",
  ADMINS: "ADMINS",
  ALL_MEMBERS: "ALL_MEMBERS",
} as const satisfies Record<EmailAudience, EmailAudience>;

export type Audience = (typeof EMAIL_AUDIENCE)[keyof typeof EMAIL_AUDIENCE];

/**
 * Everything the super admin may address.
 *
 * All four, and this is the only list that contains the broadcast pair. Nothing
 * derives a wider set than this one.
 */
export const SUPER_ADMIN_AUDIENCES: Audience[] = [
  EMAIL_AUDIENCE.INDIVIDUAL,
  EMAIL_AUDIENCE.EMPLOYEES,
  EMAIL_AUDIENCE.ADMINS,
  EMAIL_AUDIENCE.ALL_MEMBERS,
];

/**
 * What the grant actually buys an administrator.
 *
 * The two narrow audiences and never the two broad ones. Writing to one person,
 * or to the employees, is ordinary people-management; writing to every
 * administrator or to the entire organisation in one act is an announcement that
 * has to answer to whoever owns the system, so it stays with them. An
 * administrator cannot reach past this by asking — the set is built from their
 * role here rather than compared against anything they sent.
 */
export const DELEGATED_AUDIENCES: Audience[] = [EMAIL_AUDIENCE.INDIVIDUAL, EMAIL_AUDIENCE.EMPLOYEES];

/** Audiences reserved to the super admin, stated positively for the tests to hold onto. */
export const RESERVED_AUDIENCES: Audience[] = [EMAIL_AUDIENCE.ADMINS, EMAIL_AUDIENCE.ALL_MEMBERS];

/**
 * The audiences one caller may use.
 *
 * `canSendEmails` is meaningless for anyone who is not an administrator and is
 * ignored for the super admin, who may always send — the same shape
 * `canInviteEmployees` and `canManageHolidays` take. An employee gets nothing
 * whatever the flag says, because the flag is only ever set on administrators.
 */
export function permittedAudiences(role: Role | string, canSendEmails: boolean): Audience[] {
  if (isSuperAdminRole(role)) return [...SUPER_ADMIN_AUDIENCES];
  if (role !== ROLE.ADMIN) return [];

  return canSendEmails ? [...DELEGATED_AUDIENCES] : [];
}

/** Whether this caller may send to this audience at all. */
export function mayUseAudience(
  role: Role | string,
  canSendEmails: boolean,
  audience: Audience,
): boolean {
  return permittedAudiences(role, canSendEmails).includes(audience);
}

/** Whether this caller may send anything, to anybody. */
export function maySendAnything(role: Role | string, canSendEmails: boolean): boolean {
  return permittedAudiences(role, canSendEmails).length > 0;
}

/**
 * Which roles a bulk audience resolves to.
 *
 * ALL_MEMBERS includes the super admin: an audience called "everyone" that
 * quietly omitted the owner would be a lie, and it is theirs alone to send.
 * INDIVIDUAL is absent because it resolves to one named person rather than a
 * population — see `individualRecipientRoles`.
 */
export function audienceRoles(audience: Exclude<Audience, "INDIVIDUAL">): Role[] {
  if (audience === EMAIL_AUDIENCE.EMPLOYEES) return [ROLE.EMPLOYEE];
  if (audience === EMAIL_AUDIENCE.ADMINS) return [ROLE.ADMIN];

  return [ROLE.EMPLOYEE, ROLE.ADMIN, ROLE.SUPER_ADMIN];
}

/**
 * Who a caller may pick from, one at a time.
 *
 * Employees and administrators for everybody — but never the super admin unless
 * you are them. That mirrors the rule keeping SUPER_ADMIN out of
 * `employeeQuerySchema`: an account that cannot be listed should not become
 * discoverable through a recipient picker instead.
 */
export function individualRecipientRoles(role: Role | string): Role[] {
  return isSuperAdminRole(role)
    ? [ROLE.EMPLOYEE, ROLE.ADMIN, ROLE.SUPER_ADMIN]
    : [ROLE.EMPLOYEE, ROLE.ADMIN];
}
