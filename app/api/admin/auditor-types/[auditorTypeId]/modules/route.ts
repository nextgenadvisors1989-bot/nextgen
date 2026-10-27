/**
 * /api/admin/auditor-types/[auditorTypeId]/modules — the audit forms an auditor type works with.
 *
 * GET — the modules mapped to the type, and every module that could be mapped.
 * PUT — replace the mapped set: { module_ids: number[] }.
 *
 * An auditor sees only the modules mapped to their own type, so this is where an administrator
 * decides which forms (and therefore which titles, fields and PDFs) each kind of auditor gets.
 */
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, validationFailed } from '@/lib/utils/api-response';
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { writeActivityLog } from '@/lib/logger/activity-log';
import * as moduleRepo from '@/repositories/dynamic-module.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ module_ids: z.array(z.coerce.number().int().positive()).max(200) });

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ auditorTypeId: string }> }) {
  const id = parseId((await params).auditorTypeId);
  if (!id) return notFound('Auditor type');
  try {
    await requireAdminApi(['auditor_type.read']);
    const type = await queryOne<RowDataPacket>('SELECT id, name FROM auditor_types WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!type) return notFound('Auditor type');
    const [assigned, available] = await Promise.all([
      moduleRepo.modulesForAuditorType(id),
      query<RowDataPacket>(
        `SELECT m.id, m.name, m.module_type, m.category, m.status,
                (SELECT COUNT(*) FROM dynamic_forms f WHERE f.module_id = m.id AND f.deleted_at IS NULL AND f.status = 'published') AS published_forms
           FROM dynamic_modules m WHERE m.deleted_at IS NULL ORDER BY m.category, m.name`
      ),
    ]);
    return ok({ type, assigned, available });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditor-types/[auditorTypeId]/modules', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ auditorTypeId: string }> }) {
  const id = parseId((await params).auditorTypeId);
  if (!id) return notFound('Auditor type');
  try {
    const user = await requireAdminApi(['auditor_type.update']);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationFailed(parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));

    const type = await queryOne<RowDataPacket>('SELECT id, name FROM auditor_types WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!type) return notFound('Auditor type');

    const wanted = [...new Set(parsed.data.module_ids)];
    const existing = wanted.length
      ? await query<RowDataPacket>(`SELECT id FROM dynamic_modules WHERE deleted_at IS NULL AND id IN (${wanted.map(() => '?').join(',')})`, wanted)
      : [];
    const valid = new Set(existing.map((row) => Number(row.id)));
    const moduleIds = wanted.filter((moduleId) => valid.has(moduleId));

    await moduleRepo.setModulesForAuditorType(id, moduleIds, user.id);
    await writeActivityLog({
      userId: user.id, userName: user.fullName, userRole: user.primaryRole,
      action: 'update', module: 'auditor_type', entityType: 'auditor_type', entityId: id, entityLabel: String(type.name),
      description: `Forms for auditor type "${type.name}" set to ${moduleIds.length} module(s)`,
      newValues: { module_ids: moduleIds }, ipAddress: clientIp(request),
    });
    return ok({ count: moduleIds.length }, { message: `${moduleIds.length} form module(s) assigned to ${type.name}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditor-types/[auditorTypeId]/modules', method: 'PUT' });
  }
}
