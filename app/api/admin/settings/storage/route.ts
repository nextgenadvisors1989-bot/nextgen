/**
 * /api/admin/settings/storage — what is on disk: the upload vault and the backup
 * directory, measured. Used by the backup screen so an operator can see the
 * footprint before deciding on retention.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { filesInBackupDirectory, storageHealth } from '@/services/setting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['settings.read']);
    const [storage, files] = await Promise.all([storageHealth(), filesInBackupDirectory()]);
    return ok({ ...storage, files });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/storage', method: 'GET' });
  }
}
