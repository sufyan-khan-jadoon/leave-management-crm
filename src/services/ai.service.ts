import { z } from "zod";

import { AiServiceError } from "@/lib/errors";
import { serverEnv } from "@/lib/env";
import { toIsoDate, todayUtc } from "@/lib/date";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 20_000;

/** Shape Gemini is instructed to return. */
const extractionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be an ISO calendar date"),
  reason: z.string().trim().min(3).max(280),
});

export type LeaveExtraction = z.infer<typeof extractionSchema>;

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

/**
 * Turns a free-text leave request into a structured `{ date, reason }`.
 *
 * Gemini is asked for JSON only and constrained with a response schema. If the
 * reply still fails validation the call is retried once with a corrective
 * instruction; a second failure raises AiServiceError rather than throwing an
 * unhandled parse error.
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
    raw = await callGemini(prompt);
  } catch (error) {
    // Transport/auth failures are terminal — surface immediately rather than
    // burning the retry on a request that cannot succeed.
    if (error instanceof AiServiceError) throw error;
    return { ok: false, reason: error instanceof Error ? error.message : "Unknown Gemini error" };
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

async function callGemini(prompt: string): Promise<string> {
  const env = serverEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}/${env.GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                date: { type: "STRING", description: "Leave date in YYYY-MM-DD format" },
                reason: { type: "STRING", description: "Short reason for the leave" },
              },
              required: ["date", "reason"],
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as GeminiResponse | null;
      const detail = body?.error?.message ?? `HTTP ${response.status}`;
      console.error("[ai] Gemini request rejected:", detail);

      throw new AiServiceError(
        response.status === 401 || response.status === 403
          ? "The AI service is not configured correctly. Please contact your administrator."
          : "The AI assistant is temporarily unavailable. Please try again in a moment.",
      );
    }

    const body = (await response.json()) as GeminiResponse;
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

    if (!text.trim()) throw new Error("Gemini returned an empty response");

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

function buildPrompt(message: string, today: string): string {
  return `You are a leave-request parser for an HR system. Today's date is ${today} (UTC).

Extract exactly two fields from the employee's message:
- "date": the single calendar date of the requested leave, in YYYY-MM-DD format.
- "reason": a concise reason (3-12 words), written in third person without pronouns like "I".

Rules for resolving the date:
- "today" resolves to ${today}.
- "tomorrow" resolves to the day after ${today}.
- A bare weekday name ("Friday") means the NEXT occurrence of that weekday strictly after ${today}.
- "next <weekday>" means the occurrence in the following calendar week.
- If a date is given without a year, choose the interpretation that is on or after ${today}.
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
