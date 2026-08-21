import { describe, expect, it } from "vitest";

import { employeeReportRequestSchema } from "@/validations/employee-report.schema";

/**
 * The wire contract for one person's report.
 *
 * Pinned at the schema rather than at either end, which is the lesson
 * `admin-chat.schema.test.ts` records: a driver that constructs its own request
 * tests your understanding of the contract instead of the contract, and the one
 * thing actually wrong is the one thing not exercised.
 */
const parse = (body: unknown) => employeeReportRequestSchema.safeParse(body);

describe("employeeReportRequestSchema", () => {
  it("accepts a bare preset and defaults the paging", () => {
    const result = parse({ range: "THIS_MONTH" });

    expect(result.success).toBe(true);
    expect(result.data?.page).toBe(1);
    expect(result.data?.pageSize).toBe(31);
    expect(result.data?.startDate).toBeUndefined();
  });

  it("accepts every preset the screen offers", () => {
    for (const range of ["TODAY", "THIS_WEEK", "THIS_MONTH", "PREVIOUS_MONTH", "THIS_YEAR"]) {
      expect(parse({ range }).success).toBe(true);
    }
  });

  it("refuses a preset that arrives carrying its own dates", () => {
    // Refused rather than ignored. The dates a preset resolves to are the
    // server's to work out against the company's calendar day, so a body holding
    // both is a client that believes it decided something it did not — and
    // silently dropping the fields would leave it believing that.
    expect(parse({ range: "THIS_MONTH", startDate: "2026-08-01" }).success).toBe(false);
    expect(parse({ range: "TODAY", endDate: "2026-08-31" }).success).toBe(false);
    expect(
      parse({ range: "THIS_YEAR", startDate: "2026-01-01", endDate: "2026-12-31" }).success,
    ).toBe(false);
  });

  it("resolves a custom range to UTC midnight at both ends", () => {
    const result = parse({ range: "CUSTOM", startDate: "2026-08-01", endDate: "2026-08-31" });

    expect(result.success).toBe(true);
    expect(result.data?.startDate?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(result.data?.endDate?.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("requires both ends of a custom range", () => {
    expect(parse({ range: "CUSTOM" }).success).toBe(false);
    expect(parse({ range: "CUSTOM", startDate: "2026-08-01" }).success).toBe(false);
    expect(parse({ range: "CUSTOM", endDate: "2026-08-31" }).success).toBe(false);
  });

  it("refuses a backwards range, and says which field", () => {
    const result = parse({ range: "CUSTOM", startDate: "2026-08-31", endDate: "2026-08-01" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["endDate"]);
  });

  it("accepts a single day expressed as a custom range", () => {
    expect(parse({ range: "CUSTOM", startDate: "2026-08-21", endDate: "2026-08-21" }).success).toBe(
      true,
    );
  });

  it("refuses a range longer than a report may cover", () => {
    // 366 days inclusive is the bound; 367 is one past it.
    expect(parse({ range: "CUSTOM", startDate: "2026-01-01", endDate: "2026-12-31" }).success).toBe(
      true,
    );
    expect(parse({ range: "CUSTOM", startDate: "2026-01-01", endDate: "2027-01-02" }).success).toBe(
      false,
    );
  });

  it("refuses a range that is not a real date", () => {
    expect(parse({ range: "CUSTOM", startDate: "2026-02-30", endDate: "2026-03-01" }).success).toBe(
      false,
    );
    expect(parse({ range: "CUSTOM", startDate: "01/08/2026", endDate: "2026-08-31" }).success).toBe(
      false,
    );
  });

  it("refuses a range it has never heard of", () => {
    expect(parse({ range: "LAST_YEAR" }).success).toBe(false);
    expect(parse({}).success).toBe(false);
  });

  /**
   * The strictness is the point. There is no field for a total, a rate, a
   * working-day count or a day's verdict, because the browser computes none of
   * them — a payload carrying one is a client telling the server what its own
   * records add up to, and it is refused loudly rather than stripped in silence.
   */
  it("refuses a body carrying its own figures", () => {
    expect(parse({ range: "THIS_MONTH", attendanceRate: 1 }).success).toBe(false);
    expect(parse({ range: "THIS_MONTH", totals: { present: 20 } }).success).toBe(false);
    expect(parse({ range: "THIS_MONTH", workingDays: 22 }).success).toBe(false);
    expect(parse({ range: "THIS_MONTH", calendar: [] }).success).toBe(false);
  });

  /**
   * And no field for a person. The subject is named in the path, and the service
   * re-reads it through `byIdForActor` — a body able to name somebody would be a
   * second place the report's subject came from, with only one of them checked.
   */
  it("has no way to name whose report this is", () => {
    expect(parse({ range: "THIS_MONTH", employeeId: "abc" }).success).toBe(false);
    expect(parse({ range: "THIS_MONTH", selectedUserIds: ["abc"] }).success).toBe(false);
  });

  /** Nor any way to widen what the report holds — see the schema's own note. */
  it("has no record-type, search or status filter", () => {
    expect(parse({ range: "THIS_MONTH", recordTypes: ["ABSENT"] }).success).toBe(false);
    expect(parse({ range: "THIS_MONTH", status: "LATE" }).success).toBe(false);
    expect(parse({ range: "THIS_MONTH", search: "ali" }).success).toBe(false);
    expect(parse({ range: "THIS_MONTH", people: "EVERYONE" }).success).toBe(false);
  });

  it("bounds the paging", () => {
    expect(parse({ range: "THIS_MONTH", page: 0 }).success).toBe(false);
    expect(parse({ range: "THIS_MONTH", pageSize: 0 }).success).toBe(false);
    expect(parse({ range: "THIS_MONTH", pageSize: 201 }).success).toBe(false);
    expect(parse({ range: "THIS_MONTH", page: 2, pageSize: 50 }).success).toBe(true);
  });
});
