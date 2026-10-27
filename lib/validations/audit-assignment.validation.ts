import { z } from 'zod';
import { AUDIT_STATUSES, AUDIT_PRIORITIES } from '@/types/audit';

/** Zod enums need a non-empty tuple; the shared constants are string arrays. */
const asTuple = <T extends string>(values: readonly T[]): [T, ...T[]] => [...values] as [T, ...T[]];

const optionalString = (max: number) =>
  z.string().trim().max(max).optional().nullable()
    .transform((value) => (value === '' ? null : value ?? null));

const optionalDate = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const optionalDateTime = z
  .union([z.string().trim().min(10), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

export const ASSIGNMENT_TYPES = ['AUDIT', 'ASSESSMENT', 'RISK', 'STUDY', 'WORK_PERMIT', 'INSPECTION'] as const;

const assignmentBase = z.object({
  assignment_type: z.enum(ASSIGNMENT_TYPES).optional().default('AUDIT'),
  audit_title: z.string().trim().min(4, 'Give the assignment a descriptive title').max(255),

  // Optional dynamic-module link; the module engine (Phase 3) fills these in.
  module_id: z.coerce.number().int().positive().optional().nullable(),
  form_id: z.coerce.number().int().positive().optional().nullable(),

  employer_id: z.coerce.number().int().positive('Select the employer'),
  unit_id: z.coerce.number().int().positive().optional().nullable(),
  department_id: z.coerce.number().int().positive().optional().nullable(),

  auditor_id: z.coerce.number().int().positive('Select the auditor'),
  verifier_id: z.coerce.number().int().positive().optional().nullable(),

  start_date: optionalDate,
  end_date: optionalDate,
  due_date: optionalDate,
  audit_end_meeting_at: optionalDateTime,

  priority: z.enum(asTuple(AUDIT_PRIORITIES)).optional().default('Medium'),
  scope: optionalString(5000),
  instructions: optionalString(5000),
  fee_amount: z.coerce.number().min(0, 'Fee cannot be negative').max(999999999).optional().nullable(),

  // Notification switches — all default on, mirroring the documented flow.
  notify_auditor: z.coerce.boolean().optional().default(true),
  notify_verifier: z.coerce.boolean().optional().default(true),
  notify_employer: z.coerce.boolean().optional().default(true),
  create_calendar_event: z.coerce.boolean().optional().default(true),
  reminder_minutes: z.coerce.number().int().min(0).max(20160).optional().default(1440),
});

/**
 * Schedule sanity: the audit cannot end before it starts, the due date cannot
 * fall before the start, and the closing meeting belongs inside the window.
 */
function checkSchedule(
  data: { start_date?: string | null; end_date?: string | null; due_date?: string | null; audit_end_meeting_at?: string | null },
  ctx: z.RefinementCtx
) {
  const start = data.start_date ?? null;
  const end = data.end_date ?? null;
  const due = data.due_date ?? null;

  if (start && end && end < start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_date'], message: 'The end date cannot be before the start date' });
  }
  if (start && due && due < start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['due_date'], message: 'The due date cannot be before the start date' });
  }
  if (end && due && due < end) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['due_date'], message: 'Leave room after the audit ends — the due date cannot be before the end date' });
  }
  if (data.audit_end_meeting_at && end && data.audit_end_meeting_at.slice(0, 10) < end) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['audit_end_meeting_at'], message: 'The closing meeting should not be before the audit end date' });
  }
}

export const assignmentCreateSchema = assignmentBase.superRefine(checkSchedule);

export const assignmentUpdateSchema = assignmentBase.partial().extend({
  audit_title: z.string().trim().min(4, 'Give the assignment a descriptive title').max(255).optional(),
  employer_id: z.coerce.number().int().positive().optional(),
  auditor_id: z.coerce.number().int().positive().optional(),
  status: z.enum(asTuple(AUDIT_STATUSES)).optional(),
  progress_percent: z.coerce.number().int().min(0).max(100).optional(),
}).superRefine(checkSchedule);

export const assignmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  type: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  employerId: z.coerce.number().int().positive().optional(),
  unitId: z.coerce.number().int().positive().optional(),
  auditorId: z.coerce.number().int().positive().optional(),
  verifierId: z.coerce.number().int().positive().optional(),
  // Sent by the register as `true` / `false` strings; "false" must stay falsy.
  overdueOnly: z
    .union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1'),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  sortBy: z
    .enum(['created_at', 'due_date', 'start_date', 'audit_title', 'assignment_number', 'priority', 'status', 'progress_percent'])
    .optional()
    .default('created_at'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const assignmentReassignSchema = z.object({
  auditor_id: z.coerce.number().int().positive('Select the auditor to reassign to'),
  verifier_id: z.coerce.number().int().positive().optional().nullable(),
  reason: z.string().trim().min(4, 'Give a reason for the reassignment').max(500),
  notify: z.coerce.boolean().optional().default(true),
});

export const assignmentCancelSchema = z.object({
  reason: z.string().trim().min(4, 'Give a reason for cancellation').max(500),
});

export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;
export type AssignmentUpdateInput = z.infer<typeof assignmentUpdateSchema>;
