/**
 * Contracts for the four log screens.
 *
 * Activity logs, column-level audit trails, sign-in attempts and captured
 * errors all share the same list-query shape (page, limit, search, sort) so the
 * screens can lean on one hook; each register adds only the filters it actually
 * stores.
 */
import { z } from 'zod';

const optionalString = (max: number) =>
  z.string().trim().max(max).optional().nullable()
    .transform((value) => (value === '' ? null : value ?? null));

const optionalDate = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const optionalId = z.coerce.number().int().positive().optional().nullable();

const baseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: optionalString(200),
  sortBy: optionalString(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

/* ───────────────────────────── catalogues ──────────────────────────────── */

export const LOG_ACTIONS = [
  'created', 'updated', 'deleted', 'archived', 'restored', 'login', 'logout',
  'submitted', 'approved', 'rejected', 'returned', 'uploaded', 'exported',
  'verified', 'renewed', 'reminded', 'assigned', 'started', 'completed', 'reviewed',
] as const;

export const ACTIVITY_STATUSES = ['success', 'failed', 'warning'] as const;
export const ACTIVITY_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;

export const TRAIL_OPERATIONS = ['INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE'] as const;

export const ERROR_SEVERITIES = ['debug', 'info', 'warning', 'error', 'critical', 'fatal'] as const;

export const LOG_RESOLUTION_STATES = ['all', 'open', 'resolved'] as const;

/* ─────────────────────────────── queries ───────────────────────────────── */

export const activityLogQuerySchema = baseListQuerySchema.extend({
  module: optionalString(60),
  action: optionalString(40),
  user_id: optionalId,
  user_role: optionalString(40),
  entity_type: optionalString(40),
  entity_id: optionalId,
  status: optionalString(20),
  severity: optionalString(20),
  from_date: optionalDate,
  to_date: optionalDate,
  trend_days: z.coerce.number().int().min(1).max(90).optional(),
});

export const auditTrailQuerySchema = baseListQuerySchema.extend({
  table_name: optionalString(64),
  record_id: optionalId,
  operation: optionalString(20),
  field_name: optionalString(64),
  changed_by: optionalId,
  from_date: optionalDate,
  to_date: optionalDate,
  changedOnly: z
    .union([z.boolean(), z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value === true || value === '1' || value === 'true'),
});

export const loginAttemptQuerySchema = baseListQuerySchema.extend({
  success: z.enum(['all', 'true', 'false']).optional().default('all'),
  failure_reason: optionalString(120),
  user_id: optionalId,
  from_date: optionalDate,
  to_date: optionalDate,
});

export const errorLogQuerySchema = baseListQuerySchema.extend({
  severity: optionalString(20),
  error_type: optionalString(120),
  route_name: optionalString(200),
  // `open`/`resolved` are what the queue's state filter sends; `true`/`false`
  // stay accepted for direct API callers. Both mean the same thing.
  resolved: z.enum(['all', 'open', 'resolved', 'true', 'false']).optional().default('all'),
  from_date: optionalDate,
  to_date: optionalDate,
});

/* ─────────────────────────────── mutations ─────────────────────────────── */

export const resolveErrorSchema = z.object({
  resolved: z.boolean().default(true),
  // A whitespace-only note is not a note: it trims to null, which the service
  // then refuses (resolution requires an explanation).
  resolution_note: z
    .union([z.string().max(1000), z.literal('')])
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = (value ?? '').trim();
      return trimmed === '' ? null : trimmed;
    }),
});

export type ActivityLogQuery = z.infer<typeof activityLogQuerySchema>;
export type AuditTrailQuery = z.infer<typeof auditTrailQuerySchema>;
export type LoginAttemptQuery = z.infer<typeof loginAttemptQuerySchema>;
export type ErrorLogQuery = z.infer<typeof errorLogQuerySchema>;
