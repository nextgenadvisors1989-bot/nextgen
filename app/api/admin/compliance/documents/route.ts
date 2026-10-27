/**
 * GET  /api/admin/compliance/documents — the employer legal register: licences,
 *       certificates, permits and returns with their derived expiry status
 * POST /api/admin/compliance/documents — records a document (duplicate number
 *       for the same employer + type is refused)
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { documentListQuerySchema } from '@/lib/validations/compliance.validation';
import { createDocument, listDocuments } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['compliance_document.read']);
    const filters = documentListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listDocuments(filters);
    return ok(result.data, {
      pagination: result.pagination,
      extra: {
        stats: result.stats,
        types: result.types,
        actOptions: result.actOptions,
        employerOptions: result.employerOptions,
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/documents', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['compliance_document.create']);
    const result = await createDocument(await request.json(), { user, ip: clientIp(request), userAgent: userAgent(request) });
    return created(result, `${result.documentName} recorded (${result.complianceStatus})`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/compliance/documents', method: 'POST' });
  }
}
