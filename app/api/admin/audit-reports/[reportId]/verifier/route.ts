/**
 * GET  /api/admin/audit-reports/[reportId]/verifier — assignment history + workload
 * POST /api/admin/audit-reports/[reportId]/verifier — assign or move the verifier
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import * as repo from '@/repositories/audit-report.repository';
import { assignVerifier } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    await requireAdminApi(['audit_report.read']);
    const assignments = await repo.listVerifierAssignments(id);
    const current = assignments.find((row) => ['pending', 'in_review'].includes(String(row.status))) ?? null;
    const workload = current ? await repo.verifierWorkload(Number(current.verifier_id)) : null;
    return ok({ assignments, current, workload });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/verifier', method: 'GET' });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireAdminApi(['audit_report.update']);
    const result = await assignVerifier(id, await request.json(), { user, ip: clientIp(request) });
    if (!result) return notFound('Report');
    return ok({ report: result.report }, { message: 'Verifier assigned and notified' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/verifier', method: 'POST' });
  }
}
