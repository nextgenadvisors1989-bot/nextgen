/**
 * /api/admin/payroll/leave/types
 *
 * GET  — the leave types a company offers (paid or unpaid, how many days a year,
 *        whether a document is required, whether the balance may be encashed).
 * POST — adds a leave type for a company. The seed ships the eight types the
 *        establishment needs; a company with an unusual contract adds its own.
 */
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, fail, handleRouteError, ok, parseSearchParams, userAgent } from '@/lib/utils/api-response';
import { createLeaveType, listLeaveTypes } from '@/services/payroll.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['leave.read']);
    const employerId = Number(parseSearchParams(request).get('employer_id')) || null;
    const types = await listLeaveTypes(employerId);
    return ok(types);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/leave/types', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['leave.create']);
    const body = (await request.json()) as Record<string, unknown>;
    const employer = await queryOne<RowDataPacket>(
      'SELECT id, employer_code FROM employers WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [Number(body.employer_id ?? 0)]
    );
    if (!employer) {
      return fail('Choose the company the leave type belongs to', 422, {
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'employer_id', message: 'Choose the company the leave type belongs to' }],
      });
    }
    const result = await createLeaveType(body, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, Number(employer.id), String(employer.employer_code));
    return created(result, 'Leave type added');
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/leave/types', method: 'POST' });
  }
}
