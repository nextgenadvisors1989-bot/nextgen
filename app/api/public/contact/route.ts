import { submitContactEnquiry } from '@/services/contact.service';
import { clientIp, created, handleRouteError, userAgent } from '@/lib/utils/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/public/contact — public contact form (no session required). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const result = await submitContactEnquiry(body, {
      ip: clientIp(request),
      userAgent: userAgent(request),
      sourcePage: '/contact',
    });
    return created(
      { enquiryId: result.enquiryId },
      'Thank you — your enquiry has been received. We will get back to you within one working day.'
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/public/contact', method: 'POST', body });
  }
}
