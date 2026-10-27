/**
 * GET  /api/admin/auditor-types — the auditor-type register with auditor counts.
 * POST /api/admin/auditor-types — creates a type (code must be unique).
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { created, handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { createAuditorType, listAuditorTypes } from '@/services/auditor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['auditor_type.read']);
    const params = parseSearchParams(request);
    const types = await listAuditorTypes({
      search: params.get('search') ?? undefined,
      status: params.get('status') ?? undefined,
    });
    return ok(types);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditor-types', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['auditor_type.create']);
    const result = await createAuditorType(await request.json(), { user });
    return created(result, 'Auditor type created successfully');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditor-types', method: 'POST' });
  }
}
