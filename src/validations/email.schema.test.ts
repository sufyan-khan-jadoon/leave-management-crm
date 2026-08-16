/**
 * The send request, as it actually arrives.
 *
 * Written because of the lesson `admin-chat.schema.test.ts` records: a feature
 * spanning a client and a server has to be verified **at the wire**, not at its
 * two ends. The admin-chat deletion shipped broken exactly once, having been
 * driven against the service with a payload hand-written in the shape the schema
 * wanted, so the one thing wrong was the one thing never exercised.
 *
 * The composer sends `multipart/form-data`, and `parseMultipart` hands the
 * schema a flat `Record<string, string>` with empty values dropped — so that is
 * what these parse. A test that fed it an object with a real array would be
 * testing an encoding nothing produces.
 */
import { describe, expect, it } from "vitest";

import { MAX_EMAIL_RECIPIENTS } from "@/lib/constants";
import { emailRecipientQuerySchema, sendCustomEmailSchema } from "@/validations/email.schema";

/** The subject and body every case needs, kept out of the way. */
const BASE = { subject: "Quarterly update", body: "<p>Please read.</p>" };

/** What `parseMultipart` produces: strings only, empties already dropped. */
function wire(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== ""));
}

describe("the audience is closed", () => {
  it("accepts all five and nothing else", () => {
    for (const audience of ["EMPLOYEES", "ADMINS", "ALL_MEMBERS"]) {
      expect(sendCustomEmailSchema.safeParse(wire({ ...BASE, audience })).success).toBe(true);
    }

    expect(
      sendCustomEmailSchema.safeParse(wire({ ...BASE, audience: "INDIVIDUAL", recipientId: "abc" }))
        .success,
    ).toBe(true);

    expect(
      sendCustomEmailSchema.safeParse(
        wire({ ...BASE, audience: "SELECTED_ADMINS", recipientIds: "a,b" }),
      ).success,
    ).toBe(true);
  });

  it("refuses an audience that does not exist", () => {
    // Never treated as a default — an unknown value is refused by the parser
    // before any code can decide what it might have meant.
    for (const audience of ["SUPER_ADMINS", "admins", "", "ALL"]) {
      expect(sendCustomEmailSchema.safeParse(wire({ ...BASE, audience })).success).toBe(false);
    }
  });
});

describe("SELECTED_ADMINS carries its recipients", () => {
  it("splits the comma-joined field the composer sends", () => {
    const parsed = sendCustomEmailSchema.parse(
      wire({ ...BASE, audience: "SELECTED_ADMINS", recipientIds: "one,two,three" }),
    );

    expect(parsed.recipientIds).toEqual(["one", "two", "three"]);
  });

  it("tolerates whitespace and stray separators", () => {
    const parsed = sendCustomEmailSchema.parse(
      wire({ ...BASE, audience: "SELECTED_ADMINS", recipientIds: " one , ,two, " }),
    );

    expect(parsed.recipientIds).toEqual(["one", "two"]);
  });

  it("deduplicates rather than writing to somebody twice", () => {
    // A set sent twice over is a client bug, not an instruction — and the count
    // the sender confirmed has to be the count that goes.
    const parsed = sendCustomEmailSchema.parse(
      wire({ ...BASE, audience: "SELECTED_ADMINS", recipientIds: "one,two,one" }),
    );

    expect(parsed.recipientIds).toEqual(["one", "two"]);
  });

  it("refuses an empty selection, however it is expressed", () => {
    // The field absent entirely is what `parseMultipart` produces for an empty
    // string, so both spellings have to be refused.
    for (const recipientIds of ["", " ", ",", ",,"]) {
      expect(
        sendCustomEmailSchema.safeParse(wire({ ...BASE, audience: "SELECTED_ADMINS", recipientIds }))
          .success,
      ).toBe(false);
    }

    expect(
      sendCustomEmailSchema.safeParse(wire({ ...BASE, audience: "SELECTED_ADMINS" })).success,
    ).toBe(false);
  });

  it("refuses more recipients than one send may have", () => {
    const ids = Array.from({ length: MAX_EMAIL_RECIPIENTS + 1 }, (_, index) => `id${index}`);

    expect(
      sendCustomEmailSchema.safeParse(
        wire({ ...BASE, audience: "SELECTED_ADMINS", recipientIds: ids.join(",") }),
      ).success,
    ).toBe(false);
  });
});

describe("the two recipient fields never mix", () => {
  it("refuses a chosen list on any other audience", () => {
    // Refused rather than ignored: silently dropping one half would send the
    // message to a different set of people while appearing to work.
    for (const audience of ["EMPLOYEES", "ADMINS", "ALL_MEMBERS"]) {
      expect(
        sendCustomEmailSchema.safeParse(wire({ ...BASE, audience, recipientIds: "a,b" })).success,
      ).toBe(false);
    }

    expect(
      sendCustomEmailSchema.safeParse(
        wire({ ...BASE, audience: "INDIVIDUAL", recipientId: "a", recipientIds: "b,c" }),
      ).success,
    ).toBe(false);
  });

  it("refuses a single recipient on a group audience", () => {
    for (const audience of ["EMPLOYEES", "ADMINS", "SELECTED_ADMINS", "ALL_MEMBERS"]) {
      expect(
        sendCustomEmailSchema.safeParse(wire({ ...BASE, audience, recipientId: "abc" })).success,
      ).toBe(false);
    }
  });

  it("still requires a recipient for INDIVIDUAL", () => {
    expect(sendCustomEmailSchema.safeParse(wire({ ...BASE, audience: "INDIVIDUAL" })).success).toBe(
      false,
    );
  });
});

describe("the body carries no verdict of its own", () => {
  it("refuses a field the composer never sends", () => {
    // `strictObject`, following `markAttendanceSchema`: there is no place for a
    // caller's own idea of who may receive this, or of how many did.
    const extras: Array<Record<string, string>> = [
      { canEmailAdmins: "true" },
      { recipientCount: "40" },
      { audienceOverride: "ALL_MEMBERS" },
      { senderId: "someone-else" },
    ];

    for (const extra of extras) {
      expect(
        sendCustomEmailSchema.safeParse(wire({ ...BASE, audience: "ADMINS", ...extra })).success,
      ).toBe(false);
    }
  });
});

describe("the recipient picker's query", () => {
  it("defaults to the narrower scope", () => {
    // A missing scope must never mean the administrator list.
    expect(emailRecipientQuerySchema.parse({}).scope).toBe("INDIVIDUAL");
  });

  it("accepts the two scopes and refuses anything else", () => {
    expect(emailRecipientQuerySchema.safeParse({ scope: "ADMINS" }).success).toBe(true);
    expect(emailRecipientQuerySchema.safeParse({ scope: "INDIVIDUAL" }).success).toBe(true);

    for (const scope of ["ALL_MEMBERS", "SUPER_ADMIN", "admins", ""]) {
      expect(emailRecipientQuerySchema.safeParse({ scope }).success).toBe(false);
    }
  });
});
