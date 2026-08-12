import { describe, expect, it } from "vitest";

import {
  adminChatActionSchema,
  toActionRequest,
  type AdminChatAction,
} from "@/validations/admin-chat.schema";

/**
 * The wire contract between the assistant's proposal and the act it performs.
 *
 * Every one of these would have failed before `toActionRequest` existed. The
 * proposal was posted back whole, `strictObject` refused the display fields, and
 * every deletion came back as *"The submitted data is invalid"* — in production,
 * because the smoke run that verified this feature called the service directly
 * and never crossed the schema. What follows crosses it every time.
 */
describe("toActionRequest", () => {
  const removal: AdminChatAction = {
    kind: "remove",
    employeeId: "cmsjdvtj50002ky04grbvudgv",
    name: "sufyan khan",
    email: "sufyan.fullstack.dev@gmail.com",
  };

  const invitation: AdminChatAction = {
    kind: "invite",
    email: "ayesha@example.com",
    role: "EMPLOYEE",
  };

  it("produces a removal the action schema accepts", () => {
    expect(adminChatActionSchema.safeParse(toActionRequest(removal)).success).toBe(true);
  });

  it("produces an invitation the action schema accepts", () => {
    expect(adminChatActionSchema.safeParse(toActionRequest(invitation)).success).toBe(true);
  });

  it("carries the id, and drops what the confirmation only displayed", () => {
    expect(toActionRequest(removal)).toEqual({
      kind: "remove",
      employeeId: "cmsjdvtj50002ky04grbvudgv",
    });
  });

  it("carries the address and role an invitation is actually made from", () => {
    expect(toActionRequest(invitation)).toEqual({
      kind: "invite",
      email: "ayesha@example.com",
      role: "EMPLOYEE",
    });
  });

  it("keeps an ADMIN invitation's role rather than defaulting it", () => {
    const asAdmin = toActionRequest({ ...invitation, role: "ADMIN" });

    expect(asAdmin).toEqual({ kind: "invite", email: "ayesha@example.com", role: "ADMIN" });
    expect(adminChatActionSchema.safeParse(asAdmin).success).toBe(true);
  });

  /**
   * The failure exactly as it shipped. Pinned so that anyone tempted to post the
   * proposal straight back sees why it cannot be, rather than rediscovering it
   * from a bug report.
   */
  it("refuses the whole proposal when it is posted back unnarrowed", () => {
    const result = adminChatActionSchema.safeParse({ ...removal, status: "ACTIVE" });

    expect(result.success).toBe(false);
  });

  /** A field nobody reads is refused loudly, as `markAttendanceSchema` is. */
  it("refuses an input the endpoint does not accept", () => {
    const result = adminChatActionSchema.safeParse({
      ...toActionRequest(removal),
      confirmed: true,
    });

    expect(result.success).toBe(false);
  });

  /** `SUPER_ADMIN` cannot be minted by invitation, so it is not a role to send. */
  it("refuses an invitation to the owner's role", () => {
    const result = adminChatActionSchema.safeParse({
      kind: "invite",
      email: "someone@example.com",
      role: "SUPER_ADMIN",
    });

    expect(result.success).toBe(false);
  });

  it("refuses a removal carrying no id", () => {
    expect(adminChatActionSchema.safeParse({ kind: "remove", employeeId: "" }).success).toBe(false);
  });

  it("refuses an invitation to something that is not an address", () => {
    const result = adminChatActionSchema.safeParse({
      kind: "invite",
      email: "not-an-address",
      role: "EMPLOYEE",
    });

    expect(result.success).toBe(false);
  });
});
