import { z } from "zod";

import { emailSchema } from "@/validations/auth.schema";

const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(600),
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Enter a valid date");

/**
 * The second half of a disambiguation, echoed back with the chosen person.
 *
 * Inputs only, never an answer — the reply is recomputed from the database
 * against `employeeId`, exactly as confirming a leave proposal re-runs the
 * plan. An administrator who edited this could ask about a different
 * colleague or a different day, both of which they may already do by typing
 * the question, so there is nothing here to escalate.
 *
 * `employeeId` is the point of the whole exchange: once a name has matched
 * more than one person, only the id may be used to look anything up.
 */
const resolvedPersonSchema = z.object({
  employeeId: z.string().trim().min(1).max(40),
  view: z.enum(["status", "history", "remove"]),
  date: isoDate,
  endDate: isoDate.nullish(),
});

/**
 * One turn of the admin workforce assistant.
 *
 * The conversation is replayed by the client each turn and nothing about it is
 * stored, matching the leave chat: the raw wording never reaches the database.
 */
export const adminChatSchema = z.object({
  messages: z.array(chatTurnSchema).min(1, "Ask something first").max(24, "This conversation is too long"),
  resolved: resolvedPersonSchema.nullish(),
});

export type AdminChatInput = z.infer<typeof adminChatSchema>;

/**
 * An act the administrator approved, and the whole of what is carried out.
 *
 * A **discriminated union of the inputs alone**, deliberately: only the id or the
 * address and role travel, and everything the proposal displayed — the name, the
 * status, the department — is re-read from the database when it runs. A payload
 * that lied about any of it would change what the confirmation *said*, never what
 * happens, so there is nothing here worth forging.
 *
 * There is equally nothing to escalate. Both branches are executed through
 * `employeeService.remove` and `invitationService.invite`, which decide authority
 * from the session's own account against the row in the database — so the worst a
 * hand-written body can do is ask for something the caller could already do from
 * the Staff screen, and be refused by the same code.
 *
 * `z.strictObject` on both, following `markAttendanceSchema`: a field nobody
 * reads is better refused loudly than quietly ignored. That strictness is right
 * and it bit — see `toActionRequest` below for what it caught and what now keeps
 * the two sides in step.
 */
export const adminChatActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("remove"),
    employeeId: z.string().trim().min(1).max(40),
  }),
  z.strictObject({
    kind: z.literal("invite"),
    email: emailSchema,
    role: z.enum(["EMPLOYEE", "ADMIN"]),
  }),
]);

export type AdminChatActionInput = z.infer<typeof adminChatActionSchema>;

/**
 * What the assistant proposes, as the administrator sees it on screen.
 *
 * Wider than the request above, and deliberately so: `name` labels the confirm
 * button. It lives here rather than in `admin-chat.service.ts` so that the shape
 * the server sends and the shape the client may post are declared in one file,
 * beside the function that converts between them.
 */
export type AdminChatAction =
  | { kind: "remove"; employeeId: string; name: string; email: string }
  | { kind: "invite"; email: string; role: "EMPLOYEE" | "ADMIN" };

/**
 * The inputs alone, in the shape `adminChatActionSchema` accepts.
 *
 * **This exists because the client posted the proposal back whole.** The removal
 * branch carried the name, address, role, status, department and position for the
 * confirmation to display, `strictObject` refused all six, and every deletion
 * failed with *"The submitted data is invalid"* — while invitations worked, since
 * those happen to be inputs the whole way through. One half of the wire contract
 * was a Zod schema and the other was a hand-written object literal, and nothing
 * compared them; the test beside this file now does.
 *
 * Narrowing here rather than loosening the schema is the deliberate half. The
 * strictness is what would refuse a client that tried to send its own verdict, and
 * dropping display fields is the client's job precisely because the server re-reads
 * every one of them from the database before acting on the id.
 */
export function toActionRequest(action: AdminChatAction): AdminChatActionInput {
  return action.kind === "remove"
    ? { kind: "remove", employeeId: action.employeeId }
    : { kind: "invite", email: action.email, role: action.role };
}
