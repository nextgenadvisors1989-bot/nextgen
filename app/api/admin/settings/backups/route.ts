/**
 * GET /api/admin/settings/backups — the backup history: every run with its file,
 * size, duration, trigger and outcome, plus the storage health of the vault and
 * the backup directory so an operator can see whether the disk is keeping up.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { backupListQuerySchema } from '@/lib/validations/setting.validation';
import { filesInBackupDirectory, getBackups, storageHealth } from '@/services/setting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['settings.read']);
    const filters = backupListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const [result, storage, files] = await Promise.all([
      getBackups(filters),
      storageHealth(),
      filesInBackupDirectory(),
    ]);
    return ok(result.data, {
      pagination: result.pagination,
      extra: { stats: result.stats, tableCount: result.tableCount, storage, files },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/backups', method: 'GET' });
  }
}
