/**
 * GET /api/public/site-contact - the support email, phones and WhatsApp number shown in the Help menu of every panel.
 * These are the same public company settings the website footer prints.
 */
import { handleRouteError } from '@/lib/utils/api-response';
import { one } from '@/lib/api/capar-route';
import { getSiteInfo } from '@/services/site.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const site = await getSiteInfo();
    return one({ email: site.email, phone: site.phone, phone2: site.phone2, whatsapp: site.whatsapp, timing: site.timing });
  } catch (error) {
    return handleRouteError(error, { route: '/api/public/site-contact', method: 'GET' });
  }
}
