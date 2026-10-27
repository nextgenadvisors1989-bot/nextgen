import { requireAdminApi } from '@/lib/auth/api-guards';
import { listEmployers, createEmployer } from '@/services/employer.service';
import { employerListQuerySchema } from '@/lib/validations/employer.validation';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/employers
 * Query: page, limit, search, status, industry, state, dateFrom, dateTo, sortBy, sortDir
 */
export async function GET(request: Request) {
  try {
    await requireAdminApi(['employer.read']);
    const params = parseSearchParams(request);
    const filters = employerListQuerySchema.parse(Object.fromEntries(params.entries()));

    const { data, pagination } = await listEmployers(filters);
    return ok(data, { pagination });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employers', method: 'GET' });
  }
}

/**
 * POST /api/admin/employers
 * Body: every employer field, plus optional portal-user provisioning flags.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireAdminApi(['employer.create']);
    const result = await createEmployer(body, {
      user,
      ip: clientIp(request),
      userAgent: userAgent(request),
    });

    return created(result, 'Employer created successfully');
  } catch (error) {
    return handleRouteError(error, {
      route: '/api/admin/employers',
      method: 'POST',
      body,
      userId: undefined,
    });
  }
}
