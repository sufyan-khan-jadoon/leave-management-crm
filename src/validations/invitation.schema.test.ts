import { describe, expect, it } from "vitest";

import { adminPermissionsSchema } from "@/validations/invitation.schema";

/**
 * The wire contract behind every switch on the Access panel.
 *
 * `AdminPermissions` posts one key — `{ [grant.key]: allowed }` — and the schema
 * has to name that key or the request degrades into something worse than a plain
 * refusal: the object is not strict, so an unlisted permission is *stripped*,
 * the "name a permission" guard then sees an empty body, and the super admin is
 * told to change something they just changed. A grant added to the panel and
 * forgotten here fails exactly that way, which is the lesson
 * `admin-chat.schema.test.ts` records from the other direction.
 */
describe("adminPermissionsSchema", () => {
  const GRANTS = [
    "canInviteEmployees",
    "canManageHolidays",
    "canSendEmails",
    "canViewAdminRecords",
    "canMarkAttendance",
  ] as const;

  it.each(GRANTS)("accepts %s on its own, granted", (key) => {
    expect(adminPermissionsSchema.parse({ [key]: true })).toEqual({ [key]: true });
  });

  // Withdrawing is a change like any other, so `false` must survive the guard
  // that refuses a body changing nothing.
  it.each(GRANTS)("accepts %s on its own, withdrawn", (key) => {
    expect(adminPermissionsSchema.parse({ [key]: false })).toEqual({ [key]: false });
  });

  it("refuses a body that names no permission", () => {
    expect(adminPermissionsSchema.safeParse({}).success).toBe(false);
  });

  // The stripping case: a key the schema does not know is dropped rather than
  // rejected, so it arrives at the guard as an empty body.
  it("refuses a permission it does not recognise", () => {
    expect(adminPermissionsSchema.safeParse({ canDoAnything: true }).success).toBe(false);
  });

  // Each switch sends only the one that moved, but nothing about the route
  // depends on that, and it applies them independently.
  it("accepts several at once", () => {
    expect(
      adminPermissionsSchema.parse({ canViewAdminRecords: true, canSendEmails: false }),
    ).toEqual({ canViewAdminRecords: true, canSendEmails: false });
  });
});
