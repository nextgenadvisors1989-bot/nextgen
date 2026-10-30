import { z } from 'zod';
import { INDIAN_STATES } from '@/types/employer';
import {
  BLOOD_GROUPS, MARITAL_STATUSES, GENDERS, EMPLOYEE_CATEGORIES,
  STAYING_OPTIONS, WAGE_TYPES, WEEKLY_OFFS,
} from '@/lib/utils/constants';
import { DOCUMENT_TYPES } from '@/types/employee';

/** Zod needs a non-empty tuple; the shared constants are typed as string[]. */
const enumOf = (values: readonly string[]) => z.enum(values as [string, ...string[]]);

/** Empty strings from HTML forms become NULL so the database stays clean. */
const nullableString = (max = 255, message?: string) =>
  z.string().trim().max(max, message).optional().nullable()
    .transform((value) => (value === '' ? null : value ?? null));

const nullableEmail = z
  .union([z.string().trim().email('Enter a valid email address'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const nullableMobile = z
  .union([z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/, 'Enter a valid mobile number'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const nullableDate = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker (YYYY-MM-DD)'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const nullableMoney = z
  .union([z.coerce.number().min(0, 'Amount cannot be negative').max(100000000), z.literal(''), z.null()])
  .optional()
  .nullable()
  .transform((value) => (value === '' || value === undefined ? null : value));

const nullableInt = (min = 0, max = 100000) =>
  z.union([z.coerce.number().int().min(min).max(max), z.literal(''), z.null()]).optional().nullable()
    .transform((value) => (value === '' || value === undefined ? null : value));

const aadhaar = z
  .union([z.string().trim().regex(/^[2-9][0-9]{11}$/, 'Aadhaar must be 12 digits and cannot start with 0 or 1'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const pan = z
  .union([z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN format looks invalid (e.g. ABCDE1234F)'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const ifsc = z
  .union([z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC format looks invalid (e.g. HDFC0001234)'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

// ── Wizard step 7: EPF Form 2 / Gratuity Form F nominees ─────────────────
export const nomineeSchema = z.object({
  form_type: z.enum(['EPF_FORM_2', 'GRATUITY_FORM_F']).default('EPF_FORM_2'),
  nominee_name: z.string().trim().min(2, 'Nominee name is required').max(200),
  relationship: z.string().trim().max(100).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  date_of_birth: nullableDate,
  address: nullableString(1000),
  share_percentage: z.coerce.number().min(0).max(100).optional().default(100),
  is_minor: z.coerce.boolean().optional().default(false),
  guardian_name: nullableString(200),
});

// ── Wizard step 8: qualifications ────────────────────────────────────────
export const qualificationSchema = z.object({
  qualification: z.string().trim().min(2, 'Qualification is required').max(200),
  specialization: nullableString(200),
  institution: nullableString(255),
  board_university: nullableString(200),
  year_of_passing: nullableInt(1950, new Date().getFullYear() + 1),
  percentage: z.union([z.coerce.number().min(0).max(100), z.literal(''), z.null()]).optional().nullable()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  grade: nullableString(20, 'Grade cannot exceed 20 characters'),
  remarks: nullableString(500),
});

// ── Wizard step 9: previous experience ───────────────────────────────────
export const experienceSchema = z.object({
  company_name: z.string().trim().min(2, 'Company name is required').max(255),
  designation: nullableString(200),
  department: nullableString(200),
  date_from: nullableDate,
  date_to: nullableDate,
  total_period: nullableString(100),
  last_salary: nullableMoney,
  reason_for_leaving: nullableString(500),
}).refine(
  (value) => !value.date_from || !value.date_to || value.date_from <= value.date_to,
  { message: 'The end date cannot be before the start date', path: ['date_to'] }
);

// ── Wizard step 10: dependents ───────────────────────────────────────────
export const dependentSchema = z.object({
  dependent_name: z.string().trim().min(2, 'Name is required').max(200),
  relationship: nullableString(100),
  date_of_birth: nullableDate,
  age: nullableInt(0, 120),
  sex: z.union([enumOf(GENDERS), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  occupation: nullableString(200),
  aadhaar_number: aadhaar,
  is_nominee: z.coerce.boolean().optional().default(false),
});

// ── Wizard step 11: references ───────────────────────────────────────────
export const referenceSchema = z.object({
  reference_name: z.string().trim().min(2, 'Name is required').max(200),
  designation: nullableString(200),
  organization: nullableString(255),
  address: nullableString(1000),
  mobile: nullableMobile,
  email: nullableEmail,
  relationship: nullableString(100),
});

// ── Wizard step 12: interview assessment ─────────────────────────────────
const rating = z.union([z.coerce.number().int().min(1, 'Rate 1–5').max(5, 'Rate 1–5'), z.literal(''), z.null()])
  .optional().nullable().transform((v) => (v === '' || v === undefined ? null : v));

export const interviewSchema = z.object({
  interview_date: nullableDate,
  interviewer_name: nullableString(200),
  position_applied: nullableString(200),
  qualification_rating: rating,
  experience_rating: rating,
  communication_rating: rating,
  technical_rating: rating,
  attitude_rating: rating,
  overall_rating: rating,
  recommendation: z.enum(['Recommended', 'On Hold', 'Not Recommended']).optional().nullable()
    .transform((v) => v ?? null),
  remarks: nullableString(2000),
});

// ── Wizard step 13: personal file checklist ──────────────────────────────
export const checklistEntrySchema = z.object({
  item_id: z.coerce.number().int().positive(),
  is_checked: z.coerce.boolean().optional().default(false),
  remarks: nullableString(500),
});

// ── Wizard step 6: passport + bank ───────────────────────────────────────
export const bankSchema = z.object({
  bank_name: nullableString(200),
  bank_account_number: nullableString(50),
  ifsc_code: ifsc,
  passport_number: nullableString(30),
  passport_validity: nullableDate,
});

/**
 * The full create payload. Field names mirror the `employees` columns exactly,
 * grouped by the wizard step that collects them so the form and the API can
 * never drift apart.
 */
export const employeeCreateSchema = z.object({
  // Step 1 — personal
  name: z.string().trim().min(2, 'Employee name is required').max(200),
  father_name: nullableString(200),
  mother_name: nullableString(200),
  spouse_name: nullableString(200),
  sex: z.union([enumOf(GENDERS), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  marital_status: z.union([enumOf(MARITAL_STATUSES), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  religion: nullableString(100),
  mother_tongue: nullableString(100),
  blood_group: z.union([enumOf(BLOOD_GROUPS), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  date_of_birth: nullableDate,
  languages_known: nullableString(255),
  photo: nullableString(1000),
  signature: nullableString(1000),
  aadhaar_number: aadhaar,
  pan_number: pan,

  // Step 2 — contact & address
  present_address: nullableString(2000),
  permanent_address: nullableString(2000),
  is_permanent_same_as_present: z.coerce.boolean().optional().default(false),
  state: z.union([enumOf(INDIAN_STATES), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  pincode: z.union([z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Pincode must be 6 digits'), z.literal('')]).optional().nullable()
    .transform((v) => (v === '' ? null : v ?? null)),
  telephone: nullableString(30),
  mobile: nullableMobile,
  email: nullableEmail,
  native_place: nullableString(200),
  staying_in: z.union([enumOf(STAYING_OPTIONS), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  family_income_per_annum: nullableMoney,

  // Step 3 — employment
  employer_id: z.coerce.number().int().positive('Select the employer'),
  unit_id: nullableInt(1),
  department_id: nullableInt(1),
  employee_number: nullableString(50),
  date_of_joining: nullableDate,
  date_of_confirmation: nullableDate,
  post_applied_for: nullableString(200),
  department: nullableString(200),
  designation: nullableString(200),
  designation_id: nullableInt(1),
  nature_of_work: nullableString(255),
  category: z.union([enumOf(EMPLOYEE_CATEGORIES), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  workforce_origin: z.union([z.enum(['State local', 'Migrant']), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  employment_type: z.union([z.enum(['Permanent', 'Temporary', 'Contract']), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  grade: nullableString(50),
  skill_grade: nullableString(50),
  place_of_work: nullableString(255),
  shift_relay: nullableString(100),
  working_hours_from: nullableString(20),
  working_hours_to: nullableString(20),
  interval_lunch_time: nullableString(50),
  tea_break: nullableString(50),
  weekly_off: z.union([enumOf(WEEKLY_OFFS), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  probation_months: nullableInt(0, 36),
  status: z.enum(['active', 'inactive', 'resigned', 'terminated', 'retired', 'absconding']).optional().default('active'),

  // Step 4 — wage structure
  basic_salary: nullableMoney,
  da: nullableMoney,
  hra: nullableMoney,
  ta: nullableMoney,
  pa: nullableMoney,
  ea: nullableMoney,
  npba: nullableMoney,
  other_allowances: nullableMoney,
  wage_type: z.union([enumOf(WAGE_TYPES), z.literal('')]).optional().nullable().transform((v) => (v === '' ? null : v ?? null)),
  expected_salary: nullableMoney,

  // Step 5 — statutory
  pf_number: nullableString(50),
  pf_effective_date: nullableDate,
  uan: nullableString(50),
  esi_number: nullableString(50),
  esi_dispensary: nullableString(200),
  mediclaim_number: nullableString(50),
  previous_pf_account_number: nullableString(50),
  previous_employer_exit_date: nullableDate,
  scheme_certificate_number: nullableString(50),
  pension_payment_order_number: nullableString(50),
  is_international_worker: z.coerce.boolean().optional().default(false),
  country: nullableString(100),

  // Step 6 — bank & passport (flat, same columns)
  bank_name: nullableString(200),
  bank_account_number: nullableString(50),
  ifsc_code: ifsc,
  passport_number: nullableString(30),
  passport_validity: nullableDate,

  // Steps 7–13 — child tables
  nominees: z.array(nomineeSchema).optional().default([]),
  qualifications: z.array(qualificationSchema).optional().default([]),
  experience: z.array(experienceSchema).optional().default([]),
  dependents: z.array(dependentSchema).optional().default([]),
  references: z.array(referenceSchema).optional().default([]),
  interview: interviewSchema.optional().nullable(),
  checklist: z.array(checklistEntrySchema).optional().default([]),

  // Step 14 — portal login
  create_login: z.coerce.boolean().optional().default(false),
  login_username: nullableString(60),
  login_email: nullableEmail,
  login_mobile: nullableMobile,

  // Document vault uploads captured during the wizard (file ids already stored).
  document_file_ids: z.array(z.coerce.number().int().positive()).optional().default([]),
});

export const employeeUpdateSchema = employeeCreateSchema.partial().extend({
  name: z.string().trim().min(2).max(200).optional(),
  employer_id: z.coerce.number().int().positive().optional(),
  // Portal credentials are never edited from the employee form.
  create_login: z.coerce.boolean().optional(),
});

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: z.string().trim().optional(),
  employerId: z.coerce.number().int().positive().optional(),
  unitId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive', 'resigned', 'terminated', 'retired', 'absconding']).optional(),
  category: enumOf(EMPLOYEE_CATEGORIES).optional(),
  designation: z.string().trim().optional(),
  state: z.string().trim().optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: z.enum(['name', 'employee_number', 'date_of_joining', 'created_at', 'gross_salary', 'status']).optional().default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

/** Sub-resource management from the employee detail page. */
export const employeeDocumentSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES),
  document_name: z.string().trim().min(2, 'Document name is required').max(255),
  document_number: nullableString(100),
  issue_date: nullableDate,
  expiry_date: nullableDate,
  file_id: nullableInt(1),
  file_path: nullableString(1000),
  remarks: nullableString(1000),
});

export const serviceRecordSchema = z.object({
  employer_id: z.coerce.number().int().positive().nullable().optional(),
  employer_name: z.string().trim().min(2, 'Employer name is required').max(255),
  designation: nullableString(200),
  department: nullableString(200),
  date_from: nullableDate,
  date_to: nullableDate,
  total_period: nullableString(100),
  last_drawn_salary: nullableMoney,
  reason_for_leaving: nullableString(500),
  remarks: nullableString(1000),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type NomineeInput = z.infer<typeof nomineeSchema>;
export type QualificationInput = z.infer<typeof qualificationSchema>;
export type ExperienceInput = z.infer<typeof experienceSchema>;
export type DependentInput = z.infer<typeof dependentSchema>;
export type ReferenceInput = z.infer<typeof referenceSchema>;
export type InterviewInput = z.infer<typeof interviewSchema>;
