/**
 * /api/admin/contact-enquiries/[enquiryId]
 *
 * GET — one enquiry with its message and recorded response.
 * PUT — move it through the workflow, assign it and record the response.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { getEnquiry, updateEnquiry } from '@/services/contact-enquiry.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ enquiryId: string }> }) {
  const id = parseId((await params).enquiryId);
  if (!id) return notFound('Enquiry');
  try {
    await requireAdminApi(['contact_enquiry.read']);
    const enquiry = await getEnquiry(id);
    return enquiry ? ok(enquiry) : notFound('Enquiry');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/contact-enquiries/[enquiryId]', method: 'GET' });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ enquiryId: string }> }) {
  const id = parseId((await params).enquiryId);
  if (!id) return notFound('Enquiry');
  try {
    const user = await requireAdminApi(['contact_enquiry.update']);
    const body = await request.json().catch(() => ({}));
    const updated = await updateEnquiry(id, body ?? {}, { user, ip: clientIp(request) });
    return updated ? ok(updated, { message: 'Enquiry updated' }) : notFound('Enquiry');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/contact-enquiries/[enquiryId]', method: 'PUT' });
  }
}
