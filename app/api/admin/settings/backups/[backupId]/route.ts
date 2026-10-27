/**
 * /api/admin/settings/backups/[backupId]
 *
 * GET    — one run: file path, size on disk, the tables it contains and whether
 *          the dump file is still where the record says it is.
 * DELETE — removes the record and the dump file from disk.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { getBackupDetail, removeBackup } from '@/services/setting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ backupId: string }> }) {
  const id = parseId((await params).backupId);
  if (!id) return notFound('Backup');
  try {
    await requireAdminApi(['settings.read']);
    return ok(await getBackupDetail(id));
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/backups/[backupId]', method: 'GET' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ backupId: string }> }) {
  const id = parseId((await params).backupId);
  if (!id) return notFound('Backup');
  try {
    const user = await requireAdminApi(['settings.update']);
    const result = await removeBackup(id, { user, ip: clientIp(request) });
    return ok(result, { message: result.fileRemoved ? 'Backup record and dump file removed' : 'Backup record removed' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/backups/[backupId]', method: 'DELETE' });
  }
}
