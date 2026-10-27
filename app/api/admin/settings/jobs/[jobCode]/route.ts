/**
 * /api/admin/settings/jobs/[jobCode]
 *
 * PATCH — enable/disable a job, or override its cron line.
 * POST  — run a reminder job immediately (the only job type that is safe to
 *         trigger outside its window; backups have their own endpoint).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { jobUpdateSchema } from '@/lib/validations/setting.validation';
import { runJobNow, toggleJob } from '@/services/setting.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ jobCode: string }> }) {
  const { jobCode } = await params;
  try {
    const user = await requireAdminApi(['settings.update']);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Send the job state you want', 400, { code: 'INVALID_JSON' });
    const input = jobUpdateSchema.parse(body);
    const result = await toggleJob(jobCode, input, { user, ip: clientIp(request) });
    return ok(result, { message: `Job ${input.is_active ? 'enabled' : 'disabled'}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/jobs/[jobCode]', method: 'PATCH' });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ jobCode: string }> }) {
  const { jobCode } = await params;
  if (!jobCode) return notFound('Job');
  try {
    const user = await requireAdminApi(['settings.update']);
    const result = await runJobNow(jobCode, { user, ip: clientIp(request) });
    return ok(result, { message: `Job finished — ${result.message}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/jobs/[jobCode]', method: 'POST' });
  }
}
