import { LeaveStatus } from "@prisma/client";
import { z } from "zod";

export const aiLeaveRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(10, "Describe your leave in a little more detail")
    .max(600, "Please keep your request under 600 characters"),
});

export type AiLeaveRequestInput = z.infer<typeof aiLeaveRequestSchema>;

export const leaveDecisionSchema = z.object({
  status: z.enum([LeaveStatus.APPROVED, LeaveStatus.REJECTED]),
});

export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>;

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
