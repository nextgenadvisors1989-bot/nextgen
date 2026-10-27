/**
 * GET /api/admin/dynamic-forms — every form across modules, with field counts.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { listForms } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['form.read']);
    const result = await listForms(parseSearchParams(request));
    return ok(result.data, {
      pagination: result.pagination,
      extra: { moduleOptions: result.moduleOptions, formTypes: result.formTypes, roles: result.roles },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-forms', method: 'GET' });
  }
}
