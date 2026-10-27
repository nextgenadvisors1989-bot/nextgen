/**
 * GET  /api/admin/auditors — paginated register with the full filter set
 *      (search, status, type, specialisation, state, employer, availability, dates).
 * POST /api/admin/auditors — registers an auditor; generates `AUDT/<year>/<serial>`
 *      and optionally provisions the auditor-portal login, returning the
 *      credentials so the admin can hand them over immediately.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { auditorListQuerySchema } from '@/lib/validations/auditor.validation';
import { createAuditor, listAuditors } from '@/services/auditor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['auditor.read']);
    const filters = auditorListQuerySchema.parse(parseSearchParams(request));
    // The register exposes a friendlier "availability" filter; the repository
    // works in terms of a capacity flag.
    const result = await listAuditors({ ...filters, availableOnly: filters.availability === 'available' });

    return ok(result.data, { pagination: result.pagination });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditors', method: 'GET', ip: clientIp(request) ?? undefined });
  }
}

export async function POST(request: Request) {
  let userId: number | undefined;
  let body: unknown;
  try {
    const user = await requireAdminApi(['auditor.create']);
    userId = user.id;
    body = await request.json();

    const result = await createAuditor(body, { user, ip: clientIp(request), userAgent: userAgent(request) });

    return created(
      {
        auditorId: result.auditorId,
        uuid: result.uuid,
        auditorCode: result.auditorCode,
        credentials: result.portalCredentials,
        warnings: result.warnings,
      },
      `Auditor ${result.auditorCode} registered successfully`
    );
  } catch (error) {
    return handleRouteError(error, {
      route: '/api/admin/auditors', method: 'POST', body, userId, ip: clientIp(request) ?? undefined,
    });
  }
}
