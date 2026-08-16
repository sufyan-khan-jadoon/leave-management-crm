/**
 * The whole permission matrix, enumerated.
 *
 * This is the security rule of the custom-email feature, so it is not tested by
 * example — every combination of caller and audience is generated and asserted,
 * which is the only way to be sure no pairing widens by accident. The interesting
 * assertions are the negative ones: an administrator holding both grants is still
 * refused ALL_MEMBERS, an administrator holding only `canSendEmails` cannot reach
 * a colleague by *any* route including the one-person picker, and an employee is
 * refused everything however the flags are set.
 */
import { describe, expect, it } from "vitest";

import {
  ADMIN_AUDIENCES,
  DELEGATED_AUDIENCES,
  EMAIL_AUDIENCE,
  NO_EMAIL_GRANTS,
  RESERVED_AUDIENCES,
  SUPER_ADMIN_AUDIENCES,
  audienceRoles,
  individualRecipientRoles,
  mayEmailAdmins,
  mayUseAudience,
  maySendAnything,
  permittedAudiences,
  type Audience,
  type EmailGrants,
} from "@/lib/email-audience";
import { ROLE } from "@/lib/enums";

const ALL_AUDIENCES: Audience[] = [
  EMAIL_AUDIENCE.INDIVIDUAL,
  EMAIL_AUDIENCE.EMPLOYEES,
  EMAIL_AUDIENCE.ADMINS,
  EMAIL_AUDIENCE.SELECTED_ADMINS,
  EMAIL_AUDIENCE.ALL_MEMBERS,
];

const grants = (canSendEmails: boolean, canEmailAdmins: boolean): EmailGrants => ({
  canSendEmails,
  canEmailAdmins,
});

/**
 * Every caller the system can produce, at every setting of the two grants.
 *
 * The administrator appears four times rather than twice, because the grants
 * compose: each is meant to be usable alone, and "alone" is exactly the pairing
 * a bug would collapse into the other.
 */
const CALLERS = [
  { label: "super admin", role: ROLE.SUPER_ADMIN, grants: NO_EMAIL_GRANTS },
  { label: "super admin (flags set)", role: ROLE.SUPER_ADMIN, grants: grants(true, true) },
  { label: "admin with no grant", role: ROLE.ADMIN, grants: NO_EMAIL_GRANTS },
  { label: "admin who may email staff", role: ROLE.ADMIN, grants: grants(true, false) },
  { label: "admin who may email admins", role: ROLE.ADMIN, grants: grants(false, true) },
  { label: "admin with both grants", role: ROLE.ADMIN, grants: grants(true, true) },
  { label: "employee", role: ROLE.EMPLOYEE, grants: NO_EMAIL_GRANTS },
  { label: "employee (flags set)", role: ROLE.EMPLOYEE, grants: grants(true, true) },
] as const;

/** The matrix, written out so a change to the rule has to change this table too. */
const EXPECTED: Record<string, Audience[]> = {
  "super admin": ALL_AUDIENCES,
  "super admin (flags set)": ALL_AUDIENCES,
  "admin with no grant": [],
  "admin who may email staff": [EMAIL_AUDIENCE.INDIVIDUAL, EMAIL_AUDIENCE.EMPLOYEES],
  "admin who may email admins": [EMAIL_AUDIENCE.ADMINS, EMAIL_AUDIENCE.SELECTED_ADMINS],
  "admin with both grants": [
    EMAIL_AUDIENCE.INDIVIDUAL,
    EMAIL_AUDIENCE.EMPLOYEES,
    EMAIL_AUDIENCE.ADMINS,
    EMAIL_AUDIENCE.SELECTED_ADMINS,
  ],
  employee: [],
  "employee (flags set)": [],
};

describe("permittedAudiences — the full matrix", () => {
  for (const caller of CALLERS) {
    it(`${caller.label} may address exactly ${JSON.stringify(EXPECTED[caller.label])}`, () => {
      expect(permittedAudiences(caller.role, caller.grants).sort()).toEqual(
        [...EXPECTED[caller.label]!].sort(),
      );
    });
  }

  it("covers every caller the enum can produce", () => {
    // Guards the table above from going stale if a role is ever added.
    expect(new Set(CALLERS.map((c) => c.role))).toEqual(new Set(Object.values(ROLE)));
  });

  it("covers every audience the enum can produce", () => {
    expect(new Set(ALL_AUDIENCES)).toEqual(new Set(Object.values(EMAIL_AUDIENCE)));
  });
});

describe("mayUseAudience — every caller against every audience", () => {
  for (const caller of CALLERS) {
    for (const audience of ALL_AUDIENCES) {
      const allowed = EXPECTED[caller.label]!.includes(audience);

      it(`${caller.label} ${allowed ? "may" : "may NOT"} send to ${audience}`, () => {
        expect(mayUseAudience(caller.role, caller.grants, audience)).toBe(allowed);
      });
    }
  }
});

describe("the two grants compose rather than nest", () => {
  it("each is usable entirely on its own", () => {
    // The trap this guards: making `canEmailAdmins` depend on `canSendEmails`
    // would leave a super admin flipping one switch and seeing nothing happen.
    expect(maySendAnything(ROLE.ADMIN, grants(false, true))).toBe(true);
    expect(maySendAnything(ROLE.ADMIN, grants(true, false))).toBe(true);
  });

  it("neither leaks into the other's audiences", () => {
    for (const audience of ADMIN_AUDIENCES) {
      expect(mayUseAudience(ROLE.ADMIN, grants(true, false), audience)).toBe(false);
    }

    for (const audience of DELEGATED_AUDIENCES) {
      expect(mayUseAudience(ROLE.ADMIN, grants(false, true), audience)).toBe(false);
    }
  });

  it("holding both is exactly the union and nothing more", () => {
    expect(new Set(permittedAudiences(ROLE.ADMIN, grants(true, true)))).toEqual(
      new Set([...DELEGATED_AUDIENCES, ...ADMIN_AUDIENCES]),
    );
  });
});

describe("ALL_MEMBERS never delegates", () => {
  it("an administrator holding both grants is still refused it", () => {
    for (const audience of RESERVED_AUDIENCES) {
      expect(mayUseAudience(ROLE.ADMIN, grants(true, true), audience)).toBe(false);
    }
  });

  it("no caller other than the super admin reaches a reserved audience", () => {
    for (const caller of CALLERS.filter((c) => c.role !== ROLE.SUPER_ADMIN)) {
      for (const audience of RESERVED_AUDIENCES) {
        expect(mayUseAudience(caller.role, caller.grants, audience)).toBe(false);
      }
    }
  });

  it("the reserved set is not empty and does not overlap the delegable ones", () => {
    // An empty reserved set would mean the super admin held nothing of their own.
    expect(RESERVED_AUDIENCES.length).toBeGreaterThan(0);

    for (const audience of [...DELEGATED_AUDIENCES, ...ADMIN_AUDIENCES]) {
      expect(RESERVED_AUDIENCES).not.toContain(audience);
    }
  });

  it("everything delegable is a strict subset of the super admin's", () => {
    for (const audience of [...DELEGATED_AUDIENCES, ...ADMIN_AUDIENCES]) {
      expect(SUPER_ADMIN_AUDIENCES).toContain(audience);
    }

    expect(DELEGATED_AUDIENCES.length + ADMIN_AUDIENCES.length).toBeLessThan(
      SUPER_ADMIN_AUDIENCES.length,
    );
  });
});

describe("the grants are meaningless outside the ADMIN role", () => {
  it("do nothing for an employee", () => {
    expect(maySendAnything(ROLE.EMPLOYEE, grants(true, true))).toBe(false);
    expect(permittedAudiences(ROLE.EMPLOYEE, grants(true, true))).toEqual([]);
    expect(mayEmailAdmins(ROLE.EMPLOYEE, grants(true, true))).toBe(false);
  });

  it("cannot take anything away from the super admin", () => {
    expect(permittedAudiences(ROLE.SUPER_ADMIN, NO_EMAIL_GRANTS)).toEqual(SUPER_ADMIN_AUDIENCES);
    expect(mayEmailAdmins(ROLE.SUPER_ADMIN, NO_EMAIL_GRANTS)).toBe(true);
  });

  it("refuses an unknown role outright", () => {
    expect(permittedAudiences("AUDITOR", grants(true, true))).toEqual([]);
    expect(maySendAnything("", grants(true, true))).toBe(false);
    expect(mayEmailAdmins("AUDITOR", grants(true, true))).toBe(false);
  });
});

describe("mayEmailAdmins", () => {
  it("is exactly canEmailAdmins for an administrator", () => {
    expect(mayEmailAdmins(ROLE.ADMIN, grants(true, false))).toBe(false);
    expect(mayEmailAdmins(ROLE.ADMIN, grants(false, true))).toBe(true);
  });

  it("agrees with the audience matrix for every caller", () => {
    // The picker and the send must not be able to disagree about who is
    // reachable: one asks this, the other asks `permittedAudiences`.
    for (const caller of CALLERS) {
      const reachesAdminAudience = ADMIN_AUDIENCES.some((audience) =>
        mayUseAudience(caller.role, caller.grants, audience),
      );

      expect(mayEmailAdmins(caller.role, caller.grants)).toBe(reachesAdminAudience);
    }
  });
});

describe("audienceRoles", () => {
  it("resolves EMPLOYEES to employees alone", () => {
    expect(audienceRoles(EMAIL_AUDIENCE.EMPLOYEES)).toEqual([ROLE.EMPLOYEE]);
  });

  it("resolves both admin audiences to administrators alone, without the owner", () => {
    // The hand-picked audience must draw from exactly the population the
    // group one does, or the picker would offer somebody "all" would miss.
    expect(audienceRoles(EMAIL_AUDIENCE.ADMINS)).toEqual([ROLE.ADMIN]);
    expect(audienceRoles(EMAIL_AUDIENCE.SELECTED_ADMINS)).toEqual([ROLE.ADMIN]);
  });

  it("resolves ALL_MEMBERS to everybody, owner included", () => {
    // "Everyone" that quietly omitted the super admin would be a lie.
    expect(audienceRoles(EMAIL_AUDIENCE.ALL_MEMBERS)).toEqual([
      ROLE.EMPLOYEE,
      ROLE.ADMIN,
      ROLE.SUPER_ADMIN,
    ]);
  });

  it("never returns an empty population", () => {
    for (const audience of ALL_AUDIENCES.filter((a) => a !== EMAIL_AUDIENCE.INDIVIDUAL)) {
      expect(audienceRoles(audience as Exclude<Audience, "INDIVIDUAL">).length).toBeGreaterThan(0);
    }
  });
});

describe("individualRecipientRoles", () => {
  it("offers employees only until canEmailAdmins says otherwise", () => {
    // The whole reason the grant is a boundary. A permission to write to
    // administrators that could be walked around one administrator at a time
    // through the single-recipient picker would not be a permission at all.
    expect(individualRecipientRoles(ROLE.ADMIN, grants(true, false))).toEqual([ROLE.EMPLOYEE]);
    expect(individualRecipientRoles(ROLE.ADMIN, grants(true, true))).toEqual([
      ROLE.EMPLOYEE,
      ROLE.ADMIN,
    ]);
  });

  it("hides the super admin from an administrator's picker either way", () => {
    // The same reasoning that keeps SUPER_ADMIN out of employeeQuerySchema: an
    // account that cannot be listed must not become discoverable here instead.
    for (const held of [grants(true, false), grants(true, true)]) {
      expect(individualRecipientRoles(ROLE.ADMIN, held)).not.toContain(ROLE.SUPER_ADMIN);
    }
  });

  it("lets the super admin address anybody", () => {
    expect(individualRecipientRoles(ROLE.SUPER_ADMIN, NO_EMAIL_GRANTS)).toContain(ROLE.SUPER_ADMIN);
  });

  it("offers an employee nobody at all", () => {
    expect(individualRecipientRoles(ROLE.EMPLOYEE, grants(true, true))).toEqual([]);
  });

  it("never offers a role that does not exist", () => {
    for (const role of Object.values(ROLE)) {
      for (const offered of individualRecipientRoles(role, grants(true, true))) {
        expect(Object.values(ROLE)).toContain(offered);
      }
    }
  });
});
