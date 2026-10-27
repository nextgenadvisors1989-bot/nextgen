/**
 * /api/admin/auditors/[auditorId]
 *
 * GET    — auditor profile, workload statistics, assignments, clients, documents, login.
 * PUT    — partial profile update (audit-trailed).
 * DELETE — soft delete; refused while open assignments exist, and it also
 *          deactivates the auditor-portal login.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { deleteAuditor, getAuditorDetail, updateAuditor } from '@/services/auditor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ auditorId: string }> }) {
  const { auditorId } = await params;
  const id = Number(auditorId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Auditor');

  try {
    await requireAdminApi(['auditor.read']);
    const detail = await getAuditorDetail(id);
    if (!detail) return notFound('Auditor');
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditors/[auditorId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ auditorId: string }> }) {
  const { auditorId } = await params;
  const id = Number(auditorId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Auditor');

  let userId: number | undefined;
  let body: unknown;
  try {
    const user = await requireAdminApi(['auditor.update']);
    userId = user.id;
    body = await request.json();

    const result = await updateAuditor(id, body, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Auditor');
    if (!result.updated) return fail('No changes were applied');

    return ok({ auditor: result.auditor }, { message: 'Auditor updated successfully' });
  } catch (error) {
    return handleRouteError(error, {
      route: '/api/admin/auditors/[auditorId]', method: 'PUT', body, userId, ip: clientIp(request) ?? undefined,
    });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ auditorId: string }> }) {
  const { auditorId } = await params;
  const id = Number(auditorId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Auditor');

  try {
    const user = await requireAdminApi(['auditor.delete']);
    const result = await deleteAuditor(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Auditor');
    if (!result.deleted) return fail(result.reason ?? 'Auditor cannot be archived', 409);

    return ok(
      { archived: true, portalDisabled: result.portalDisabled },
      {
        message: result.portalDisabled
          ? 'Auditor archived and their portal login deactivated'
          : 'Auditor archived successfully',
      }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditors/[auditorId]', method: 'DELETE' });
  }
}
