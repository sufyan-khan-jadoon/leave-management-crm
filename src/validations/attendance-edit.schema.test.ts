/**
 * The wire contract for historical editing.
 *
 * Pinned at the **schema** rather than at either end, which is the lesson
 * `admin-chat.schema.test.ts` records: that feature shipped broken because every
 * path was driven against the service directly, with payloads written by hand in
 * the shape the schema wanted, so the one thing actually wrong — the parser
 * refusing what the client sent — was the one thing never exercised.
 */
import { describe, expect, it } from "vitest";

import {
  attendanceEditQuerySchema,
  attendanceEditSchema,
} from "@/validations/attendance-edit.schema";

const valid = { employeeId: "emp_1", date: "2026-08-15", status: "PRESENT" };

describe("attendanceEditSchema", () => {
  it("accepts the three statuses a day can be moved to", () => {
    for (const status of ["PRESENT", "ABSENT", "ON_LEAVE"]) {
      expect(attendanceEditSchema.safeParse({ ...valid, status }).success, status).toBe(true);
    }
  });

  it("normalises the date to UTC midnight, so no browser can shift the day", () => {
    const parsed = attendanceEditSchema.parse(valid);
    expect(parsed.date.toISOString()).toBe("2026-08-15T00:00:00.000Z");
  });

  /**
   * The five statuses that belong to the calendar rather than to a person are
   * not values here at all, so asserting one is refused by the parser rather
   * than reaching a service that would have to explain itself.
   */
  it("refuses a status the feature does not own", () => {
    for (const status of ["CLOSED", "NON_WORKING", "REMOTE", "UPCOMING", "NO_RECORD", "LATE"]) {
      expect(attendanceEditSchema.safeParse({ ...valid, status }).success, status).toBe(false);
    }
  });

  /**
   * `strictObject`, and this is what it buys. The previous status is what gets
   * written into the audit log, and it is re-derived from the roster — a client
   * that could supply its own would be handing the server the verdict it is
   * about to record.
   */
  it("refuses a body carrying its own idea of the previous status", () => {
    const result = attendanceEditSchema.safeParse({ ...valid, previousStatus: "ABSENT" });
    expect(result.success).toBe(false);
  });

  it("refuses the fields the mark dialog carries, which this one deliberately has not", () => {
    // No reason and no arrival time: a one-click correction asks for neither,
    // and the check-in instant is pinned to the day's own cutoff in the service.
    expect(attendanceEditSchema.safeParse({ ...valid, reason: "was here" }).success).toBe(false);
    expect(attendanceEditSchema.safeParse({ ...valid, arrivalTime: "09:00" }).success).toBe(false);
  });

  it("requires all three fields", () => {
    expect(attendanceEditSchema.safeParse({ date: "2026-08-15", status: "PRESENT" }).success).toBe(false);
    expect(attendanceEditSchema.safeParse({ employeeId: "emp_1", status: "PRESENT" }).success).toBe(false);
    expect(attendanceEditSchema.safeParse({ employeeId: "emp_1", date: "2026-08-15" }).success).toBe(false);
  });

  it("refuses an empty employee id and a date that is not one", () => {
    expect(attendanceEditSchema.safeParse({ ...valid, employeeId: "   " }).success).toBe(false);
    expect(attendanceEditSchema.safeParse({ ...valid, date: "the 15th" }).success).toBe(false);
  });

  /**
   * Note what is deliberately *not* refused here: a date in the future or today.
   * The schema has no idea what day it is on the company's calendar, and asking
   * it to guess would put a second opinion beside `isHistoricalDate`. The
   * service refuses it, against `todayUtc()`.
   */
  it("leaves the historical check to the service, which knows the company's date", () => {
    expect(attendanceEditSchema.safeParse({ ...valid, date: "2099-01-01" }).success).toBe(true);
  });
});

describe("attendanceEditQuerySchema", () => {
  it("defaults to the first page of the whole log", () => {
    const parsed = attendanceEditQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.employeeId).toBeUndefined();
    expect(parsed.editedById).toBeUndefined();
  });

  it("keeps the two people separate, because they are two questions", () => {
    const parsed = attendanceEditQuerySchema.parse({ employeeId: "emp_1", editedById: "adm_9" });
    expect(parsed.employeeId).toBe("emp_1");
    expect(parsed.editedById).toBe("adm_9");
  });

  it("narrows on either status", () => {
    const parsed = attendanceEditQuerySchema.parse({ previousStatus: "ABSENT", newStatus: "PRESENT" });
    expect(parsed.previousStatus).toBe("ABSENT");
    expect(parsed.newStatus).toBe("PRESENT");
  });

  it("refuses a status filter the log can never hold", () => {
    expect(attendanceEditQuerySchema.safeParse({ newStatus: "CLOSED" }).success).toBe(false);
  });

  it("bounds the page size, so one request cannot ask for the whole table", () => {
    expect(attendanceEditQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(attendanceEditQuerySchema.safeParse({ pageSize: 0 }).success).toBe(false);
    expect(attendanceEditQuerySchema.parse({ pageSize: "50" }).pageSize).toBe(50);
  });
});
