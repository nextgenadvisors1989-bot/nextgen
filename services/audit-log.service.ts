/**
 * The observability module: one service over the four logs the platform writes.
 *
 *   activity_logs  — what happened (every mutation, with actor and payload)
 *   audit_trails   — which columns changed, from what to what
 *   login_attempts — who tried to sign in, from where, and whether it worked
 *   error_logs     — what broke, with the stack trace, plus the resolution queue
 *
 * Reads are shaped for the screens (rows + pagination + facets + statistics in
 * one round trip); the only write is resolving an error, which is itself logged
 * so triage is auditable.
 */
import {
  activityLeaderboard, activityLogFilters, activityStats, activityTrend, findActivityLogs,
  type ActivityLogFilters,
} from '@/repositories/activity-log.repository';
import {
  auditTrailFacets, auditTrailStats, findAuditTrails, findLoginAttempts, loginAttemptFacets,
  loginAttemptStats, suspiciousAddresses,
  type AuditTrailFilters, type LoginAttemptFilters,
} from '@/repositories/audit-trail.repository';
import {
  errorLogFacets, errorLogStats, findErrorLogById, findErrorLogs, setErrorResolved,
  type ErrorLogFilters,
} from '@/repositories/error-log.repository';
import { writeActivityLog } from '@/lib/logger/activity-log';
import type { AuthUser } from '@/types/user';

type ServiceError = Error & { code: string };

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code }) as ServiceError;
}

/* ─────────────────────────── activity logs ───────────────────────────────── */

export async function listActivityLogs(filters: ActivityLogFilters & { trend_days?: number | null }) {
  const [result, stats, options, trend, leaderboard] = await Promise.all([
    findActivityLogs(filters),
    activityStats(),
    activityLogFilters(),
    activityTrend(filters.trend_days ?? 14),
    activityLeaderboard(),
  ]);

  return {
    ...result,
    stats,
    options,
    trend: trend.map((row) => ({
      day: String(row.day),
      total: Number(row.total),
      failed: Number(row.failed ?? 0),
      creates: Number(row.creates ?? 0),
      updates: Number(row.updates ?? 0),
      deletes: Number(row.deletes ?? 0),
    })),
    leaderboard,
  };
}

/* ──────────────────────────── audit trails ───────────────────────────────── */

export async function listAuditTrails(filters: AuditTrailFilters) {
  const [result, stats, facets] = await Promise.all([
    findAuditTrails(filters),
    auditTrailStats(),
    auditTrailFacets(),
  ]);
  return { ...result, stats, facets };
}

/* ─────────────────────────── login attempts ─────────────────────────────── */

export async function listLoginAttempts(filters: LoginAttemptFilters) {
  const [result, stats, reasons, suspicious] = await Promise.all([
    findLoginAttempts(filters),
    loginAttemptStats(),
    loginAttemptFacets(),
    suspiciousAddresses(),
  ]);

  return {
    ...result,
    stats,
    reasons: reasons.map((row) => ({
      reason: String(row.failure_reason),
      total: Number(row.total),
    })),
    suspicious: suspicious.map((row) => ({
      ip: String(row.ip_address),
      attempts: Number(row.attempts),
      failures: Number(row.failures),
      emails: Number(row.emails),
      lastSeen: row.last_seen as string,
    })),
  };
}

/* ─────────────────────────────── error logs ─────────────────────────────── */

export async function listErrorLogs(filters: ErrorLogFilters) {
  const [result, stats, facets] = await Promise.all([
    findErrorLogs(filters),
    errorLogStats(),
    errorLogFacets(),
  ]);
  return { ...result, stats, facets };
}

export async function getErrorLog(errorId: number) {
  const error = await findErrorLogById(errorId);
  if (!error) fail('NOT_FOUND', 'That error record no longer exists');

  // Same message + route, other occurrences: a fix is only convincing when the
  // incident stopped repeating.
  const similar = await findErrorLogs({ search: String(error.message).slice(0, 120), limit: 5, page: 1 } as ErrorLogFilters);

  return { error, similar: similar.data };
}

export async function resolveErrorLog(
  errorId: number,
  input: { resolved: boolean; resolution_note?: string | null },
  actor: { user: AuthUser; ip?: string | null }
) {
  const existing = await findErrorLogById(errorId);
  if (!existing) fail('NOT_FOUND', 'That error record no longer exists');
  if (Number(existing.is_resolved) === (input.resolved ? 1 : 0)) {
    fail('NO_CHANGE', input.resolved ? 'That error is already resolved' : 'That error is already open');
  }
  if (input.resolved && !input.resolution_note) {
    fail('VALIDATION_FAILED', 'Add a short note saying what fixed it');
  }

  await setErrorResolved(errorId, {
    resolved: input.resolved,
    resolutionNote: input.resolution_note ?? null,
    resolvedBy: actor.user.id,
  });

  await writeActivityLog({
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: actor.user.employerId,
    action: input.resolved ? 'resolved' : 'reopened',
    module: 'error_log',
    entityType: 'error_log',
    entityId: errorId,
    entityLabel: `${existing.error_type}: ${String(existing.message).slice(0, 120)}`,
    description: input.resolved
      ? `Error #${errorId} marked resolved — ${input.resolution_note}`
      : `Error #${errorId} reopened`,
    oldValues: { is_resolved: Number(existing.is_resolved) },
    newValues: { is_resolved: input.resolved ? 1 : 0, resolution_note: input.resolution_note ?? null },
    ipAddress: actor.ip ?? null,
  });

  return {
    errorId,
    isResolved: input.resolved,
    resolvedBy: actor.user.fullName,
    resolvedAt: input.resolved ? new Date().toISOString() : null,
    resolutionNote: input.resolution_note ?? null,
  };
}
