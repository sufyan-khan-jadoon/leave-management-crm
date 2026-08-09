/**
 * The whole permission matrix, enumerated.
 *
 * This is the security rule of the custom-email feature, so it is not tested by
 * example — every combination of caller and audience is generated and asserted,
 * which is the only way to be sure no pairing widens by accident. The interesting
 * assertions are the negative ones: an administrator holding the grant is still
 * refused the two broadcast audiences, and an employee is refused everything
 * however the flag is set.
 */
import { describe, expect, it } from "vitest";

import {
  DELEGATED_AUDIENCES,
  EMAIL_AUDIENCE,
  RESERVED_AUDIENCES,
  SUPER_ADMIN_AUDIENCES,
  audienceRoles,
  individualRecipientRoles,
  mayUseAudience,
  maySendAnything,
  permittedAudiences,
  type Audience,
} from "@/lib/email-audience";
import { ROLE } from "@/lib/enums";

const ALL_AUDIENCES: Audience[] = [
  EMAIL_AUDIENCE.INDIVIDUAL,
  EMAIL_AUDIENCE.EMPLOYEES,
  EMAIL_AUDIENCE.ADMINS,
  EMAIL_AUDIENCE.ALL_MEMBERS,
];

/** Every caller the system can produce. */
const CALLERS = [
  { label: "super admin", role: ROLE.SUPER_ADMIN, grant: false },
  { label: "super admin (flag set)", role: ROLE.SUPER_ADMIN, grant: true },
  { label: "admin without the grant", role: ROLE.ADMIN, grant: false },
  { label: "admin with the grant", role: ROLE.ADMIN, grant: true },
  { label: "employee", role: ROLE.EMPLOYEE, grant: false },
  { label: "employee (flag set)", role: ROLE.EMPLOYEE, grant: true },
] as const;

/** The matrix, written out so a change to the rule has to change this table too. */
const EXPECTED: Record<string, Audience[]> = {
  "super admin": ALL_AUDIENCES,
  "super admin (flag set)": ALL_AUDIENCES,
  "admin without the grant": [],
  "admin with the grant": [EMAIL_AUDIENCE.INDIVIDUAL, EMAIL_AUDIENCE.EMPLOYEES],
  employee: [],
  "employee (flag set)": [],
};

describe("permittedAudiences — the full matrix", () => {
  for (const caller of CALLERS) {
    it(`${caller.label} may address exactly ${JSON.stringify(EXPECTED[caller.label])}`, () => {
      expect(permittedAudiences(caller.role, caller.grant).sort()).toEqual(
        [...EXPECTED[caller.label]].sort(),
      );
    });
  }

  it("covers every caller the enum can produce", () => {
    // Guards the table above from going stale if a role is ever added.
    expect(new Set(CALLERS.map((c) => c.role))).toEqual(new Set(Object.values(ROLE)));
  });
});

describe("mayUseAudience — every caller against every audience", () => {
  for (const caller of CALLERS) {
    for (const audience of ALL_AUDIENCES) {
      const allowed = EXPECTED[caller.label].includes(audience);

      it(`${caller.label} ${allowed ? "may" : "may NOT"} send to ${audience}`, () => {
        expect(mayUseAudience(caller.role, caller.grant, audience)).toBe(allowed);
      });
    }
  }
});

describe("the broadcast audiences never delegate", () => {
  it("an administrator with the grant is still refused ADMINS and ALL_MEMBERS", () => {
    for (const audience of RESERVED_AUDIENCES) {
      expect(mayUseAudience(ROLE.ADMIN, true, audience)).toBe(false);
    }
  });

  it("the delegated set and the reserved set do not overlap", () => {
    for (const audience of DELEGATED_AUDIENCES) {
      expect(RESERVED_AUDIENCES).not.toContain(audience);
    }
  });

  it("the delegated set is a strict subset of the super admin's", () => {
    for (const audience of DELEGATED_AUDIENCES) {
      expect(SUPER_ADMIN_AUDIENCES).toContain(audience);
    }

    expect(DELEGATED_AUDIENCES.length).toBeLessThan(SUPER_ADMIN_AUDIENCES.length);
  });

  it("no caller other than the super admin reaches a reserved audience", () => {
    for (const caller of CALLERS.filter((c) => c.role !== ROLE.SUPER_ADMIN)) {
      for (const audience of RESERVED_AUDIENCES) {
        expect(mayUseAudience(caller.role, caller.grant, audience)).toBe(false);
      }
    }
  });
});

describe("the grant is meaningless outside the ADMIN role", () => {
  it("does nothing for an employee", () => {
    expect(maySendAnything(ROLE.EMPLOYEE, true)).toBe(false);
    expect(permittedAudiences(ROLE.EMPLOYEE, true)).toEqual([]);
  });

  it("cannot take anything away from the super admin", () => {
    expect(permittedAudiences(ROLE.SUPER_ADMIN, false)).toEqual(SUPER_ADMIN_AUDIENCES);
  });

  it("is the whole difference for an administrator", () => {
    expect(maySendAnything(ROLE.ADMIN, false)).toBe(false);
    expect(maySendAnything(ROLE.ADMIN, true)).toBe(true);
  });

  it("refuses an unknown role outright", () => {
    expect(permittedAudiences("AUDITOR", true)).toEqual([]);
    expect(maySendAnything("", true)).toBe(false);
  });
});

describe("audienceRoles", () => {
  it("resolves EMPLOYEES to employees alone", () => {
    expect(audienceRoles(EMAIL_AUDIENCE.EMPLOYEES)).toEqual([ROLE.EMPLOYEE]);
  });

  it("resolves ADMINS to administrators alone, without the owner", () => {
    expect(audienceRoles(EMAIL_AUDIENCE.ADMINS)).toEqual([ROLE.ADMIN]);
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
    for (const audience of [EMAIL_AUDIENCE.EMPLOYEES, EMAIL_AUDIENCE.ADMINS, EMAIL_AUDIENCE.ALL_MEMBERS] as const) {
      expect(audienceRoles(audience).length).toBeGreaterThan(0);
    }
  });
});

describe("individualRecipientRoles", () => {
  it("hides the super admin from an administrator's picker", () => {
    // The same reasoning that keeps SUPER_ADMIN out of employeeQuerySchema: an
    // account that cannot be listed must not become discoverable here instead.
    expect(individualRecipientRoles(ROLE.ADMIN)).not.toContain(ROLE.SUPER_ADMIN);
    expect(individualRecipientRoles(ROLE.ADMIN)).toEqual([ROLE.EMPLOYEE, ROLE.ADMIN]);
  });

  it("lets the super admin address anybody", () => {
    expect(individualRecipientRoles(ROLE.SUPER_ADMIN)).toContain(ROLE.SUPER_ADMIN);
  });

  it("never offers a role that does not exist", () => {
    for (const role of Object.values(ROLE)) {
      for (const offered of individualRecipientRoles(role)) {
        expect(Object.values(ROLE)).toContain(offered);
      }
    }
  });
});
