/**
 * GET /api/public/billing-services - the names and scope of the services a visitor can ask to have quoted.
 * Fees are deliberately not published here: the priced quotation is prepared by the team (Admin > Billing) and sent to the client.
 */
import { query } from '@/lib/db/mysql';
import { handleRouteError, ok } from '@/lib/utils/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await query("SELECT id, name, scope, frequency FROM billing_services WHERE deleted_at IS NULL AND status = 'active' ORDER BY sort_order, id");
    return ok(rows);
  } catch (error) {
    return handleRouteError(error, { route: '/api/public/billing-services', method: 'GET' });
  }
}
