/**
 * The complaint payloads, as they actually arrive.
 *
 * Written for the reason `admin-chat.schema.test.ts` records: a feature spanning
 * a client and a server has to be verified **at the wire**. The security
 * properties here are almost all expressed as *absent fields* — there is no
 * `employeeId` on a submission and no `resolvedById` on an update — and an
 * absent field is exactly the kind of guarantee that is easy to believe in and
 * never actually exercise.
 */
import { describe, expect, it } from "vitest";

import { MAX_COMPLAINT_ATTACHMENTS, MAX_COMPLAINT_ATTACHMENT_BYTES } from "@/lib/constants";
import {
  complaintQuerySchema,
  myComplaintQuerySchema,
  submitComplaintSchema,
  updateComplaintSchema,
} from "@/validations/complaint.schema";

const VALID = {
  subject: "Air conditioning is broken",
  description: "The west wing has had no air conditioning for the last three working days.",
};

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

describe("submitting a complaint", () => {
  it("accepts a plain subject and description", () => {
    const parsed = submitComplaintSchema.parse(VALID);

    expect(parsed.subject).toBe(VALID.subject);
    expect(parsed.attachments).toEqual([]);
  });

  it("refuses a subject or description too short to act on", () => {
    expect(submitComplaintSchema.safeParse({ ...VALID, subject: "AC" }).success).toBe(false);
    expect(submitComplaintSchema.safeParse({ ...VALID, description: "broken" }).success).toBe(false);
  });

  it("refuses whitespace masquerading as content", () => {
    expect(submitComplaintSchema.safeParse({ ...VALID, subject: "         " }).success).toBe(false);
    expect(
      submitComplaintSchema.safeParse({ ...VALID, description: " ".repeat(40) }).success,
    ).toBe(false);
  });

  describe("the author and the outcome are not the client's to set", () => {
    // The whole security model of submission is that these fields do not exist.
    // `strictObject` is what turns "we ignore it" into "we refuse it", and the
    // difference matters: a silently stripped `status: RESOLVED` would look to
    // the sender exactly like one that worked.
    for (const forged of [
      { employeeId: "somebody-else" },
      { status: "RESOLVED" },
      { resolution: "I resolved it myself" },
      { resolvedById: "somebody-else" },
      { resolvedAt: new Date().toISOString() },
      { internalNotes: "peeking" },
      { resolutionNoticeSentAt: null },
    ]) {
      it(`refuses a body carrying ${Object.keys(forged)[0]}`, () => {
        expect(submitComplaintSchema.safeParse({ ...VALID, ...forged }).success).toBe(false);
      });
    }
  });

  describe("attachments", () => {
    it("accepts images and PDFs", () => {
      for (const data of [PNG, "data:application/pdf;base64,JVBERi0xLjQK"]) {
        expect(
          submitComplaintSchema.safeParse({ ...VALID, attachments: [{ filename: "f", data }] }).success,
        ).toBe(true);
      }
    });

    it("refuses SVG and HTML, which are documents that can carry script", () => {
      for (const data of [
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "data:text/html;base64,PGgxPmhpPC9oMT4=",
        "data:application/x-msdownload;base64,TVqQ",
      ]) {
        expect(
          submitComplaintSchema.safeParse({ ...VALID, attachments: [{ filename: "f", data }] }).success,
        ).toBe(false);
      }
    });

    it("refuses a bare URL pretending to be a payload", () => {
      expect(
        submitComplaintSchema.safeParse({
          ...VALID,
          attachments: [{ filename: "f", data: "https://example.com/x.png" }],
        }).success,
      ).toBe(false);
    });

    it("refuses more files than the limit", () => {
      const many = Array.from({ length: MAX_COMPLAINT_ATTACHMENTS + 1 }, (_, i) => ({
        filename: `f${i}`,
        data: PNG,
      }));

      expect(submitComplaintSchema.safeParse({ ...VALID, attachments: many }).success).toBe(false);
    });

    it("refuses a set over the total budget", () => {
      const huge = {
        filename: "big.png",
        data: `data:image/png;base64,${"A".repeat(MAX_COMPLAINT_ATTACHMENT_BYTES)}`,
      };

      expect(submitComplaintSchema.safeParse({ ...VALID, attachments: [huge] }).success).toBe(false);
    });

    it("refuses a size the client made up", () => {
      // Derived from the payload server-side, never believed from the browser.
      expect(
        submitComplaintSchema.safeParse({
          ...VALID,
          attachments: [{ filename: "f", data: PNG, size: 1 }],
        }).success,
      ).toBe(false);
    });
  });
});

describe("updating a complaint", () => {
  it("accepts any one field on its own", () => {
    expect(updateComplaintSchema.safeParse({ status: "UNDER_REVIEW" }).success).toBe(true);
    expect(updateComplaintSchema.safeParse({ resolution: "Fixed." }).success).toBe(true);
    expect(updateComplaintSchema.safeParse({ internalNotes: "Chasing facilities." }).success).toBe(true);
  });

  it("refuses an empty body rather than reporting a change of nothing", () => {
    expect(updateComplaintSchema.safeParse({}).success).toBe(false);
  });

  it("refuses closing with an explicitly empty resolution", () => {
    for (const status of ["RESOLVED", "REJECTED"]) {
      expect(updateComplaintSchema.safeParse({ status, resolution: "" }).success).toBe(false);
      expect(updateComplaintSchema.safeParse({ status, resolution: "   " }).success).toBe(false);
    }
  });

  it("allows closing without the field, leaving the service to check what is stored", () => {
    // The schema cannot see the row, so re-closing a complaint that already
    // carries a resolution has to reach the service to be judged.
    expect(updateComplaintSchema.safeParse({ status: "RESOLVED" }).success).toBe(true);
  });

  it("does not demand a resolution for the open states", () => {
    expect(updateComplaintSchema.safeParse({ status: "PENDING", resolution: "" }).success).toBe(true);
    expect(updateComplaintSchema.safeParse({ status: "UNDER_REVIEW", resolution: "" }).success).toBe(true);
  });

  describe("who resolved it is not the client's to say", () => {
    for (const forged of [
      { status: "RESOLVED", resolvedById: "somebody-else" },
      { status: "RESOLVED", resolvedAt: new Date().toISOString() },
      { status: "RESOLVED", employeeId: "somebody-else" },
      { status: "RESOLVED", resolutionNoticeSentAt: new Date().toISOString() },
      { status: "RESOLVED", resolutionNoticeClaimedAt: null },
    ]) {
      it(`refuses a body carrying ${Object.keys(forged)[1]}`, () => {
        expect(updateComplaintSchema.safeParse(forged).success).toBe(false);
      });
    }
  });

  it("refuses a status that does not exist", () => {
    for (const status of ["ESCALATED", "resolved", "CLOSED", ""]) {
      expect(updateComplaintSchema.safeParse({ status }).success).toBe(false);
    }
  });
});

describe("the admin query", () => {
  it("defaults to newest first, page one", () => {
    const parsed = complaintQuerySchema.parse({});

    expect(parsed.sort).toBe("newest");
    expect(parsed.page).toBe(1);
  });

  it("accepts both sort orders and refuses anything else", () => {
    expect(complaintQuerySchema.safeParse({ sort: "oldest" }).success).toBe(true);
    expect(complaintQuerySchema.safeParse({ sort: "alphabetical" }).success).toBe(false);
  });

  it("insists on ISO dates", () => {
    expect(complaintQuerySchema.safeParse({ from: "2026-08-01" }).success).toBe(true);
    expect(complaintQuerySchema.safeParse({ from: "01/08/2026" }).success).toBe(false);
  });

  it("bounds the page size so one request cannot pull the whole table", () => {
    expect(complaintQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });
});

describe("the employee's own query", () => {
  it("has no employee filter at all, so no request shape can widen it", () => {
    // The scoping guarantee is the absent field. If this ever starts passing,
    // `/api/complaints` has gained a way to ask about somebody else.
    const parsed = myComplaintQuerySchema.parse({ employeeId: "somebody-else" });

    expect("employeeId" in parsed).toBe(false);
  });

  it("still accepts a status narrowing and paging", () => {
    const parsed = myComplaintQuerySchema.parse({ status: "RESOLVED", page: "2" });

    expect(parsed.status).toBe("RESOLVED");
    expect(parsed.page).toBe(2);
  });
});
