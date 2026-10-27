import { z } from 'zod';
import { EMPLOYER_INDUSTRIES, COMPANY_TYPES, INDIAN_STATES } from '@/types/employer';

const optionalString = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((value) => (value === '' ? null : value ?? null));

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

const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const cinRegex = /^[LU]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

export const employerCreateSchema = z.object({
  company_name: z.string().trim().min(2, 'Company name is required').max(255),
  employer_code: z
    .string()
    .trim()
    .min(2, 'Employer code is required')
    .max(50)
    .regex(/^[A-Za-z0-9\-_/]+$/, 'Use letters, numbers, hyphen, underscore or slash only')
    .transform((value) => value.toUpperCase()),
  gst_number: z
    .union([z.string().trim().toUpperCase().regex(gstRegex, 'GST number format looks invalid (e.g. 33AABCC1234D1Z5)'), z.literal('')])
    .optional()
    .nullable()
    .transform((value) => (value === '' ? null : value ?? null)),
  pan_number: z
    .union([z.string().trim().toUpperCase().regex(panRegex, 'PAN format looks invalid (e.g. AABCC1234D)'), z.literal('')])
    .optional()
    .nullable()
    .transform((value) => (value === '' ? null : value ?? null)),
  cin_number: z
    .union([z.string().trim().toUpperCase().regex(cinRegex, 'CIN format looks invalid'), z.literal('')])
    .optional()
    .nullable()
    .transform((value) => (value === '' ? null : value ?? null)),

  industry_type: z.enum(EMPLOYER_INDUSTRIES).optional().nullable(),
  company_type: z.enum(COMPANY_TYPES).optional().nullable(),
  year_of_establishment: z.coerce
    .number()
    .int()
    .min(1800, 'Year looks too old')
    .max(new Date().getFullYear(), 'Year cannot be in the future')
    .optional()
    .nullable(),
  website_url: z.union([z.string().trim().url('Enter a valid URL (https://…)'), z.literal('')]).optional().nullable()
    .transform((value) => (value === '' ? null : value ?? null)),

  email: optionalEmail,
  phone: optionalPhone,
  mobile: optionalPhone,
  fax: optionalPhone,

  address_line_1: optionalString(255),
  address_line_2: optionalString(255),
  city: optionalString(100),
  state: z.union([z.enum(INDIAN_STATES), z.literal('')]).optional().nullable().transform((value) => (value === '' ? null : value ?? null)),
  pincode: z
    .union([z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Pincode must be 6 digits'), z.literal('')])
    .optional()
    .nullable()
    .transform((value) => (value === '' ? null : value ?? null)),
  country: z.string().trim().max(100).optional().default('India'),

  contact_person_name: optionalString(200),
  contact_person_designation: optionalString(100),
  contact_person_email: optionalEmail,
  contact_person_mobile: optionalPhone,
  contact_person_alternate_mobile: optionalPhone,

  number_of_units: z.coerce.number().int().min(1).max(9999).optional().default(1),
  approximate_employee_count: z.coerce.number().int().min(0).max(10000000).optional().nullable(),

  compliance_contact_person: optionalString(200),
  compliance_contact_email: optionalEmail,
  compliance_contact_phone: optionalPhone,
  payroll_contact_person: optionalString(200),
  payroll_contact_email: optionalEmail,
  payroll_contact_phone: optionalPhone,

  notes: optionalString(5000),
  status: z.enum(['active', 'inactive']).optional().default('active'),

  // Optional employer-portal login created alongside the company record.
  create_portal_user: z.coerce.boolean().optional().default(false),
  portal_user_name: optionalString(200),
  portal_user_email: optionalEmail,
  portal_user_mobile: optionalPhone,
});

export const employerUpdateSchema = employerCreateSchema.partial().extend({
  company_name: z.string().trim().min(2).max(255).optional(),
  employer_code: employerCreateSchema.shape.employer_code.optional(),
});

export const companyUnitSchema = z.object({
  unit_name: z.string().trim().min(2, 'Unit name is required').max(255),
  unit_code: optionalString(50),
  location: optionalString(255),
  address: optionalString(2000),
  contact_person_name: optionalString(200),
  contact_person_email: optionalEmail,
  contact_person_phone: optionalPhone,
  employee_count: z.coerce.number().int().min(0).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const departmentSchema = z.object({
  unit_id: z.coerce.number().int().positive().optional().nullable(),
  department_name: z.string().trim().min(2, 'Department name is required').max(255),
  department_code: optionalString(50),
  head_of_department: optionalString(200),
  contact_email: optionalEmail,
  contact_phone: optionalPhone,
  employee_count: z.coerce.number().int().min(0).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const employerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  industry: z.string().trim().optional(),
  state: z.string().trim().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: z.enum(['company_name', 'employer_code', 'created_at', 'status', 'city']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type EmployerCreateInput = z.infer<typeof employerCreateSchema>;
export type CompanyUnitInput = z.infer<typeof companyUnitSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
