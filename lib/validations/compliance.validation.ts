/**
 * Compliance register contracts.
 *
 * Five registers make up the legal side of the platform:
 *   1. **Acts** — the legislation itself (Central, State or International);
 *   2. **Rules** — the obligations inside an act, with frequency, responsible
 *      role, penalty and the evidence an audit will ask for;
 *   3. **Regulations** — the instruments issued under an act or rule, with the
 *      reporting authority and periodicity they impose;
 *   4. **Notifications** — gazette notifications carrying a dated action;
 *   5. **Documents** — an employer's own licences, certificates, permits and
 *      returns, tracked against their expiry (this is the legal register the
 *      compliance-expiry reminder job reads).
 */
import { z } from 'zod';

const asTuple = <T extends string>(values: readonly T[]): [T, ...T[]] => [...values] as [T, ...T[]];

const optionalString = (max: number) =>
  z.string().trim().max(max).optional().nullable()
    .transform((value) => (value === '' ? null : value ?? null));

const optionalText = (max: number) =>
  z.union([z.string().max(max), z.literal('')]).optional().nullable()
    .transform((value) => (value === '' ? null : value ?? null));

const optionalDate = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const optionalId = z.coerce.number().int().positive().optional().nullable();

const booleanish = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 1 || value === '1' || value === 'true');

/* ────────────────────────────── catalogues ─────────────────────────────── */

export const JURISDICTIONS = ['Central', 'State', 'International'] as const;
export const ACT_STATUSES = ['active', 'repealed', 'amended', 'draft'] as const;
export const RULE_STATUSES = ['active', 'inactive'] as const;
export const INSTRUMENT_STATUSES = ['active', 'superseded', 'withdrawn'] as const;
export const COMPLIANCE_TYPES = ['Mandatory', 'Recommended', 'Best Practice'] as const;
export const COMPLIANCE_FREQUENCIES = [
  'One-time', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Annual', 'Bi-Annual', 'Event-based',
] as const;


/** Frequencies that fall due on a day of the month (and can therefore be reminded). */
export const PERIODIC_FREQUENCIES: readonly string[] = ['Monthly', 'Quarterly', 'Half-Yearly', 'Bi-Annual', 'Annual'];
export const DOCUMENT_TYPES = [
  'Licence', 'Certificate', 'Permit', 'Registration', 'Return', 'Approval', 'Agreement', 'Insurance', 'Other', 'Form',
] as const;
export const EXPIRY_STATUSES = ['Valid', 'Expiring Soon', 'Expired', 'Applied for Renewal', 'Not Applicable'] as const;

/** Days before expiry at which a document starts counting as "expiring soon". */
export const DEFAULT_REMIND_DAYS = 30;

/* ──────────────────────────────── acts ─────────────────────────────────── */

export const actSchema = z.object({
  act_name: z.string().trim().min(4, 'Give the act its full name').max(500),
  short_name: optionalString(100),
  act_number: optionalString(100),
  act_year: z.coerce.number().int().min(1800, 'A four-digit year').max(2100).optional().nullable(),
  jurisdiction: z.enum(asTuple(JURISDICTIONS)).default('Central'),
  state_name: optionalString(100),
  ministry: optionalString(255),
  department: optionalString(255),
  enactment_date: optionalDate,
  effective_date: optionalDate,
  last_amended_date: optionalDate,
  applicability_criteria: optionalText(4000),
  industry_applicability: optionalString(500),
  employee_threshold: optionalString(100),
  summary: optionalText(4000),
  full_text: optionalText(65000),
  official_source_url: optionalString(500),
  status: z.enum(asTuple(ACT_STATUSES)).default('active'),
});

/** A state act must name its state; a Central act must not claim one. */
export const actCreateSchema = actSchema.superRefine((act, ctx) => {
  if (act.jurisdiction === 'State' && !act.state_name) {
    ctx.addIssue({ code: 'custom', path: ['state_name'], message: 'Name the state this act belongs to' });
  }
  if (act.jurisdiction !== 'State' && act.state_name) {
    ctx.addIssue({ code: 'custom', path: ['state_name'], message: 'Only State legislation carries a state name' });
  }
});

export const actUpdateSchema = actCreateSchema;

/* ──────────────────────────────── rules ────────────────────────────────── */

export const ruleSchema = z.object({
  act_id: z.coerce.number().int().positive('Select the act this rule belongs to'),
  rule_number: optionalString(50),
  rule_title: z.string().trim().min(4, 'Describe the obligation').max(500),
  rule_text: optionalText(20000),
  compliance_type: z.enum(asTuple(COMPLIANCE_TYPES)).default('Mandatory'),
  frequency: z.enum(asTuple(COMPLIANCE_FREQUENCIES)).optional().nullable(),
  due_day_of_month: z.coerce.number().int().min(1, 'Day 1 to 31').max(31).optional().nullable(),
  responsible_role: optionalString(150),
  penalty_details: optionalText(2000),
  evidence_required: optionalText(2000),
  applicability: optionalText(2000),
  status: z.enum(asTuple(RULE_STATUSES)).default('active'),
});

export const ruleCreateSchema = ruleSchema.superRefine((rule, ctx) => {
  // `== null` deliberately covers both null and undefined: an omitted due day is
  // just as absent as an explicit null.
  if (PERIODIC_FREQUENCIES.includes(String(rule.frequency)) && rule.due_day_of_month == null) {
    // A recurring obligation without its day can never raise a reminder, so it
    // is refused rather than stored half-specified.
    ctx.addIssue({ code: 'custom', path: ['due_day_of_month'], message: 'A recurring obligation needs the day of the month it falls due' });
  }
  if (rule.due_day_of_month != null && String(rule.frequency) === 'One-time') {
    ctx.addIssue({ code: 'custom', path: ['due_day_of_month'], message: 'A one-time obligation has no monthly due day' });
  }
});

export const ruleUpdateSchema = ruleCreateSchema;

/* ───────────────────────────── regulations ─────────────────────────────── */

export const regulationSchema = z.object({
  act_id: optionalId,
  rule_id: optionalId,
  regulation_name: z.string().trim().min(4, 'Give the instrument its name').max(500),
  regulation_number: optionalString(100),
  issuing_authority: optionalString(255),
  issue_date: optionalDate,
  effective_date: optionalDate,
  scope: optionalText(4000),
  obligations: optionalText(20000),
  reporting_authority: optionalString(255),
  reporting_frequency: optionalString(100),
  penalty_provision: optionalText(2000),
  status: z.enum(asTuple(INSTRUMENT_STATUSES)).default('active'),
});

export const regulationCreateSchema = regulationSchema.superRefine((regulation, ctx) => {
  if (regulation.rule_id && !regulation.act_id) {
    ctx.addIssue({ code: 'custom', path: ['act_id'], message: 'Choose the act this rule belongs to' });
  }
});

export const regulationUpdateSchema = regulationCreateSchema;

/* ──────────────────────── gazette notifications ────────────────────────── */

export const notificationSchema = z.object({
  notification_number: z.string().trim().min(1, 'Enter the notification number').max(150),
  title: z.string().trim().min(4, 'Give the notification a title').max(500),
  notification_date: optionalDate,
  issuing_authority: optionalString(255),
  act_id: optionalId,
  gazette_reference: optionalString(255),
  subject: optionalText(4000),
  body: optionalText(20000),
  effective_date: optionalDate,
  applicability: optionalText(2000),
  action_required: optionalText(2000),
  status: z.enum(asTuple(INSTRUMENT_STATUSES)).default('active'),
});

export const notificationCreateSchema = notificationSchema;
export const notificationUpdateSchema = notificationSchema;

/* ───────────────────── employer compliance documents ───────────────────── */

export const documentSchema = z.object({
  document_name: z.string().trim().min(4, 'Name the document').max(500),
  document_type: z.enum(asTuple(DOCUMENT_TYPES)).default('Licence'),
  employer_id: z.coerce.number().int().positive('Select the employer'),
  unit_id: optionalId,
  act_id: optionalId,
  rule_id: optionalId,
  document_number: optionalString(150),
  issuing_authority: optionalString(255),
  issue_date: optionalDate,
  expiry_date: optionalDate,
  validity_period_days: z.coerce.number().int().min(1).max(36500).optional().nullable(),
  remind_days_before: z.coerce.number().int().min(1, 'At least one day').max(365).default(DEFAULT_REMIND_DAYS),
  renewal_responsibility: optionalString(200),
  fee_amount: z.coerce.number().min(0).max(999999999).optional().nullable(),
  notes: optionalText(4000),
  is_verified: booleanish.optional().default(false),
});

export const documentCreateSchema = documentSchema.superRefine((document, ctx) => {
  if (document.issue_date && document.expiry_date && document.expiry_date < document.issue_date) {
    ctx.addIssue({ code: 'custom', path: ['expiry_date'], message: 'The expiry date cannot fall before the issue date' });
  }
});

export const documentUpdateSchema = documentCreateSchema;

export const documentRenewSchema = z.object({
  issue_date: optionalDate,
  expiry_date: optionalDate,
  validity_period_days: z.coerce.number().int().min(1).max(36500).optional().nullable(),
  document_number: optionalString(150),
  fee_amount: z.coerce.number().min(0).max(999999999).optional().nullable(),
  notes: optionalText(4000),
  /** Refuse to renew without the new dates, and clear the "applied" flag. */
  status: z.enum(asTuple(EXPIRY_STATUSES)).optional().default('Valid'),
});

/* ──────────────────────────── list queries ─────────────────────────────── */

export const complianceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: optionalString(200),
  sortBy: optionalString(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export const actListQuerySchema = complianceListQuerySchema.extend({
  jurisdiction: optionalString(20),
  status: optionalString(20),
  state_name: optionalString(100),
});

export const ruleListQuerySchema = complianceListQuerySchema.extend({
  act_id: optionalId,
  compliance_type: optionalString(20),
  frequency: optionalString(20),
  status: optionalString(20),
});

export const regulationListQuerySchema = complianceListQuerySchema.extend({
  act_id: optionalId,
  status: optionalString(20),
});

export const notificationListQuerySchema = complianceListQuerySchema.extend({
  act_id: optionalId,
  status: optionalString(20),
  from_date: optionalString(10),
  to_date: optionalString(10),
});

export const documentListQuerySchema = complianceListQuerySchema.extend({
  employer_id: optionalId,
  unit_id: optionalId,
  document_type: optionalString(30),
  compliance_status: optionalString(30),
  act_id: optionalId,
  expiringWithin: z.coerce.number().int().min(1).max(3650).optional().nullable(),
  from_date: optionalString(10),
  to_date: optionalString(10),
});

export type ActInput = z.infer<typeof actCreateSchema>;
export type RuleInput = z.infer<typeof ruleCreateSchema>;
export type RegulationInput = z.infer<typeof regulationCreateSchema>;
export type NotificationInput = z.infer<typeof notificationCreateSchema>;
export type DocumentInput = z.infer<typeof documentCreateSchema>;
export type DocumentRenewInput = z.infer<typeof documentRenewSchema>;
