/**
 * Every transition, enumerated.
 *
 * Sixteen pairs is small enough to generate exhaustively, which is the only way
 * to be sure no combination sends a letter it should not. The interesting
 * assertions are the negative ones: no transition *out of* RESOLVED notifies,
 * arriving at RESOLVED from RESOLVED does not either, and every closing status
 * demands words whichever direction it was reached from.
 */
import { describe, expect, it } from "vitest";

import {
  CLOSING_STATUSES,
  COMPLAINT_STATUS,
  COMPLAINT_STATUSES,
  complaintStatusLabel,
  isClosed,
  isValidTransition,
  requiresResolution,
  shouldNotifyResolution,
  type ComplaintStatusValue,
} from "@/lib/complaint-status";
import { complaintReference } from "@/lib/complaint-reference";

const ALL = COMPLAINT_STATUSES;

/** Every ordered pair, including a status with itself. */
const PAIRS: Array<[ComplaintStatusValue, ComplaintStatusValue]> = ALL.flatMap((from) =>
  ALL.map((to) => [from, to] as [ComplaintStatusValue, ComplaintStatusValue]),
);

describe("the status set", () => {
  it("covers exactly the four the enum declares", () => {
    expect(new Set(ALL)).toEqual(new Set(Object.values(COMPLAINT_STATUS)));
    expect(ALL).toHaveLength(4);
  });

  it("labels every one of them", () => {
    for (const status of ALL) {
      expect(complaintStatusLabel(status)).toBeTruthy();
      expect(complaintStatusLabel(status)).not.toBe(status);
    }
  });

  it("passes an unknown status through rather than rendering undefined", () => {
    expect(complaintStatusLabel("ESCALATED")).toBe("ESCALATED");
  });
});

describe("isValidTransition — every pair", () => {
  for (const [from, to] of PAIRS) {
    const allowed = from !== to;

    it(`${from} → ${to} is ${allowed ? "allowed" : "refused"}`, () => {
      expect(isValidTransition(from, to)).toBe(allowed);
    });
  }

  it("allows a resolved complaint to be reopened", () => {
    // The case the obvious "terminal state" design breaks: a complaint marked
    // resolved by mistake, or one whose problem came back.
    expect(isValidTransition(COMPLAINT_STATUS.RESOLVED, COMPLAINT_STATUS.PENDING)).toBe(true);
    expect(isValidTransition(COMPLAINT_STATUS.RESOLVED, COMPLAINT_STATUS.UNDER_REVIEW)).toBe(true);
    expect(isValidTransition(COMPLAINT_STATUS.REJECTED, COMPLAINT_STATUS.UNDER_REVIEW)).toBe(true);
  });

  it("refuses every no-op, which is what keeps the audit fields honest", () => {
    for (const status of ALL) {
      expect(isValidTransition(status, status)).toBe(false);
    }
  });
});

describe("requiresResolution", () => {
  it("demands words for both outcomes and neither open state", () => {
    expect(requiresResolution(COMPLAINT_STATUS.RESOLVED)).toBe(true);
    expect(requiresResolution(COMPLAINT_STATUS.REJECTED)).toBe(true);
    expect(requiresResolution(COMPLAINT_STATUS.PENDING)).toBe(false);
    expect(requiresResolution(COMPLAINT_STATUS.UNDER_REVIEW)).toBe(false);
  });

  it("agrees with isClosed for every status", () => {
    for (const status of ALL) {
      expect(requiresResolution(status)).toBe(isClosed(status));
    }
  });

  it("is exactly the closing set", () => {
    expect(ALL.filter(requiresResolution).sort()).toEqual([...CLOSING_STATUSES].sort());
  });
});

describe("shouldNotifyResolution — every pair", () => {
  for (const [from, to] of PAIRS) {
    const expected = to === COMPLAINT_STATUS.RESOLVED && from !== COMPLAINT_STATUS.RESOLVED;

    it(`${from} → ${to} ${expected ? "is" : "is not"} a candidate for the letter`, () => {
      expect(shouldNotifyResolution(from, to)).toBe(expected);
    });
  }

  it("never notifies for a rejection", () => {
    // Rejecting still requires words, and the employee reads them on the screen
    // — but only resolution was specified as an email, and mailing somebody
    // that their grievance was refused is a decision nobody asked for.
    for (const from of ALL) {
      expect(shouldNotifyResolution(from, COMPLAINT_STATUS.REJECTED)).toBe(false);
    }
  });

  it("never notifies on a no-op", () => {
    for (const status of ALL) {
      expect(shouldNotifyResolution(status, status)).toBe(false);
    }
  });

  it("is a candidate again after a reopen, which the claim is what refuses", () => {
    // This deliberately returns true the second time. Once-only is a fact about
    // the row, settled by `claimResolutionNotice`, not about a pair of statuses
    // — and keeping the two apart is what makes the cycle send exactly one.
    expect(shouldNotifyResolution(COMPLAINT_STATUS.PENDING, COMPLAINT_STATUS.RESOLVED)).toBe(true);
    expect(shouldNotifyResolution(COMPLAINT_STATUS.RESOLVED, COMPLAINT_STATUS.PENDING)).toBe(false);
    expect(shouldNotifyResolution(COMPLAINT_STATUS.PENDING, COMPLAINT_STATUS.RESOLVED)).toBe(true);
  });
});

describe("complaintReference", () => {
  it("is derived from the id, so nothing has to store it", () => {
    expect(complaintReference("clx1234567890abcdefgh")).toBe("ZV-ABCDEFGH");
  });

  it("takes the tail, because cuid heads are near-identical within a session", () => {
    const a = complaintReference("clxaaaaaaaaaaaaa11111111");
    const b = complaintReference("clxaaaaaaaaaaaaa22222222");

    expect(a).not.toBe(b);
  });

  it("is stable for one id", () => {
    expect(complaintReference("abc123def456")).toBe(complaintReference("abc123def456"));
  });

  it("copes with an id shorter than the reference", () => {
    expect(complaintReference("abc")).toBe("ZV-ABC");
  });
});
