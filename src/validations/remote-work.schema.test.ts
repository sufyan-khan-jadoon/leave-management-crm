/**
 * The remote-work wire contract.
 *
 * Written because `admin-chat.schema.test.ts` records what happens when it is
 * not: that feature shipped broken because every path was driven against the
 * *service* with a hand-written payload in the shape the schema wanted, so the
 * one thing actually wrong — a client posting display fields into a
 * `strictObject` — was the one thing never exercised. These tests parse the
 * bodies a browser would actually send, and assert the refusals a hostile one
 * would meet.
 */
import { describe, expect, it } from "vitest";

import { MAX_REMOTE_WORK_RANGE_DAYS, MAX_REMOTE_WORK_REASON_LENGTH } from "@/lib/constants";
import { toIsoDate } from "@/lib/date";
import {
  createRemoteWorkSchema,
  remoteWorkQuerySchema,
  revokeRemoteWorkSchema,
  updateRemoteWorkSchema,
} from "@/validations/remote-work.schema";

const REASON = "Working from home while the office is refitted";

describe("createRemoteWorkSchema", () => {
  it("accepts each fixed duration with no dates at all", () => {
    for (const type of ["TODAY", "TOMORROW", "WEEK", "MONTH", "UNTIL_REVOKED"] as const) {
      const parsed = createRemoteWorkSchema.safeParse({ employeeId: "emp_1", type, reason: REASON });

      expect(parsed.success, type).toBe(true);
    }
  });

  // The dates for a fixed duration are the server's to resolve against the
  // company's calendar day. A client sending its own would be sending its own
  // clock, which is exactly what a browser a day out would do.
  it("refuses dates on a fixed duration rather than ignoring them", () => {
    const parsed = createRemoteWorkSchema.safeParse({
      employeeId: "emp_1",
      type: "WEEK",
      reason: REASON,
      startDate: "2026-08-21",
      endDate: "2026-08-27",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a custom range and parses both dates to UTC midnight", () => {
    const parsed = createRemoteWorkSchema.safeParse({
      employeeId: "emp_1",
      type: "CUSTOM",
      reason: REASON,
      startDate: "2026-08-25",
      endDate: "2026-09-15",
    });

    expect(parsed.success).toBe(true);

    if (parsed.success && parsed.data.type === "CUSTOM") {
      expect(toIsoDate(parsed.data.startDate)).toBe("2026-08-25");
      expect(toIsoDate(parsed.data.endDate)).toBe("2026-09-15");
      expect(parsed.data.startDate.toISOString()).toBe("2026-08-25T00:00:00.000Z");
    }
  });

  it("accepts a custom range of a single day", () => {
    const parsed = createRemoteWorkSchema.safeParse({
      employeeId: "emp_1",
      type: "CUSTOM",
      reason: REASON,
      startDate: "2026-08-25",
      endDate: "2026-08-25",
    });

    expect(parsed.success).toBe(true);
  });

  it("refuses a custom range whose end precedes its start", () => {
    const parsed = createRemoteWorkSchema.safeParse({
      employeeId: "emp_1",
      type: "CUSTOM",
      reason: REASON,
      startDate: "2026-09-15",
      endDate: "2026-08-25",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["endDate"]);
    }
  });

  it("refuses a custom range with either date missing", () => {
    for (const body of [
      { startDate: "2026-08-25" },
      { endDate: "2026-09-15" },
      {},
    ]) {
      const parsed = createRemoteWorkSchema.safeParse({
        employeeId: "emp_1",
        type: "CUSTOM",
        reason: REASON,
        ...body,
      });

      expect(parsed.success).toBe(false);
    }
  });

  // The cap is a guard against a slipped digit in the year, not a policy about
  // long arrangements — those have their own type, which is deliberately not
  // bounded by it.
  it("refuses a custom range past the cap but accepts one exactly on it", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const onCap = new Date(start.getTime() + (MAX_REMOTE_WORK_RANGE_DAYS - 1) * 86_400_000);
    const overCap = new Date(start.getTime() + MAX_REMOTE_WORK_RANGE_DAYS * 86_400_000);

    const body = (endDate: Date) => ({
      employeeId: "emp_1",
      type: "CUSTOM" as const,
      reason: REASON,
      startDate: "2026-01-01",
      endDate: toIsoDate(endDate),
    });

    expect(createRemoteWorkSchema.safeParse(body(onCap)).success).toBe(true);
    expect(createRemoteWorkSchema.safeParse(body(overCap)).success).toBe(false);
  });

  it("requires a reason and bounds its length", () => {
    const base = { employeeId: "emp_1", type: "TODAY" as const };

    expect(createRemoteWorkSchema.safeParse(base).success).toBe(false);
    expect(createRemoteWorkSchema.safeParse({ ...base, reason: "  " }).success).toBe(false);
    expect(createRemoteWorkSchema.safeParse({ ...base, reason: "ab" }).success).toBe(false);
    expect(
      createRemoteWorkSchema.safeParse({ ...base, reason: "x".repeat(MAX_REMOTE_WORK_REASON_LENGTH) })
        .success,
    ).toBe(true);
    expect(
      createRemoteWorkSchema.safeParse({
        ...base,
        reason: "x".repeat(MAX_REMOTE_WORK_REASON_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("requires an employee", () => {
    expect(createRemoteWorkSchema.safeParse({ type: "TODAY", reason: REASON }).success).toBe(false);
    expect(
      createRemoteWorkSchema.safeParse({ employeeId: "", type: "TODAY", reason: REASON }).success,
    ).toBe(false);
  });

  it("refuses an unknown duration", () => {
    expect(
      createRemoteWorkSchema.safeParse({ employeeId: "emp_1", type: "FOREVER", reason: REASON }).success,
    ).toBe(false);
  });

  /**
   * The strictness that would refuse a client sending its own verdict — the
   * property `markAttendanceSchema` exists for, and the one
   * `admin-chat.schema.ts` lost by having the client post a display payload
   * back. There is no field here for a state, a day count or a resolved period,
   * because the browser computes none of them.
   */
  it("refuses a body carrying its own state, day count or dates", () => {
    for (const extra of [
      { state: "ACTIVE" },
      { dayCount: 7 },
      { periodLabel: "Aug 21 – Aug 27" },
      { revokedAt: null },
      { assignedById: "admin_9" },
    ]) {
      const parsed = createRemoteWorkSchema.safeParse({
        employeeId: "emp_1",
        type: "TODAY",
        reason: REASON,
        ...extra,
      });

      expect(parsed.success, Object.keys(extra)[0]).toBe(false);
    }
  });
});

describe("updateRemoteWorkSchema", () => {
  it("accepts moving one date alone", () => {
    expect(updateRemoteWorkSchema.safeParse({ endDate: "2026-09-30" }).success).toBe(true);
    expect(updateRemoteWorkSchema.safeParse({ startDate: "2026-08-25" }).success).toBe(true);
  });

  // The distinction the nullable-and-optional shape exists for: an absent key
  // means leave it alone, an explicit null means make it open-ended. A single
  // optional field could not express both.
  it("tells an absent end date apart from an explicit null", () => {
    const absent = updateRemoteWorkSchema.safeParse({ reason: REASON });
    const cleared = updateRemoteWorkSchema.safeParse({ endDate: null });

    expect(absent.success && absent.data.endDate).toBeUndefined();
    expect(cleared.success && cleared.data.endDate).toBeNull();
  });

  it("refuses a body that changes nothing", () => {
    expect(updateRemoteWorkSchema.safeParse({}).success).toBe(false);
  });

  it("refuses unknown fields", () => {
    expect(updateRemoteWorkSchema.safeParse({ endDate: "2026-09-30", type: "WEEK" }).success).toBe(false);
    expect(updateRemoteWorkSchema.safeParse({ endDate: "2026-09-30", state: "ACTIVE" }).success).toBe(
      false,
    );
  });
});

describe("revokeRemoteWorkSchema", () => {
  it("accepts an empty body — a revocation need not explain itself", () => {
    expect(revokeRemoteWorkSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a reason and bounds it", () => {
    expect(revokeRemoteWorkSchema.safeParse({ reason: "Office reopened" }).success).toBe(true);
    expect(
      revokeRemoteWorkSchema.safeParse({ reason: "x".repeat(MAX_REMOTE_WORK_REASON_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it("refuses a body naming an end date, which is the server's to compute", () => {
    expect(revokeRemoteWorkSchema.safeParse({ endDate: "2026-08-21" }).success).toBe(false);
  });
});

describe("remoteWorkQuerySchema", () => {
  // Not "ALL": the question this screen exists to answer is who is remote, and a
  // default that mixed in every period since the company started would answer a
  // different one.
  it("defaults to the currently-remote view", () => {
    const parsed = remoteWorkQuerySchema.parse({});

    expect(parsed.state).toBe("ACTIVE");
    expect(parsed.population).toBe("ALL");
    expect(parsed.page).toBe(1);
  });

  it("accepts every state filter and refuses anything else", () => {
    for (const state of ["ALL", "ACTIVE", "SCHEDULED", "EXPIRED", "REVOKED"]) {
      expect(remoteWorkQuerySchema.safeParse({ state }).success, state).toBe(true);
    }

    expect(remoteWorkQuerySchema.safeParse({ state: "PENDING" }).success).toBe(false);
  });

  // `SUPER_ADMIN` is not a population, exactly as it is not one on the
  // attendance roster: narrowing a screen to a single named account is not a
  // report on a group.
  it("refuses SUPER_ADMIN as a population", () => {
    expect(remoteWorkQuerySchema.safeParse({ population: "SUPER_ADMIN" }).success).toBe(false);
  });

  it("coerces paging from query strings", () => {
    const parsed = remoteWorkQuerySchema.parse({ page: "3", pageSize: "50" });

    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });
});
