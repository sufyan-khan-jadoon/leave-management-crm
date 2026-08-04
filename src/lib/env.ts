import { z } from "zod";

/**
 * Server-side environment contract.
 *
 * Validation is lazy so that `next build` can prerender pages without a full
 * runtime secret set; any code path that actually needs a variable calls
 * `serverEnv()` and fails loudly with an actionable message instead of
 * surfacing a vague `undefined` deep inside a service.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),

  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
  GROQ_MODEL: z.string().default("llama-3.1-8b-instant"),

  EMAIL_HOST: z.string().min(1),
  EMAIL_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_USER: z.string().min(1),
  EMAIL_PASSWORD: z.string().min(1),
  EMAIL_FROM: z.string().default("Leave CRM <no-reply@leavecrm.local>"),
  EMAIL_SECURE: z
    .string()
    .optional()
    .transform((value) => value === "true"),

  HR_CONTACT_PHONE: z.string().default("+923145868205"),
  HR_CONTACT_NAME: z.string().default("Sufyan Khan"),
  APP_NAME: z.string().default("Leave CRM"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCheck your .env file against .env.example.`);
  }

  cached = parsed.data;
  return cached;
}

/** Narrow accessor for the subset of config that is safe to read during build. */
export const appConfig = {
  name: process.env.APP_NAME ?? "Leave CRM",
  url: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  hrPhone: process.env.HR_CONTACT_PHONE ?? "+923145868205",
  hrName: process.env.HR_CONTACT_NAME ?? "Sufyan Khan",
} as const;
