import { EmployeeStatus, Role } from "@prisma/client";
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

const nameSchema = z.string().trim().min(2, "Name must be at least 2 characters").max(80);
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

/**
 * Self-service edit.
 *
 * `email` is accepted here but **granted to the super admin alone**, settled in
 * `updateOwnProfile` against the role on the row rather than the one in the
 * session. The looser schema with the real check behind it is the same split the
 * invitation routes use: a shape that cannot express the request at all would
 * mean a second endpoint for one account, and two ways to write one field is how
 * the two come to disagree.
 */
export const profileUpdateSchema = profileSetupSchema.partial().extend({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * The profile form for an account that answers to nobody.
 *
 * Same required fields as setup, plus the name and address that are otherwise an
 * administrator's to change. Used by `ProfileForm` for the super admin only —
 * everyone else validates against `profileSetupSchema`, which has no field for
 * either, so the form cannot submit what the server would refuse.
 */
export const ownIdentityProfileSchema = profileSetupSchema.extend({
  name: nameSchema,
  email: emailSchema,
});

export type OwnIdentityProfileInput = z.infer<typeof ownIdentityProfileSchema>;

/** Admin-side edit — may additionally change identity and account status. */
export const adminEmployeeUpdateSchema = profileUpdateSchema.extend({
  email: emailSchema.optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
});

export type AdminEmployeeUpdateInput = z.infer<typeof adminEmployeeUpdateSchema>;

export const employeeQuerySchema = z.object({
  /**
   * Which population to list. Defaults to employees, so every existing caller
   * keeps its behaviour; asking for ADMIN is gated to the super admin in the
   * route handler. SUPER_ADMIN is not listable — there is nothing to manage.
   */
  role: z.enum([Role.EMPLOYEE, Role.ADMIN]).default(Role.EMPLOYEE),
  search: z.string().trim().max(120).optional(),
  department: z.string().trim().max(60).optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["name", "createdAt", "department"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;

/**
 * Which population the admin overview reports on. Defaults to employees and is
 * gated to the super admin for ADMIN in the route handler, exactly as the
 * roster is — the dashboard would otherwise be a way around that gate.
 */
export const adminStatsQuerySchema = z.object({
  population: z.enum([Role.EMPLOYEE, Role.ADMIN]).default(Role.EMPLOYEE),
});

export type AdminStatsQuery = z.infer<typeof adminStatsQuerySchema>;
