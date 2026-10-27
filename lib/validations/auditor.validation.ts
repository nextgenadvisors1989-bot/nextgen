import { z } from 'zod';
import { AUDITOR_SPECIALIZATIONS } from '@/types/auditor';
import { INDIAN_STATES } from '@/types/employer';

const optionalString = (max: number, message?: string) =>
  z.string().trim().max(max, message).optional().nullable()
    .transform((value) => (value === '' ? null : value ?? null));

const optionalEmail = z
  .union([z.string().trim().email('Enter a valid email address'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const optionalPhone = z
  .union([z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/, 'Enter a valid phone number'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const aadhaarRegex = /^[2-9][0-9]{11}$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const optionalPan = z
  .union([z.string().trim().toUpperCase().regex(panRegex, 'PAN format looks invalid (e.g. AABCC1234D)'), z.literal('')])
  .optional().nullable().transform((value) => (value === '' ? null : value ?? null));

const optionalAadhaar = z
  .union([z.string().trim().regex(aadhaarRegex, 'Aadhaar must be 12 digits and cannot start with 0 or 1'), z.literal('')])
  .optional().nullable().transform((value) => (value === '' ? null : value ?? null));

const optionalIfsc = z
  .union([z.string().trim().toUpperCase().regex(ifscRegex, 'IFSC format looks invalid (e.g. IDIB000C123)'), z.literal('')])
  .optional().nullable().transform((value) => (value === '' ? null : value ?? null));

/** Core auditor record — shared by create and update. */
export const auditorCreateSchema = z.object({
  name: z.string().trim().min(3, 'Auditor name is required').max(200),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255),
  mobile: optionalPhone,
  alternate_mobile: optionalPhone,

  auditor_type_id: z.coerce.number().int().positive('Select the auditor type').optional().nullable(),
  role_title: optionalString(150),
  specialization: z
    .union([z.enum(AUDITOR_SPECIALIZATIONS), z.literal('')])
    .optional().nullable().transform((value) => (value === '' ? null : value ?? null)),
  qualification: optionalString(255),
  experience_years: z.coerce.number().min(0, 'Experience cannot be negative').max(70, 'Experience looks too high')
    .optional().nullable(),

  address: optionalString(2000),
  city: optionalString(100),
  state: z
    .union([z.enum(INDIAN_STATES), z.literal('')])
    .optional().nullable().transform((value) => (value === '' ? null : value ?? null)),
  pincode: z
    .union([z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Pincode must be 6 digits'), z.literal('')])
    .optional().nullable().transform((value) => (value === '' ? null : value ?? null)),

  pan_number: optionalPan,
  aadhaar_number: optionalAadhaar,
  bank_name: optionalString(200),
  bank_account_number: optionalString(50),
  ifsc_code: optionalIfsc,

  date_of_joining: z.string().trim().optional().nullable()
    .transform((value) => (value === '' ? null : value ?? null)),
  assigned_employer_id: z.coerce.number().int().positive().optional().nullable(),
  max_concurrent_audits: z.coerce.number().int().min(1, 'At least 1 concurrent audit').max(50)
    .optional().default(5),
  status: z.enum(['active', 'inactive']).optional().default('active'),

  // Stored as a data URL from the profile photo uploader (varchar(500) holds small images).
  photo: optionalString(500),

  // Optional auditor-portal login, provisioned with the record.
  create_portal_user: z.coerce.boolean().optional().default(false),
  portal_user_email: optionalEmail,
  portal_user_name: optionalString(200),
  portal_user_mobile: optionalPhone,
});

export const auditorUpdateSchema = auditorCreateSchema.partial().extend({
  name: z.string().trim().min(3).max(200).optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255).optional(),
});

export const auditorTypeSchema = z.object({
  name: z.string().trim().min(3, 'Type name is required').max(150),
  code: z
    .string()
    .trim()
    .min(2, 'Code is required')
    .max(50)
    .regex(/^[A-Za-z0-9\-_]+$/, 'Use letters, numbers, hyphen or underscore only')
    .transform((value) => value.toUpperCase()),
  description: optionalString(2000),
  specialization: optionalString(200),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const auditorListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  auditorTypeId: z.coerce.number().int().positive().optional(),
  specialization: z.string().trim().optional(),
  state: z.string().trim().optional(),
  employerId: z.coerce.number().int().positive().optional(),
  availability: z.enum(['all', 'available']).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: z
    .enum(['name', 'auditor_code', 'created_at', 'status', 'experience_years', 'rating', 'date_of_joining'])
    .optional()
    .default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type AuditorCreateInput = z.infer<typeof auditorCreateSchema>;
export type AuditorTypeInput = z.infer<typeof auditorTypeSchema>;
