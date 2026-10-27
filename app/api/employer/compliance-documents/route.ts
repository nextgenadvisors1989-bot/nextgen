/**
 * GET  /api/employer/compliance-documents — this company's legal register
 *      (licences, certificates, permits, returns) with derived expiry status,
 *      type breakdown and the documents expiring within 90 days.
 * POST /api/employer/compliance-documents — records a document for this company.
 *      The employer id always comes from the session, never the request body.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, created, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { documentListQuerySchema } from '@/lib/validations/compliance.validation';
import { createEmployerDocument, employerComplianceOverview, listEmployerDocuments } from '@/services/compliance.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireEmployerApi(['compliance_document.read']);
    const params = parseSearchParams(request);
    const filters = documentListQuerySchema.parse(Object.fromEntries(params));
    const employerId = Number(user.employerId ?? 0);
    if (!employerId) return ok([], { pagination: { total: 0, page: 1, limit: 10, totalPages: 0, from: 0, to: 0 } });

    const result = await listEmployerDocuments(employerId, filters);
    const overview = params.get('overview') === 'true' ? await employerComplianceOverview(employerId) : null;
    return ok(result.data, {
      pagination: result.pagination,
      extra: {
        stats: result.stats,
        types: result.types,
        employer: result.employer,
        expiring: result.expiring,
        ...(overview ? { units: overview.unitOptions } : {}),
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/compliance-documents', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireEmployerApi(['compliance_document.create']);
    const employerId = Number(user.employerId ?? 0);
    const result = await createEmployerDocument(employerId, await request.json(), {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    return created(result, `${result.documentName} recorded (${result.complianceStatus})`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/compliance-documents', method: 'POST' });
  }
}
