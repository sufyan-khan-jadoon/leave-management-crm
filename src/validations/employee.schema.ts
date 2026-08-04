import { EmployeeStatus } from "@prisma/client";
import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(20, "Phone number is too long")
  .regex(/^\+?[0-9\s\-()]{7,20}$/, "Enter a valid phone number");

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Enter a valid date");

/**
 * Profile photos are stored as data URLs to keep the stack dependency-free (no
 * object storage required for local development). The size cap keeps rows small.
 */
const profilePhotoSchema = z
  .string()
  .trim()
  .max(1_400_000, "Image is too large — please use one under 1 MB")
  .refine(
    (value) => value === "" || /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value),
    "Profile photo must be a PNG, JPEG, WebP or GIF image",
  )
  .optional();

export const profileSetupSchema = z.object({
  phone: phoneSchema,
  department: z.string().trim().min(2, "Department is required").max(60),
  position: z.string().trim().min(2, "Position is required").max(60),
  joiningDate: isoDateSchema,
  profilePhoto: profilePhotoSchema,
});

export type ProfileSetupInput = z.infer<typeof profileSetupSchema>;

export const profileUpdateSchema = profileSetupSchema.partial().extend({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80).optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** Admin-side edit — may additionally change identity and account status. */
export const adminEmployeeUpdateSchema = profileUpdateSchema.extend({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
});

export type AdminEmployeeUpdateInput = z.infer<typeof adminEmployeeUpdateSchema>;

export const employeeQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  department: z.string().trim().max(60).optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["name", "createdAt", "department"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;
