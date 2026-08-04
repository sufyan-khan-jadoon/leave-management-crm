import { z } from "zod";

import { AiServiceError } from "@/lib/errors";
import { serverEnv } from "@/lib/env";
import { addUtcDays, toIsoDate, toUtcDay, todayUtc, utcWeekday } from "@/lib/date";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 20_000;

/** Shape the model is instructed to return. */
const extractionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be an ISO calendar date"),
  reason: z.string().trim().min(3).max(280),
});

export type LeaveExtraction = z.infer<typeof extractionSchema>;

type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

/**
 * Turns a free-text leave request into a structured `{ date, reason }`.
 *
 * The model is put in JSON-object mode and validated against `extractionSchema`.
 * JSON mode guarantees syntax but not shape, so a reply that parses yet fails
 * validation is retried once with a corrective instruction; a second failure
 * raises AiServiceError rather than throwing an unhandled parse error.
 */
export async function extractLeaveDetails(message: string): Promise<LeaveExtraction> {
  const today = toIsoDate(todayUtc());
  const firstAttempt = await requestExtraction(buildPrompt(message, today));

  if (firstAttempt.ok) return firstAttempt.value;

  console.warn("[ai] First extraction attempt failed:", firstAttempt.reason);

  const retry = await requestExtraction(buildRetryPrompt(message, today, firstAttempt.reason));
  if (retry.ok) return retry.value;

  console.error("[ai] Extraction failed after retry:", retry.reason);
  throw new AiServiceError(
    "I couldn't understand that request. Try phrasing it like: \"I need leave on Friday because I have university exams.\"",
  );
}

type Attempt =
  | { ok: true; value: LeaveExtraction }
  | { ok: false; reason: string };

async function requestExtraction(prompt: string): Promise<Attempt> {
  let raw: string;

  try {
    raw = await callGroq(prompt);
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

  const result = extractionSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: result.error.issues.map((issue) => issue.message).join("; ") };
  }

  if (Number.isNaN(Date.parse(`${result.data.date}T00:00:00.000Z`))) {
    return { ok: false, reason: `Not a real calendar date: ${result.data.date}` };
  }

  return { ok: true, value: result.data };
}

async function callGroq(prompt: string): Promise<string> {
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
        max_tokens: 256,
        // Syntax-level JSON only. Groq enforces a schema just on the gpt-oss
        // models, so the shape is validated with Zod instead — that keeps any
        // model swappable through GROQ_MODEL without touching this call.
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
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
 * "next Monday" lands on a Saturday. The next two weeks are therefore spelled
 * out so resolving a weekday is a table lookup rather than a calculation.
 */
function buildCalendar(today: Date): string {
  return Array.from({ length: 15 }, (_, offset) => {
    const day = addUtcDays(today, offset);
    const marker = offset === 0 ? "  <- today" : offset === 1 ? "  <- tomorrow" : "";
    return `${toIsoDate(day)} = ${utcWeekday(day)}${marker}`;
  }).join("\n");
}

function buildPrompt(message: string, today: string): string {
  const calendar = buildCalendar(toUtcDay(today));

  return `You are a leave-request parser for an HR system. Today's date is ${today} (UTC).

Calendar reference — use these exact pairings, do not compute dates yourself:
${calendar}

Extract exactly two fields from the employee's message:
- "date": the single calendar date of the requested leave, in YYYY-MM-DD format.
- "reason": a concise reason (3-12 words), written in third person without pronouns like "I".

Rules for resolving the date:
- "today" resolves to ${today}; "tomorrow" resolves to the row marked tomorrow.
- A weekday name ("Friday", "next Friday") means the FIRST row above with that
  weekday name, excluding today's row. Copy that row's date exactly.
- If a date is given without a year, choose the interpretation on or after ${today}.
- If no date can be determined, use ${today}.
- If a range is mentioned, use the FIRST day of the range.

Respond with a single JSON object and nothing else. No markdown, no commentary.

Employee message:
"""
${message}
"""`;
}

function buildRetryPrompt(message: string, today: string, failureReason: string): string {
  return `${buildPrompt(message, today)}

Your previous answer was rejected because: ${failureReason}
Return ONLY a valid JSON object of the form {"date":"YYYY-MM-DD","reason":"short text"}.`;
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
