/**
 * GET /api/admin/dynamic-modules/options — lookups for the filters, the builder
 * and the assignment screen (modules, categories, types, statuses, roles).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { moduleOptions } from '@/services/dynamic-module.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminApi(['module.read']);
    return ok(await moduleOptions());
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/dynamic-modules/options', method: 'GET' });
  }
}
