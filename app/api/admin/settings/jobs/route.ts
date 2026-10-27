/**
 * GET /api/admin/settings/jobs — the scheduled jobs the platform ships, with
 * their schedule, last run and outcome. The operator's cron owns the timing;
 * this screen shows the state and allows an on-demand run of the reminder jobs.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { listJobs } from '@/services/setting.service';
import { JOB_TYPE_LABELS } from '@/lib/validations/setting.validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['settings.read']);
    const jobs = await listJobs();
    return ok(jobs, { extra: { typeLabels: JOB_TYPE_LABELS } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/jobs', method: 'GET' });
  }
}
