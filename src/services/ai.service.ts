import { z } from "zod";

import { AiServiceError } from "@/lib/errors";
import { serverEnv } from "@/lib/env";
import { addUtcDays, currentTimeInAppZone, toIsoDate, utcWeekday } from "@/lib/date";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * What the assistant decided the employee wants.
 *
 * The model classifies and extracts only. It is never asked for balances, dates
 * already booked, or whether a request fits the allowance — those come from the
 * database, so a confident-sounding wrong number cannot reach the employee.
 *
 * `hours` exists for that reason rather than for the model's benefit. Asked when
 * the office opens, it used to fall to `other`, whose `reply` is passed through
 * untouched — and it answered "9:00 AM to 5:00 PM, Monday to Friday", a sentence
 * that appears nowhere in this codebase and got the working week wrong for any
 * company that does not rest at the weekend. Classifying it routes the question
 * to the one place that knows.
 */
const chatIntentSchema = z.object({
  intent: z.enum(["book", "balance", "history", "hours", "time", "other"]),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be an ISO calendar date")
    .nullish(),
  days: z.number().int().min(1).max(366).nullish(),
  reason: z.string().trim().max(280).nullish(),
  reply: z.string().trim().min(1).max(600),
});

export type LeaveChatIntent = z.infer<typeof chatIntentSchema>;

export type ChatTurn = { role: "user" | "assistant"; content: string };

type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

/**
 * Reads a conversation and reports what the employee is asking for.
 *
 * A malformed reply is retried once with a corrective instruction; a second
 * failure raises AiServiceError rather than throwing an unhandled parse error.
 */
export async function interpretLeaveChat(turns: ChatTurn[], today: Date): Promise<LeaveChatIntent> {
  const system = buildChatSystemPrompt(today);
  const messages: ChatTurn[] = turns.slice(-12);

  const first = await requestIntent(system, messages);
  if (first.ok) return first.value;

  console.warn("[ai] First chat interpretation failed:", first.reason);

  const retry = await requestIntent(`${system}\n\nYour previous answer was rejected because: ${first.reason}\nReturn ONLY the JSON object described above.`, messages);
  if (retry.ok) return retry.value;

  console.error("[ai] Chat interpretation failed after retry:", retry.reason);
  throw new AiServiceError("I didn't catch that. Try something like \"I need 3 days off from Monday for a family wedding\".");
}

type Attempt<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * One round trip, parsed and validated against `schema`.
 *
 * Generic over the shape because there are now two assistants — the employee's
 * leave chat and the admin workforce assistant — and they differ only in their
 * prompt and their intent shape. Everything around that is identical, and a
 * second copy of the fence-tolerant JSON extraction is the last thing this
 * codebase needs.
 */
async function requestJson<T>(
  system: string,
  turns: ChatTurn[],
  schema: z.ZodType<T>,
): Promise<Attempt<T>> {
  let raw: string;

  try {
    raw = await callGroq(system, turns);
  } catch (error) {
    // Transport/auth failures are terminal — surface immediately rather than
    // burning the retry on a request that cannot succeed.
    if (error instanceof AiServiceError) throw error;
    return { ok: false, reason: error instanceof Error ? error.message : "Unknown Groq error" };
  }

  const json = extractJsonObject(raw);
  if (!json) return { ok: false, reason: `Response contained no JSON object: ${raw.slice(0, 200)}` };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: `Malformed JSON: ${json.slice(0, 200)}` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: result.error.issues.map((issue) => issue.message).join("; ") };
  }

  return { ok: true, value: result.data };
}

async function requestIntent(system: string, turns: ChatTurn[]): Promise<Attempt<LeaveChatIntent>> {
  const attempt = await requestJson(system, turns, chatIntentSchema);
  if (!attempt.ok) return attempt;

  if (attempt.value.startDate && Number.isNaN(Date.parse(`${attempt.value.startDate}T00:00:00.000Z`))) {
    return { ok: false, reason: `Not a real calendar date: ${attempt.value.startDate}` };
  }

  return attempt;
}

async function callGroq(system: string, turns: ChatTurn[]): Promise<string> {
  const env = serverEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        temperature: 0,
        max_tokens: 400,
        // Syntax-level JSON only. Groq enforces a schema just on the gpt-oss
        // models, so the shape is validated with Zod instead — that keeps any
        // model swappable through GROQ_MODEL without touching this call.
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, ...turns],
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as GroqResponse | null;
      const detail = body?.error?.message ?? `HTTP ${response.status}`;
      console.error("[ai] Groq request rejected:", detail);

      throw new AiServiceError(
        response.status === 401 || response.status === 403
          ? "The AI service is not configured correctly. Please contact your administrator."
          : response.status === 429
            ? "The AI assistant is busy right now. Please try again in a moment."
            : "The AI assistant is temporarily unavailable. Please try again in a moment.",
      );
    }

    const body = (await response.json()) as GroqResponse;
    const text = body.choices?.[0]?.message?.content ?? "";

    if (!text.trim()) throw new Error("Groq returned an empty response");

    return text;
  } catch (error) {
    if (error instanceof AiServiceError) throw error;

    if (error instanceof Error && error.name === "AbortError") {
      throw new AiServiceError("The AI assistant took too long to respond. Please try again.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Small models reliably get weekday arithmetic wrong — "Friday" lands a day off,
 * "next Monday" lands on a Saturday. The next three weeks are therefore spelled
 * out so resolving a weekday is a table lookup rather than a calculation.
 */
function buildCalendar(today: Date): string {
  return Array.from({ length: 22 }, (_, offset) => {
    const day = addUtcDays(today, offset);
    const marker = offset === 0 ? "  <- today" : offset === 1 ? "  <- tomorrow" : "";
    return `${toIsoDate(day)} = ${utcWeekday(day)}${marker}`;
  }).join("\n");
}

function buildChatSystemPrompt(today: Date): string {
  const iso = toIsoDate(today);
  // Computed rather than written by hand so the weekday example is always a
  // real upcoming Friday, whatever day the prompt is built on.
  const nextFriday = toIsoDate(
    Array.from({ length: 8 }, (_, offset) => addUtcDays(today, offset + 1)).find(
      (day) => utcWeekday(day) === "Friday",
    ) ?? addUtcDays(today, 1),
  );

  return `You are the leave assistant for an HR system.
Today is ${iso} (${utcWeekday(today)}). The local time is ${currentTimeInAppZone()} in Pakistan.

Calendar reference — use these exact pairings, do not compute dates yourself:
${buildCalendar(today)}

Reply with a single JSON object and nothing else:
{
  "intent": "book" | "balance" | "history" | "hours" | "time" | "other",
  "startDate": "YYYY-MM-DD" or null,
  "days": whole number or null,
  "reason": "short reason" or null,
  "reply": "what to say to the employee"
}

Choose the intent:
- "book" when they want time off. Fill startDate, days and reason.
- "balance" when they ask how much leave they have left.
- "history" when they ask about leave they already booked.
- "hours" when they ask about office hours, opening or closing time, timings,
  shift times, or which days of the week the office works.
- "time" when they ask what the time is now, what today's date is, or what day
  of the week it is.
- "other" for anything else, including greetings.

NEVER state a fact about this company that you were not given above. You do not
know the office hours, the working days, the public holidays, the leave
allowance, or any policy. If you are asked one, classify it — "hours" for
timings and working days, "time" for the clock and today's date — and let the
system answer. If it fits no intent, use "other" and say plainly that you do
not have that information and they should ask their administrator. Inventing a
plausible answer is the worst outcome available to you: it is indistinguishable
from a real one to the person reading it, and they will act on it.

Classifying is not refusing. "What time is it" has an answer and "time" is how
you reach it — do not answer a question with "I don't have that information"
when one of the intents above covers it.

Rules for "book":
- NEVER invent a start date. Only ever use ${iso}, a date the employee named, or
  a date copied from the calendar above. If you cannot point at one of those,
  the answer is ${iso}.
- A duration with no start means it begins today. "5 days", "coming 5 days",
  "make it 3 days" and "3 days off" all start ${iso}.
- "from today" starts ${iso}. A bare weekday name means the FIRST row above with
  that weekday, excluding today's row. Copy that row's date exactly.
- Every calendar day counts, weekends included.
- "on Friday" with no duration means days=1.
- Carry over what the employee already told you earlier in the conversation. If
  they gave a reason and are now changing the length, keep the reason and only
  change "days".
- Only the reason may be missing. If it is, leave it null and ask for it.
- Never ask which day it starts when they have given a duration or named a
  weekday. A duration alone means today; a weekday means the calendar row.
- Never state whether the request is approved, how many days remain, or what
  dates are already booked. The system decides that and tells them separately.
  When every field is known, "reply" should be a short neutral restatement.

For "balance", "history", "hours" and "time", "reply" is ignored — the system
answers from the company's own records and clock — so a brief acknowledgement is
enough. Do not put times, dates or day names in it; nobody will read them.

Keep "reply" to one or two short sentences, plain and friendly.

Worked examples for today = ${iso}:

"I need leave for 4 days from today for a family wedding"
{"intent":"book","startDate":"${iso}","days":4,"reason":"family wedding","reply":"That's 4 days from ${iso} for a family wedding."}

"I have leave for coming 5 days"
{"intent":"book","startDate":"${iso}","days":5,"reason":null,"reply":"What's the reason for the 5 days off?"}

"ok make it of three days" (after the above, reason was "back pain")
{"intent":"book","startDate":"${iso}","days":3,"reason":"back pain","reply":"That's 3 days from ${iso} for back pain."}

"I want 2 days off next week, I'm moving house"
{"intent":"book","startDate":null,"days":2,"reason":"moving house","reply":"Which day next week should it start?"}

"I need leave on Friday for university exams"
{"intent":"book","startDate":"${nextFriday}","days":1,"reason":"university exams","reply":"That's Friday ${nextFriday} for university exams."}

"taking tomorrow off"
{"intent":"book","startDate":"${toIsoDate(addUtcDays(today, 1))}","days":1,"reason":null,"reply":"What's the reason for the day off?"}

"how many leaves do I have left"
{"intent":"balance","startDate":null,"days":null,"reason":null,"reply":"Checking your balance."}

"what are the timings of office"
{"intent":"hours","startDate":null,"days":null,"reason":null,"reply":"Let me check the office hours."}

"what time does the office close on Friday"
{"intent":"hours","startDate":null,"days":null,"reason":null,"reply":"Let me check that."}

"what time is it"
{"intent":"time","startDate":null,"days":null,"reason":null,"reply":"Let me check the clock."}

"whats the date today"
{"intent":"time","startDate":null,"days":null,"reason":null,"reply":"Let me check."}

"how much is the medical allowance"
{"intent":"other","startDate":null,"days":null,"reason":null,"reply":"I don't have that information — your administrator can tell you."}`;
}

/**
 * What the assistant decided an administrator is asking about the workforce.
 *
 * The same bargain the leave chat strikes, and for the same reason: the model
 * classifies and extracts, and every name, count and status the administrator
 * reads is fetched from the database afterwards. It is never asked who was in
 * — a confidently invented roster is indistinguishable from a real one to
 * somebody about to act on it.
 *
 * `name` is a *search term*, not an answer. The model has no way to know which
 * of two people called Sufyan Khan is meant, so it does not try: it hands the
 * string over and `admin-chat.service.ts` resolves it to a unique id or asks.
 */
const adminIntentSchema = z.object({
  intent: z.enum(["roster", "person", "invite", "remove", "other"]),
  view: z.enum(["present", "absent", "leave", "summary", "status", "history"]).nullish(),
  name: z.string().trim().min(1).max(80).nullish(),
  /**
   * The mailbox to invite. Echoed back for confirmation before anything is sent,
   * because a mistyped address is an invitation delivered to a stranger and an
   * email cannot be recalled — so the administrator approves the literal string,
   * exactly as they would have typed it into the Staff form.
   */
  email: z.string().trim().max(200).nullish(),
  /**
   * Which role an invitation would grant. `SUPER_ADMIN` is absent here as it is
   * absent from `inviteRoleSchema`: no invitation can mint another owner, and a
   * value the model cannot produce is one the service never has to refuse.
   */
  role: z.enum(["EMPLOYEE", "ADMIN"]).nullish(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be an ISO calendar date")
    .nullish(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be an ISO calendar date")
    .nullish(),
  reply: z.string().trim().min(1).max(600),
});

export type AdminChatIntent = z.infer<typeof adminIntentSchema>;

/** Reads a conversation and reports what the administrator wants to know. */
export async function interpretAdminChat(turns: ChatTurn[], today: Date): Promise<AdminChatIntent> {
  const system = buildAdminSystemPrompt(today);
  const messages: ChatTurn[] = turns.slice(-12);

  const first = await requestJson(system, messages, adminIntentSchema);
  if (first.ok) return first.value;

  console.warn("[ai] First admin interpretation failed:", first.reason);

  const retry = await requestJson(
    `${system}\n\nYour previous answer was rejected because: ${first.reason}\nReturn ONLY the JSON object described above.`,
    messages,
    adminIntentSchema,
  );
  if (retry.ok) return retry.value;

  console.error("[ai] Admin interpretation failed after retry:", retry.reason);
  throw new AiServiceError(
    'I didn\'t catch that. Try something like "who is absent today" or "was Sufyan present yesterday".',
  );
}

/**
 * Three weeks back and two forward.
 *
 * The leave assistant's calendar only runs forwards, because an employee books
 * time off ahead of themselves. An administrator asks about what already
 * happened — "yesterday", "last Monday", "last week" — so the table has to
 * reach backwards or every one of those becomes arithmetic the model gets
 * wrong.
 */
function buildAdminCalendar(today: Date): string {
  return Array.from({ length: 36 }, (_, index) => {
    const offset = index - 21;
    const day = addUtcDays(today, offset);
    const marker =
      offset === 0 ? "  <- today" : offset === -1 ? "  <- yesterday" : offset === 1 ? "  <- tomorrow" : "";

    return `${toIsoDate(day)} = ${utcWeekday(day)}${marker}`;
  }).join("\n");
}

function buildAdminSystemPrompt(today: Date): string {
  const iso = toIsoDate(today);

  return `You are the workforce assistant for an HR system, talking to an administrator.
Today is ${iso} (${utcWeekday(today)}). The local time is ${currentTimeInAppZone()} in Pakistan.

Calendar reference — use these exact pairings, do not compute dates yourself:
${buildAdminCalendar(today)}

Reply with a single JSON object and nothing else:
{
  "intent": "roster" | "person" | "invite" | "remove" | "other",
  "view": "present" | "absent" | "leave" | "summary" | "status" | "history" or null,
  "name": "employee name" or null,
  "email": "an email address" or null,
  "role": "EMPLOYEE" | "ADMIN" or null,
  "date": "YYYY-MM-DD" or null,
  "endDate": "YYYY-MM-DD" or null,
  "reply": "what to say to the administrator"
}

Choose the intent:
- "roster" when they ask about the workforce as a whole. Set "view":
  - "present" — who is in, who came, who checked in, how many are working.
  - "absent"  — who is out, who missed the day, who did not turn up.
  - "leave"   — who is on leave or on holiday.
  - "summary" — general attendance for a day, or a mix of the above.
- "person" when they ask about one named individual. Put the name in "name" and set "view":
  - "status"  — where they are, are they in, are they present, are they on leave, are they working.
  - "history" — their attendance over a stretch of days, or when they were last absent or last in.
- "invite" when they want to add, invite, onboard or hire somebody. Put the address
  in "email" and the role in "role" — "ADMIN" only if they said administrator or
  admin, otherwise "EMPLOYEE". Leave "email" null if they gave no address.
- "remove" when they want to delete, remove, offboard, sack or get rid of somebody.
  Put who they named in "name".
- "other" for greetings and anything that is not about attendance, leave or staff.

Dates:
- Always fill "date" for "roster" and for "person". If they named no day, use ${iso}.
- Copy the date from the calendar above. Never compute one yourself.
- For a range — "this week", "last week", "the last 5 days" — put the first day in
  "date" and the last in "endDate". Otherwise leave "endDate" null.
- "this week" means the most recent Monday above through today. "last week" means
  the seven days before that Monday.

NEVER state a fact about this company that you were not given above. You do not
know who is present, who is absent, who is on leave, how many people work here,
what anybody's department is, or whether the office was open. If you are asked,
classify it and let the system look it up. Inventing a plausible answer is the
worst outcome available to you: to the administrator reading it, an invented
roster is indistinguishable from a real one, and they will act on it.

Classifying is not refusing. "Where is Sufyan" and "when was he last absent" both
have answers, and "person" is how you reach them — never reply that you do not
have attendance records or cannot look up an individual when one of the intents
above covers the question.

You do not know who works here, so you cannot judge whether a name is a real
one. **Any name is a name.** However odd or unfamiliar it looks — a single word,
a job title, a surname on its own — put it in "name" and let the system search.
Deciding for yourself that somebody is not an employee is the same invention as
making up a roster, and it refuses a question that had an answer.

Never guess which person is meant when a name could match more than one. Just
put what they typed in "name" — the system finds the matches and asks.

"invite" and "remove" do not happen when you classify them. You are writing down
what was asked; the system finds the person, checks whether this administrator is
allowed, and puts it to them to approve before anything is sent or deleted. So
never confirm, never report it done, and never claim somebody has been added or
removed. Your "reply" is discarded for both. Never invent an email address, and
never guess one from a name — if they gave no address, leave "email" null and the
system will ask for it.

For "roster", "person", "invite" and "remove", "reply" is ignored: the system
answers from the company's own records. A brief acknowledgement is enough, with
no names, counts, dates or statuses in it — nobody will read them.

Keep "reply" to one or two short sentences, plain and professional.

Worked examples for today = ${iso}:

"who is absent today"
{"intent":"roster","view":"absent","name":null,"email":null,"role":null,"date":"${iso}","endDate":null,"reply":"Checking today's absentees."}

"who is present today"
{"intent":"roster","view":"present","name":null,"email":null,"role":null,"date":"${iso}","endDate":null,"reply":"Checking who is in."}

"anyone on leave today?"
{"intent":"roster","view":"leave","name":null,"email":null,"role":null,"date":"${iso}","endDate":null,"reply":"Checking today's leave."}

"who was absent yesterday"
{"intent":"roster","view":"absent","name":null,"email":null,"role":null,"date":"${toIsoDate(addUtcDays(today, -1))}","endDate":null,"reply":"Checking yesterday."}

"show me the attendance for ${toIsoDate(addUtcDays(today, -4))}"
{"intent":"roster","view":"summary","name":null,"email":null,"role":null,"date":"${toIsoDate(addUtcDays(today, -4))}","endDate":null,"reply":"Pulling that day's attendance."}

"how many people are working today"
{"intent":"roster","view":"present","name":null,"email":null,"role":null,"date":"${iso}","endDate":null,"reply":"Counting who is in."}

"where is Sufyan"
{"intent":"person","view":"status","name":"Sufyan","email":null,"role":null,"date":"${iso}","endDate":null,"reply":"Looking that up."}

"is Ahmed Khan on leave"
{"intent":"person","view":"status","name":"Ahmed Khan","email":null,"role":null,"date":"${iso}","endDate":null,"reply":"Checking."}

"was Sufyan present yesterday"
{"intent":"person","view":"status","name":"Sufyan","email":null,"role":null,"date":"${toIsoDate(addUtcDays(today, -1))}","endDate":null,"reply":"Checking yesterday."}

"show me Sufyan's attendance for this week"
{"intent":"person","view":"history","name":"Sufyan","email":null,"role":null,"date":"${toIsoDate(startOfThisWeek(today))}","endDate":"${iso}","reply":"Pulling that up."}

"when was Sufyan last absent"
{"intent":"person","view":"history","name":"Sufyan","email":null,"role":null,"date":"${toIsoDate(addUtcDays(today, -21))}","endDate":"${iso}","reply":"Looking back through the record."}

"where is System Administrator" (an unfamiliar, title-like name is still a name)
{"intent":"person","view":"status","name":"System Administrator","email":null,"role":null,"date":"${iso}","endDate":null,"reply":"Looking that up."}

"when was System last absent"
{"intent":"person","view":"history","name":"System","email":null,"role":null,"date":"${toIsoDate(addUtcDays(today, -21))}","endDate":"${iso}","reply":"Looking back through the record."}

"add ayesha@example.com as an employee"
{"intent":"invite","view":null,"name":null,"email":"ayesha@example.com","role":"EMPLOYEE","date":null,"endDate":null,"reply":"Setting that up for you to approve."}

"invite bilal@example.com as an admin"
{"intent":"invite","view":null,"name":null,"email":"bilal@example.com","role":"ADMIN","date":null,"endDate":null,"reply":"Setting that up for you to approve."}

"I want to add a new staff member" (no address given — do not invent one)
{"intent":"invite","view":null,"name":null,"email":null,"role":"EMPLOYEE","date":null,"endDate":null,"reply":"I'll need their email address."}

"remove Sufyan from the system"
{"intent":"remove","view":null,"name":"Sufyan","email":null,"role":null,"date":null,"endDate":null,"reply":"Finding them so you can confirm."}

"delete the account for Ahmed Khan"
{"intent":"remove","view":null,"name":"Ahmed Khan","email":null,"role":null,"date":null,"endDate":null,"reply":"Finding them so you can confirm."}

"hello"
{"intent":"other","view":null,"name":null,"email":null,"role":null,"date":null,"endDate":null,"reply":"Hello. Ask me who is in, who is absent, or about one person's attendance."}

"what is the medical allowance"
{"intent":"other","view":null,"name":null,"email":null,"role":null,"date":null,"endDate":null,"reply":"I don't have that — I can answer on attendance and leave."}`;
}

/** The most recent Monday, today included. Used only to build a prompt example. */
function startOfThisWeek(today: Date): Date {
  const weekday = new Date(today).getUTCDay();
  return addUtcDays(today, -((weekday + 6) % 7));
}

/**
 * Pulls the first balanced JSON object out of a response, tolerating markdown
 * fences or stray prose that a model occasionally adds despite instructions.
 */
function extractJsonObject(raw: string): string | null {
  const withoutFences = raw.replace(/```(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < withoutFences.length; i += 1) {
    const char = withoutFences[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return withoutFences.slice(start, i + 1);
    }
  }

  return null;
}
