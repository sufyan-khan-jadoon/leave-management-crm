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
  intent: z.enum(["book", "balance", "history", "hours", "other"]),
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

type Attempt = { ok: true; value: LeaveChatIntent } | { ok: false; reason: string };

async function requestIntent(system: string, turns: ChatTurn[]): Promise<Attempt> {
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

  const result = chatIntentSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: result.error.issues.map((issue) => issue.message).join("; ") };
  }

  if (result.data.startDate && Number.isNaN(Date.parse(`${result.data.startDate}T00:00:00.000Z`))) {
    return { ok: false, reason: `Not a real calendar date: ${result.data.startDate}` };
  }

  return { ok: true, value: result.data };
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
  "intent": "book" | "balance" | "history" | "hours" | "other",
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
- "other" for anything else, including greetings.

NEVER state a fact about this company that you were not given above. You do not
know the office hours, the working days, the public holidays, the leave
allowance, or any policy. If you are asked one, classify it — "hours" for
timings and working days — and let the system answer. If it fits no intent, use
"other" and say plainly that you do not have that information and they should
ask their administrator. Inventing a plausible answer is the worst outcome
available to you: it is indistinguishable from a real one to the person reading
it, and they will act on it.

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

For "balance", "history" and "hours", "reply" is ignored — the system answers
from the company's own records — so a brief acknowledgement is enough. Do not
put times, dates or day names in it; nobody will read them.

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

"how much is the medical allowance"
{"intent":"other","startDate":null,"days":null,"reason":null,"reply":"I don't have that information — your administrator can tell you."}`;
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
