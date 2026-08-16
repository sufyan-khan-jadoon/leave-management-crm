/**
 * Who may write to whom, as arithmetic.
 *
 * Extracted from `custom-email.service.ts` for the reason `geo.ts` and
 * `working-days.ts` were: this is the security rule of the whole feature, and a
 * rule that can only be exercised by standing up a database and a mail server is
 * a rule nobody exercises. Everything here is a pure function of a role and two
 * booleans, so `email-audience.test.ts` can enumerate the entire matrix — every
 * caller against every audience — and prove there is no combination that widens.
 *
 * The service still decides *nothing* on its own: it reads the grants fresh from
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
  SELECTED_ADMINS: "SELECTED_ADMINS",
  ALL_MEMBERS: "ALL_MEMBERS",
} as const satisfies Record<EmailAudience, EmailAudience>;

export type Audience = (typeof EMAIL_AUDIENCE)[keyof typeof EMAIL_AUDIENCE];

/**
 * The two grants that decide what an administrator may address.
 *
 * Taken as one object rather than as positional booleans because there are now
 * two of them and a call site that swapped them would still compile — which is
 * the shape of mistake this file exists to make impossible.
 */
export type EmailGrants = {
  /** Writing to the staff: one employee at a time, or all of them. */
  canSendEmails: boolean;
  /** Writing to the other administrators, as a group or hand-picked. */
  canEmailAdmins: boolean;
};

/** Nothing granted. Handy where a caller's grants are irrelevant by role. */
export const NO_EMAIL_GRANTS: EmailGrants = { canSendEmails: false, canEmailAdmins: false };

/**
 * Everything the super admin may address.
 *
 * All five, and the only list containing ALL_MEMBERS. Nothing derives a wider
 * set than this one.
 */
export const SUPER_ADMIN_AUDIENCES: Audience[] = [
  EMAIL_AUDIENCE.INDIVIDUAL,
  EMAIL_AUDIENCE.EMPLOYEES,
  EMAIL_AUDIENCE.ADMINS,
  EMAIL_AUDIENCE.SELECTED_ADMINS,
  EMAIL_AUDIENCE.ALL_MEMBERS,
];

/**
 * What `canSendEmails` buys.
 *
 * Writing to one person, or to the employees. Note that INDIVIDUAL appears here
 * but is *narrowed* by the second grant rather than by this one — see
 * `individualRecipientRoles`. Without `canEmailAdmins` the picker behind it
 * offers employees only, so this grant on its own can never reach a colleague.
 */
export const DELEGATED_AUDIENCES: Audience[] = [EMAIL_AUDIENCE.INDIVIDUAL, EMAIL_AUDIENCE.EMPLOYEES];

/**
 * What `canEmailAdmins` buys.
 *
 * Every administrator at once, or a hand-picked set of them. Deliberately a
 * separate grant from the one above: writing to the people who run the system is
 * a different act from writing to the staff, and an administrator handed the
 * second must not silently acquire the first.
 */
export const ADMIN_AUDIENCES: Audience[] = [
  EMAIL_AUDIENCE.ADMINS,
  EMAIL_AUDIENCE.SELECTED_ADMINS,
];

/**
 * Audiences reserved to the super admin, stated positively for the tests.
 *
 * One left, and it is the one that includes the owner. An announcement to the
 * entire organisation stays with whoever owns it; this list is deliberately not
 * empty, and a grant that emptied it would be a grant that made the super admin
 * redundant.
 */
export const RESERVED_AUDIENCES: Audience[] = [EMAIL_AUDIENCE.ALL_MEMBERS];

/**
 * The audiences one caller may use.
 *
 * The grants are meaningless for anyone who is not an administrator and are
 * ignored for the super admin, who may always send — the same shape
 * `canInviteEmployees` and `canManageHolidays` take. An employee gets nothing
 * whatever the flags say, because the flags are only ever set on administrators.
 *
 * The two grants compose rather than nest: neither is a prerequisite for the
 * other, so an administrator may hold either alone and get exactly that half.
 * Requiring `canSendEmails` underneath would mean a super admin flipping the
 * admin switch on its own saw nothing happen, which is a trap rather than a
 * safeguard.
 */
export function permittedAudiences(role: Role | string, grants: EmailGrants): Audience[] {
  if (isSuperAdminRole(role)) return [...SUPER_ADMIN_AUDIENCES];
  if (role !== ROLE.ADMIN) return [];

  return [
    ...(grants.canSendEmails ? DELEGATED_AUDIENCES : []),
    ...(grants.canEmailAdmins ? ADMIN_AUDIENCES : []),
  ];
}

/** Whether this caller may send to this audience at all. */
export function mayUseAudience(
  role: Role | string,
  grants: EmailGrants,
  audience: Audience,
): boolean {
  return permittedAudiences(role, grants).includes(audience);
}

/** Whether this caller may send anything, to anybody. */
export function maySendAnything(role: Role | string, grants: EmailGrants): boolean {
  return permittedAudiences(role, grants).length > 0;
}

/**
 * Whether this caller may address administrators by any route at all.
 *
 * The single question behind the admin recipient picker and behind the
 * narrowing in `individualRecipientRoles`, so the list somebody is offered and
 * the set the server will accept are computed from one place.
 */
export function mayEmailAdmins(role: Role | string, grants: EmailGrants): boolean {
  if (isSuperAdminRole(role)) return true;

  return role === ROLE.ADMIN && grants.canEmailAdmins;
}

/**
 * Which roles a bulk audience resolves to.
 *
 * ALL_MEMBERS includes the super admin: an audience called "everyone" that
 * quietly omitted the owner would be a lie, and it is theirs alone to send.
 * ADMINS and SELECTED_ADMINS resolve to `ADMIN` alone — the owner is not part of
 * a population a delegated administrator may write to as a group, and the sender
 * is excluded from their own send a layer up regardless.
 *
 * INDIVIDUAL is absent because it resolves to one named person rather than a
 * population — see `individualRecipientRoles`.
 */
export function audienceRoles(audience: Exclude<Audience, "INDIVIDUAL">): Role[] {
  if (audience === EMAIL_AUDIENCE.EMPLOYEES) return [ROLE.EMPLOYEE];
  if (audience === EMAIL_AUDIENCE.ADMINS || audience === EMAIL_AUDIENCE.SELECTED_ADMINS) {
    return [ROLE.ADMIN];
  }

  return [ROLE.EMPLOYEE, ROLE.ADMIN, ROLE.SUPER_ADMIN];
}

/**
 * Who a caller may pick from, one at a time.
 *
 * Employees for any administrator who may send at all — and their colleagues
 * **only once `canEmailAdmins` says so**. That narrowing is the whole reason the
 * grant is a boundary rather than a convenience: a permission to write to
 * administrators that could be walked around by writing to them one at a time
 * would not be a permission at all, and this endpoint is reachable by hand.
 *
 * Never the super admin unless you are them, which mirrors the rule keeping
 * SUPER_ADMIN out of `employeeQuerySchema`: an account that cannot be listed
 * should not become discoverable through a recipient picker instead.
 */
export function individualRecipientRoles(role: Role | string, grants: EmailGrants): Role[] {
  if (isSuperAdminRole(role)) return [ROLE.EMPLOYEE, ROLE.ADMIN, ROLE.SUPER_ADMIN];
  if (role !== ROLE.ADMIN) return [];

  return grants.canEmailAdmins ? [ROLE.EMPLOYEE, ROLE.ADMIN] : [ROLE.EMPLOYEE];
}
