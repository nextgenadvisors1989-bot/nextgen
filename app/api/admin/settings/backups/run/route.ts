/**
 * POST /api/admin/settings/backups/run — runs `mysqldump` now.
 *
 * Body: `{ type?: 'full' | 'schema' | 'data', note? }`. The run is recorded in
 * `backup_history` before the dump starts, so a crash leaves a visible failed
 * row rather than silence, and the retention window prunes old dumps afterwards.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, ok } from '@/lib/utils/api-response';
import { backupRunSchema } from '@/lib/validations/setting.validation';
import { runBackupNow } from '@/services/setting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['settings.update']);
    const body = await request.json().catch(() => ({}));
    const input = backupRunSchema.parse(body ?? {});
    const result = await runBackupNow(input, { user, ip: clientIp(request) });
    return ok(result, {
      message: `${input.type} backup written — ${(result.sizeBytes / 1024).toFixed(0)} kB across ${result.tables} tables in ${result.durationMs} ms`,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/backups/run', method: 'POST' });
  }
}
