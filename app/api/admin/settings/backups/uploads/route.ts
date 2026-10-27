/**
 * POST /api/admin/settings/backups/uploads — copies the upload vault into the
 * backup directory (the "include uploaded files" switch). The SQL dump and the
 * files together make a restorable pair.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok } from '@/lib/utils/api-response';
import { copyUploadsToBackup } from '@/services/setting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['settings.update']);
    const result = await copyUploadsToBackup({ user, ip: clientIp(request) });
    return ok(result, {
      message: `${result.copied} uploaded file(s) copied (${(result.bytes / 1024 / 1024).toFixed(2)} MB)`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/backups/uploads', method: 'POST' });
  }
}
