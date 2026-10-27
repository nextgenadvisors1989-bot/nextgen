/**
 * GET /api/verifier/reports — the verification queue for the signed-in verifier.
 *
 * Scoped to the verifier's own `verifier_assignments` rows; administrators and
 * super admins see the whole queue, which is what the admin "verifier queue"
 * screen uses.
 */
import { requireVerifierApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import * as repo from '@/repositories/audit-report.repository';
import { reportStats } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireVerifierApi(['verifier.read']);
    const params = parseSearchParams(request);
    const isAdmin = user.roles.some((role) => ['admin', 'super_admin'].includes(role.slug));

    const status = params.get('status') ?? undefined;
    const limit = Math.min(Math.max(Number(params.get('limit') ?? 50), 1), 200);

    const rows = isAdmin ? await adminQueue(status, limit) : await repo.pendingForVerifier(user.id, limit);

    const stats = await repo.verifierWorkload(user.id);
    const reportCounters = await reportStats(undefined, isAdmin ? undefined : user.id);

    return ok(rows, {
      extra: {
        workload: {
          pending: Number(stats?.pending ?? 0),
          completed: Number(stats?.completed ?? 0),
          overdue: Number(stats?.overdue ?? 0),
          averageTurnaroundDays: stats?.avg_turnaround_days === null || stats?.avg_turnaround_days === undefined
            ? null
            : Number(Number(stats.avg_turnaround_days).toFixed(1)),
        },
        stats: reportCounters,
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/verifier/reports', method: 'GET' });
  }
}

/** Admin view of the whole verification pipeline (all verifiers). */
async function adminQueue(status: string | undefined, limit: number) {
  const filters: repo.ReportListFilters = {
    limit,
    page: 1,
    pendingVerification: !status || status === 'pending' ? true : undefined,
    status: status && status !== 'pending' ? status : undefined,
    sortBy: 'submitted_at',
    sortDir: 'asc',
  };
  const result = await repo.findReports(filters);
  return result.data;
}
