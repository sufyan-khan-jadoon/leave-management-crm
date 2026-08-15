import { describe, expect, it } from "vitest";

import { toIsoDate } from "@/lib/date";
import { MAX_REPORT_RANGE_DAYS } from "@/lib/report-period";
import { MAX_SELECTED_PEOPLE, reportRequestSchema } from "@/validations/report.schema";

/**
 * The wire contract for a report request.
 *
 * This suite exists because of a defect this codebase has already shipped once:
 * the admin assistant's staff actions were verified end to end by calling the
 * service directly with a payload written by hand in the shape the schema
 * wanted, so the one thing actually wrong — the route's own `parseBody` refusing
 * what the client posted — was the one thing never exercised. **Verify the wire,
 * not the two ends.** These are the bodies `report-builder.tsx` actually sends,
 * parsed by the schema the route actually uses.
 */

/** Exactly what the screen posts for a whole month, everybody, everything. */
const monthly = {
  period: "MONTHLY",
  month: 8,
  year: 2026,
  people: "EVERYONE",
  selectedUserIds: [],
  recordTypes: ["ATTENDANCE", "ABSENT", "LEAVE"],
  role: "ALL",
  status: "ALL",
  page: 1,
  pageSize: 25,
};

describe("reportRequestSchema — the three period shapes", () => {
  it("resolves a month to its first and last day", () => {
    const parsed = reportRequestSchema.parse(monthly);

    expect(parsed.period.kind).toBe("MONTHLY");
    expect(toIsoDate(parsed.period.from)).toBe("2026-08-01");
    expect(toIsoDate(parsed.period.to)).toBe("2026-08-31");
  });

  it("resolves a single day to a range of itself", () => {
    const parsed = reportRequestSchema.parse({
      period: "DAILY",
      date: "2026-08-16",
      people: "EVERYONE",
      selectedUserIds: [],
      recordTypes: ["ATTENDANCE", "ABSENT", "LEAVE"],
      role: "ALL",
      status: "ALL",
      page: 1,
      pageSize: 25,
    });

    expect(parsed.period.kind).toBe("DAILY");
    expect(toIsoDate(parsed.period.from)).toBe("2026-08-16");
    expect(toIsoDate(parsed.period.to)).toBe("2026-08-16");
  });

  it("carries a custom range through unchanged", () => {
    const parsed = reportRequestSchema.parse({
      period: "CUSTOM",
      startDate: "2026-08-01",
      endDate: "2026-08-15",
      people: "SELECTED_ADMINS",
      selectedUserIds: ["abc"],
      recordTypes: ["ATTENDANCE"],
    });

    expect(toIsoDate(parsed.period.from)).toBe("2026-08-01");
    expect(toIsoDate(parsed.period.to)).toBe("2026-08-15");
  });

  // The discriminated union is what stops one shape's fields riding along with
  // another's — a month has no end date to contradict it.
  it("refuses a month carrying a custom range's fields", () => {
    expect(
      reportRequestSchema.safeParse({ ...monthly, startDate: "2026-08-01", endDate: "2026-08-15" })
        .success,
    ).toBe(false);
  });

  it("refuses an unknown period", () => {
    expect(reportRequestSchema.safeParse({ ...monthly, period: "YEARLY" }).success).toBe(false);
  });
});

describe("reportRequestSchema — the range bounds", () => {
  it("refuses an end date before the start date", () => {
    const result = reportRequestSchema.safeParse({
      period: "CUSTOM",
      startDate: "2026-08-15",
      endDate: "2026-08-01",
      people: "EVERYONE",
      recordTypes: ["ATTENDANCE"],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("The end date cannot be before the start date.");
  });

  it("accepts a start and end on the same day", () => {
    expect(
      reportRequestSchema.safeParse({
        period: "CUSTOM",
        startDate: "2026-08-16",
        endDate: "2026-08-16",
        people: "EVERYONE",
        recordTypes: ["ABSENT"],
      }).success,
    ).toBe(true);
  });

  it("refuses a range longer than the maximum", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const over = new Date(from.getTime() + MAX_REPORT_RANGE_DAYS * 86_400_000);

    const result = reportRequestSchema.safeParse({
      period: "CUSTOM",
      startDate: toIsoDate(from),
      endDate: toIsoDate(over),
      people: "EVERYONE",
      recordTypes: ["ATTENDANCE"],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(`at most ${MAX_REPORT_RANGE_DAYS} days`);
  });

  // `calendarDateSchema` pins the shape first, which is the whole of why the
  // transform is safe — `new Date("…")` is only reliably UTC midnight for this
  // exact format, and a day-first date would otherwise be read as a month.
  it("refuses a date that is not in ISO order", () => {
    expect(
      reportRequestSchema.safeParse({
        period: "DAILY",
        date: "16-08-2026",
        people: "EVERYONE",
        recordTypes: ["ATTENDANCE"],
      }).success,
    ).toBe(false);
  });
});

describe("reportRequestSchema — record types", () => {
  it("refuses an empty set", () => {
    const result = reportRequestSchema.safeParse({ ...monthly, recordTypes: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Choose at least one record type.");
  });

  it("refuses a type that is not one of the three", () => {
    expect(reportRequestSchema.safeParse({ ...monthly, recordTypes: ["ALL"] }).success).toBe(false);
  });

  // "All" is the three of them chosen. There is deliberately no fourth literal
  // meaning "the other three", so a repeated value is a client bug rather than
  // an instruction — the set it describes is unambiguous either way.
  it("de-duplicates repeats rather than refusing them", () => {
    const parsed = reportRequestSchema.parse({
      ...monthly,
      recordTypes: ["LEAVE", "LEAVE", "ATTENDANCE"],
    });

    expect(parsed.recordTypes).toEqual(["LEAVE", "ATTENDANCE"]);
  });

  it("accepts each pair", () => {
    for (const pair of [
      ["ATTENDANCE", "ABSENT"],
      ["ATTENDANCE", "LEAVE"],
      ["ABSENT", "LEAVE"],
    ]) {
      expect(reportRequestSchema.safeParse({ ...monthly, recordTypes: pair }).success).toBe(true);
    }
  });
});

describe("reportRequestSchema — people", () => {
  it("accepts every selection the screen offers", () => {
    for (const people of [
      "EVERYONE",
      "ALL_EMPLOYEES",
      "ALL_ADMINS",
      "SELECTED_EMPLOYEES",
      "SELECTED_ADMINS",
    ]) {
      expect(
        reportRequestSchema.safeParse({ ...monthly, people, selectedUserIds: ["abc"] }).success,
      ).toBe(true);
    }
  });

  it("refuses a selection it does not know", () => {
    expect(reportRequestSchema.safeParse({ ...monthly, people: "SUPER_ADMIN" }).success).toBe(false);
  });

  // Accepted here and refused in the service, which is the
  // looser-schema-with-the-real-check-behind-it split the invitation and roster
  // routes already use: a shape that could not express the request would mean
  // two endpoints for one screen.
  it("accepts an empty id list, leaving the refusal to the service", () => {
    expect(
      reportRequestSchema.safeParse({ ...monthly, people: "SELECTED_EMPLOYEES", selectedUserIds: [] })
        .success,
    ).toBe(true);
  });

  it("defaults the id list when it is left off entirely", () => {
    const { selectedUserIds, ...withoutIds } = monthly;
    void selectedUserIds;

    expect(reportRequestSchema.parse(withoutIds).selectedUserIds).toEqual([]);
  });

  it("refuses more ids than one report may name", () => {
    expect(
      reportRequestSchema.safeParse({
        ...monthly,
        people: "SELECTED_EMPLOYEES",
        selectedUserIds: Array.from({ length: MAX_SELECTED_PEOPLE + 1 }, (_, index) => `id-${index}`),
      }).success,
    ).toBe(false);
  });
});

describe("reportRequestSchema — refinements and strictness", () => {
  it("defaults the narrowing to nothing", () => {
    const parsed = reportRequestSchema.parse({
      period: "MONTHLY",
      month: 8,
      year: 2026,
      people: "EVERYONE",
      recordTypes: ["ATTENDANCE"],
    });

    expect(parsed.role).toBe("ALL");
    expect(parsed.status).toBe("ALL");
    expect(parsed.page).toBe(1);
    expect(parsed.search).toBeUndefined();
  });

  it("accepts LATE as a status, which narrows within present rather than beside it", () => {
    expect(reportRequestSchema.parse({ ...monthly, status: "LATE" }).status).toBe("LATE");
  });

  it("refuses a status that is not one it offers", () => {
    expect(reportRequestSchema.safeParse({ ...monthly, status: "NO_RECORD" }).success).toBe(false);
  });

  /**
   * The strictness is the point, not tidiness: there is no field here for a
   * total, a count or a summary, because the browser computes none of them. A
   * payload carrying one is a client trying to tell the server what its own
   * records add up to, and it is refused loudly rather than stripped in silence.
   */
  it("refuses a body carrying its own totals", () => {
    expect(
      reportRequestSchema.safeParse({ ...monthly, totals: { present: 19, absent: 1 } }).success,
    ).toBe(false);
  });

  it("refuses any unknown field", () => {
    expect(reportRequestSchema.safeParse({ ...monthly, includeSuperAdmin: true }).success).toBe(false);
  });
});
