/**
 * GET /api/admin/contact-enquiries — the inbox of enquiries sent from the public contact form.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { listEnquiries } from '@/services/contact-enquiry.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['contact_enquiry.read']);
    const params = Object.fromEntries(parseSearchParams(request));
    const result = await listEnquiries({
      page: Number(params.page) || 1,
      limit: Number(params.limit) || 10,
      search: params.search,
      status: params.status,
      enquiry_type: params.enquiry_type,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
    });
    return ok(result.data, { pagination: result.pagination, extra: { stats: result.stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/contact-enquiries', method: 'GET' });
  }
}
