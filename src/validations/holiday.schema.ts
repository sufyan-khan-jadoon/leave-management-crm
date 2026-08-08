import { z } from "zod";

import { MAX_HOLIDAY_REASON_LENGTH } from "@/lib/constants";

/**
 * A calendar day, as the date input hands it over.
 *
 * Parsed to UTC midnight through the same convention the rest of the app uses
 * for calendar dates — `new Date("2026-08-17")` is already UTC midnight, but
 * only for this exact format, which is why the shape is pinned first.
 */
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "That is not a real date")
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const holidayReasonSchema = z
  .string()
  .trim()
  .min(2, "Say what the office is closed for")
  .max(MAX_HOLIDAY_REASON_LENGTH, `Keep the reason under ${MAX_HOLIDAY_REASON_LENGTH} characters`);

export const createHolidaySchema = z.object({
  date: calendarDateSchema,
  reason: holidayReasonSchema,
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;

/**
 * Both fields optional, but at least one required: a request that changes
 * nothing is a mistake worth reporting rather than a no-op worth accepting.
 */
export const updateHolidaySchema = z
  .object({ date: calendarDateSchema.optional(), reason: holidayReasonSchema.optional() })
  .refine(
    (value) => value.date !== undefined || value.reason !== undefined,
    "Change the date or the reason.",
  );

export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
