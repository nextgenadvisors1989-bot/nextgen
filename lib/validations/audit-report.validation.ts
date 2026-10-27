/**
 * Audit report contracts.
 *
 * A report is stored in two layers: the headline scalars live in `audit_reports`
 * (status, score, finding counts, approval stamps) so registers and dashboards
 * stay fast, while the document body — findings, scorecard, observations,
 * executive summary and verifier remarks — lives in the `snapshot_json` of the
 * matching `audit_report_versions` row. Every revision therefore reproduces
 * exactly what was submitted, approved or rejected at that point in time.
 */
import { z } from 'zod';
import { AUDIT_STATUSES } from '@/types/audit';

/** Zod enums need a non-empty tuple. */
const asTuple = <T extends string>(values: readonly T[]): [T, ...T[]] => [...values] as [T, ...T[]];

const optionalString = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((value) => (value === '' ? null : value ?? null));

const optionalDate = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker'), z.literal('')])
  .optional().nullable().transform((value) => (value === '' ? null : value ?? null));

const money = z.coerce.number().min(0, 'Cannot be negative').max(999999999).optional().nullable();

export const REPORT_STATUSES = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Changes Requested', 'Archived'] as const;
export const REPORT_TYPES = ['AUDIT', 'ASSESSMENT', 'RISK', 'STUDY', 'WORK_PERMIT', 'INSPECTION'] as const;
export const FINDING_SEVERITIES = ['Critical', 'Major', 'Minor', 'Observation'] as const;
export const FINDING_STATUSES = ['Open', 'In Progress', 'Closed'] as const;
export const VERIFIER_ACTIONS = ['approve', 'reject', 'return'] as const;

/** Severity → the counter column on `audit_reports` it feeds. */
export const SEVERITY_COUNT_FIELD: Record<(typeof FINDING_SEVERITIES)[number], 'critical_findings' | 'major_findings' | 'minor_findings' | 'observations'> = {
  Critical: 'critical_findings',
  Major: 'major_findings',
  Minor: 'minor_findings',
  Observation: 'observations',
};

export const findingSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  reference: optionalString(40),
  severity: z.enum(asTuple(FINDING_SEVERITIES)).default('Minor'),
  clause: optionalString(255),          // statute / rule / clause the finding breaches
  description: z.string().trim().min(10, 'Describe the finding in at least 10 characters').max(4000),
  evidence: optionalString(2000),       // record inspected, photograph, register page
  recommendation: optionalString(2000),
  employer_response: optionalString(2000),
  status: z.enum(asTuple(FINDING_STATUSES)).default('Open'),
  due_date: optionalDate,
});

export const scorecardRowSchema = z.object({
  section: z.string().trim().min(2, 'Name the section being scored').max(255),
  max_score: z.coerce.number().min(0).max(10000),
  obtained_score: z.coerce.number().min(0).max(10000),
  remarks: optionalString(1000),
});

/** The document body stored in `snapshot_json`. */
export const reportBodySchema = z.object({
  executive_summary: optionalString(8000),
  methodology: optionalString(8000),
  findings: z.array(findingSchema).max(300).optional().default([]),
  scorecard: z.array(scorecardRowSchema).max(60).optional().default([]),
  observations: z.array(z.string().trim().min(2).max(1000)).max(200).optional().default([]),
  regulatory_references: z.array(z.string().trim().min(2).max(255)).max(100).optional().default([]),
  recommendations: z.array(z.string().trim().min(2).max(1000)).max(100).optional().default([]),
});

/**
 * Working copy of the body saved between visits.
 *
 * Stricter than nothing, looser than a submission: a finding that is still being
 * written may have a short description, and a scorecard row may only have its
 * section named. The submission schema (`reportBodySchema`) is what enforces the
 * real quality bar, so an unfinished draft can always be saved and resumed.
 */
export const reportDraftBodySchema = z.object({
  executive_summary: optionalString(8000),
  methodology: optionalString(8000),
  findings: z.array(z.object({
    id: z.union([z.string(), z.number()]).optional(),
    reference: optionalString(40),
    severity: z.enum(asTuple(FINDING_SEVERITIES)).default('Minor'),
    clause: optionalString(255),
    description: z.string().trim().max(4000).optional().nullable().transform((value) => value ?? ''),
    evidence: optionalString(2000),
    recommendation: optionalString(2000),
    employer_response: optionalString(2000),
    status: z.enum(asTuple(FINDING_STATUSES)).default('Open'),
    due_date: optionalDate,
  })).max(300).optional().default([]),
  scorecard: z.array(z.object({
    section: z.string().trim().max(255).optional().nullable().transform((value) => value ?? ''),
    max_score: z.coerce.number().min(0).max(10000).default(0),
    obtained_score: z.coerce.number().min(0).max(10000).default(0),
    remarks: optionalString(1000),
  })).max(60).optional().default([]),
  observations: z.array(z.string().trim().max(1000)).max(200).optional().default([]),
  regulatory_references: z.array(z.string().trim().max(255)).max(100).optional().default([]),
  recommendations: z.array(z.string().trim().max(1000)).max(100).optional().default([]),
});

export const reportDraftSchema = z.object({
  body: reportDraftBodySchema,
  /** The auditor may settle the period and audit date while working. */
  audit_period_from: optionalDate,
  audit_period_to: optionalDate,
  audit_date: optionalDate,
  change_summary: optionalString(500),
});

export const reportCreateSchema = z.object({
  assignment_id: z.coerce.number().int().positive().optional().nullable(),
  submission_id: z.coerce.number().int().positive().optional().nullable(),
  module_id: z.coerce.number().int().positive().optional().nullable(),
  form_id: z.coerce.number().int().positive().optional().nullable(),
  employer_id: z.coerce.number().int().positive('Select the employer'),
  unit_id: z.coerce.number().int().positive().optional().nullable(),
  auditor_id: z.coerce.number().int().positive('Select the auditor').optional().nullable(),

  audit_title: z.string().trim().min(4, 'Give the report a descriptive title').max(255),
  report_type: z.enum(asTuple(REPORT_TYPES)).optional().default('AUDIT'),
  audit_period_from: optionalDate,
  audit_period_to: optionalDate,
  audit_date: optionalDate,
  next_audit_due: optionalDate,

  score_obtained: money,
  score_max: money,
  score_percentage: z.coerce.number().min(0).max(100).optional().nullable(),

  body: reportBodySchema.optional(),

  // Verifier routing — when set, the report is queued for that verifier.
  verifier_id: z.coerce.number().int().positive().optional().nullable(),
  verification_due_date: optionalDate,
  submit: z.coerce.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  if (data.audit_period_from && data.audit_period_to && data.audit_period_to < data.audit_period_from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['audit_period_to'], message: 'The period cannot end before it starts' });
  }
  if (data.score_obtained !== null && data.score_max !== null && data.score_obtained !== undefined && data.score_max !== undefined
      && Number(data.score_obtained) > Number(data.score_max)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['score_obtained'], message: 'The score cannot exceed the maximum' });
  }
  if ((data.body?.scorecard?.length ?? 0) > 0 && !data.score_max) {
    // Not an error: the service derives the totals from the scorecard when the
    // headline figures are left blank. Nothing to flag here.
    return;
  }
});

export const reportUpdateSchema = reportCreateSchema.innerType().partial().extend({
  audit_title: z.string().trim().min(4, 'Give the report a descriptive title').max(255).optional(),
  employer_id: z.coerce.number().int().positive().optional(),
  status: z.enum(asTuple(REPORT_STATUSES)).optional(),
  change_summary: optionalString(500),
  create_version: z.coerce.boolean().optional().default(false),
  regenerate_pdf: z.coerce.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  if (data.audit_period_from && data.audit_period_to && data.audit_period_to < data.audit_period_from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['audit_period_to'], message: 'The period cannot end before it starts' });
  }
});

export const reportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  reportType: z.string().trim().optional(),
  employerId: z.coerce.number().int().positive().optional(),
  unitId: z.coerce.number().int().positive().optional(),
  auditorId: z.coerce.number().int().positive().optional(),
  verifierId: z.coerce.number().int().positive().optional(),
  assignmentId: z.coerce.number().int().positive().optional(),
  /** Register-friendly score band: `90` = 90%+, `75` = 75–89, `60` = 60–74, `0` = below 60. */
  scoreBand: z.enum(['all', '90', '75', '60', '0']).optional()
    .transform((value) => (value === undefined || value === 'all' ? undefined : value)),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  criticalOnly: z
    .union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1'),
  pendingVerification: z
    .union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1'),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: z.enum(['created_at', 'submitted_at', 'report_number', 'score_percentage', 'status', 'audit_date']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

/** Auditor → platform submission. */
export const reportSubmitSchema = z.object({
  change_summary: z.string().trim().min(4, 'Summarise what this submission contains').max(500).optional()
    .default('Initial submission'),
  verifier_id: z.coerce.number().int().positive().optional().nullable(),
  send_to_verifier: z.coerce.boolean().optional().default(true),
});

/** Verifier decision: approve, reject outright, or return for correction. */
export const reportReviewSchema = z.object({
  action: z.enum(asTuple(VERIFIER_ACTIONS)),
  comments: z.string().trim().min(10, 'Give the auditor at least a sentence of feedback').max(4000),
  reason: optionalString(500),
  corrections: z.array(z.object({
    section_ref: optionalString(255),
    field_ref: optionalString(150),
    severity: z.enum(['info', 'minor', 'major', 'critical']).default('minor'),
    note: z.string().trim().min(4, 'Describe what needs correcting').max(2000),
  })).max(100).optional().default([]),
  notify_auditor: z.coerce.boolean().optional().default(true),
  notify_employer: z.coerce.boolean().optional().default(false),
  next_audit_due: optionalDate,
}).superRefine((data, ctx) => {
  if ((data.action === 'reject' || data.action === 'return') && !data.reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'A reason is required when rejecting or returning a report' });
  }
});

export const reportCommentSchema = z.object({
  comment: z.string().trim().min(2, 'Write a comment').max(4000),
  comment_type: z.enum(['comment', 'correction_request', 'approval_note', 'rejection_note', 'auditor_reply']).optional().default('comment'),
  section_ref: optionalString(255),
  field_ref: optionalString(150),
  severity: z.enum(['info', 'minor', 'major', 'critical']).optional().default('info'),
  parent_id: z.coerce.number().int().positive().optional().nullable(),
  version: z.coerce.number().int().positive().optional().nullable(),
});

export const reportResolveSchema = z.object({
  is_resolved: z.coerce.boolean().optional().default(true),
});

export const reportVerifierAssignSchema = z.object({
  verifier_id: z.coerce.number().int().positive('Select the verifier'),
  due_date: optionalDate,
  remarks: optionalString(500),
});

export type ReportCreateInput = z.input<typeof reportCreateSchema>;
export type ReportBody = z.infer<typeof reportBodySchema>;
export type FindingInput = z.infer<typeof findingSchema>;

export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type VerifierAction = (typeof VERIFIER_ACTIONS)[number];

/** Statuses a report can be in while still with the verifier. */
export const OPEN_VERIFICATION_STATUSES: ReportStatus[] = ['Submitted', 'Under Review', 'Changes Requested'];
export const ASSIGNMENT_STATUS_BY_REPORT: Partial<Record<ReportStatus, (typeof AUDIT_STATUSES)[number]>> = {
  Submitted: 'Submitted',
  'Under Review': 'Under Review',
  Approved: 'Approved',
  Rejected: 'Rejected',
  'Changes Requested': 'Changes Requested',
};
