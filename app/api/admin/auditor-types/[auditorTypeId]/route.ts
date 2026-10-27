/**
 * /api/admin/auditor-types/[auditorTypeId] — read, update and archive auditor types.
 * Archiving is refused while auditors are still registered under the type.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { updateAuditorType, deleteAuditorType } from '@/services/auditor.service';
import * as repo from '@/repositories/auditor.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ auditorTypeId: string }> }) {
  const { auditorTypeId } = await params;
  const id = Number(auditorTypeId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Auditor type');

  try {
    await requireAdminApi(['auditor_type.read']);
    const type = await repo.findAuditorTypeById(id);
    if (!type) return notFound('Auditor type');
    return ok(type);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditor-types/[auditorTypeId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ auditorTypeId: string }> }) {
  const { auditorTypeId } = await params;
  const id = Number(auditorTypeId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Auditor type');

  try {
    const user = await requireAdminApi(['auditor_type.update']);
    const result = await updateAuditorType(id, await request.json(), { user, ip: clientIp(request) });
    if (!result) return notFound('Auditor type');
    if (!result.updated) return fail('No changes were applied');
    return ok({ updated: result.updated }, { message: 'Auditor type updated successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditor-types/[auditorTypeId]', method: 'PUT' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ auditorTypeId: string }> }) {
  const { auditorTypeId } = await params;
  const id = Number(auditorTypeId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Auditor type');

  try {
    const user = await requireAdminApi(['auditor_type.delete']);
    const result = await deleteAuditorType(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Auditor type');
    if (!result.deleted) return fail(result.reason ?? 'Auditor type cannot be archived', 409);
    return ok({ archived: true }, { message: 'Auditor type archived successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditor-types/[auditorTypeId]', method: 'DELETE' });
  }
}
