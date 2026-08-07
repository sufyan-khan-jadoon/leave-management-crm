import { LeaveStatus } from "@prisma/client";
import { z } from "zod";

const chatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(600),
});

/**
 * The conversation is replayed by the client on every turn. Nothing about it is
 * stored: the raw wording never reaches the database, only the extracted dates
 * and reason do.
 */
export const leaveChatSchema = z.object({
  messages: z.array(chatTurnSchema).min(1, "Say something first").max(24, "This conversation is too long"),
});

export type LeaveChatInput = z.infer<typeof leaveChatSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Enter a valid date");

/** Echoed back on confirmation; re-validated server-side before anything is booked. */
export const leaveConfirmSchema = z.object({
  startDate: isoDate,
  days: z.coerce.number().int().min(1).max(366),
  reason: z.string().trim().min(3).max(280),
});

export type LeaveConfirmInput = z.infer<typeof leaveConfirmSchema>;

export const leaveQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.nativeEnum(LeaveStatus).optional(),
  department: z.string().trim().max(60).optional(),
  employeeId: z.string().trim().max(40).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["leaveDate", "createdAt", "status"]).default("leaveDate"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type LeaveQuery = z.infer<typeof leaveQuerySchema>;

export const globalSearchSchema = z.object({
  q: z.string().trim().min(2, "Enter at least 2 characters").max(120),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchSchema>;
