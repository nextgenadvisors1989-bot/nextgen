import { z } from 'zod';

export const CAPAR_STATUSES = ['Draft', 'Submitted', 'Under Review', 'Returned', 'Approved'] as const;
export const FINDING_OUTCOMES = ['Violation', 'No Violation'] as const;
export const ACTION_STATUSES = ['Open', 'In Progress', 'Closed'] as const;
export const VERIFICATION_STATUSES = ['Pending', 'Eligible', 'Not Eligible'] as const;
export const ITEM_STATUSES = ['Incomplete', 'Not findings', 'Verified'] as const;
export const CAPAR_FILE_KINDS = ['Photo', 'Evidence'] as const;

/** Blank strings become null; a key that is absent stays undefined, so a partial update leaves it alone. */
const text = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value),
    z.string().max(max, `Keep this under ${max} characters`).nullable()
  ).optional();

const id = z
  .preprocess((value) => (value === '' || value === null ? null : value), z.coerce.number().int().positive().nullable())
  .optional();

const date = z
  .preprocess(
    (value) => (value === '' ? null : value),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker').nullable()
  )
  .optional();

export const caparCreateSchema = z.object({
  employer_id: z.coerce.number().int().positive('Select the employer'),
  unit_id: id,
  assignment_id: id,
  /** Only an administrator may write a report on behalf of another auditor. */
  auditor_id: id,
  verifier_id: id,
  title: text(255),
  facility_name: text(255),
  facility_address: text(2000),
  representative_name: text(200),
  representative_title: text(150),
  audit_date: date,
  audit_firm: text(255),
  auditor_print_name: text(200),
  standard_reference: text(255),
});

export const caparUpdateSchema = z.object({
  verifier_id: id,
  title: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(3, 'Give the report a title').max(255)).optional(),
  facility_name: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(2, 'Enter the facility name').max(255)).optional(),
  facility_address: text(2000),
  representative_name: text(200),
  representative_title: text(150),
  audit_date: date,
  audit_firm: text(255),
  auditor_print_name: text(200),
  standard_reference: text(255),
  summary_notes: text(6000),
  closing_meeting_date: date,
  closing_statement: text(2000),
  facility_signatory: text(200),
  facility_signed_date: date,
});

export const findingSchema = z.object({
  category_id: id,
  outcome: z.enum(FINDING_OUTCOMES).optional(),
  item_status: z.enum(ITEM_STATUSES).optional(),
  act_rule: text(500),
  act_id: id,
  provision_id: id,
  compliance_note: text(4000),
  recommendation: text(4000),
  assessment: text(4000),
  resource_id: id,
  minimum_requirement: text(4000),
  local_law: text(6000),
  finding: text(6000),
  root_cause: text(4000),
  action_plan: text(4000),
  timeline_date: date,
  timeline_note: text(255),
  action_status: z.enum(ACTION_STATUSES).optional(),
  closed_on: date,
});

export const verifyFindingSchema = z.object({
  verification_status: z.enum(VERIFICATION_STATUSES),
  verification_remark: text(2000),
});

export const decisionSchema = z.object({
  decision: z.enum(['approve', 'return']),
  comments: text(3000),
});

export const categorySchema = z.object({
  name: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(2, 'Enter a category name').max(150)),
  description: text(500),
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const categoryUpdateSchema = categorySchema.partial();

export type CaparCreateInput = z.infer<typeof caparCreateSchema>;
export type CaparUpdateInput = z.infer<typeof caparUpdateSchema>;
export type FindingInput = z.infer<typeof findingSchema>;
