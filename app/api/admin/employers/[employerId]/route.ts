import { requireAdminApi } from '@/lib/auth/api-guards';
import { getEmployerDetail, updateEmployer, deleteEmployer } from '@/services/employer.service';
import { fail, handleRouteError, notFound, ok, clientIp, userAgent } from '@/lib/utils/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ employerId: string }> };

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/admin/employers/:employerId — employer + units + departments + stats. */
export async function GET(request: Request, { params }: Params) {
  try {
    await requireAdminApi(['employer.read']);
    const { employerId } = await params;
    const id = parseId(employerId);
    if (!id) return fail('Invalid employer id', 400);

    const detail = await getEmployerDetail(id);
    if (!detail) return notFound('Employer');

    return ok(detail);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employers/:id', method: 'GET' });
  }
}

/** PUT /api/admin/employers/:employerId — partial update with field-level audit trail. */
export async function PUT(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireAdminApi(['employer.update']);
    const { employerId } = await params;
    const id = parseId(employerId);
    if (!id) return fail('Invalid employer id', 400);

    const result = await updateEmployer(id, body, { user, ip: clientIp(request), userAgent: userAgent(request) });
    if (!result) return notFound('Employer');

    return ok({ employer: result.employer, changedFields: result.changedFields }, { message: 'Employer updated successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employers/:id', method: 'PUT', body });
  }
}

/**
 * DELETE /api/admin/employers/:employerId
 * Soft delete. Refused while the employer has audits in flight.
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireAdminApi(['employer.delete']);
    const { employerId } = await params;
    const id = parseId(employerId);
    if (!id) return fail('Invalid employer id', 400);

    const result = await deleteEmployer(id, { user, ip: clientIp(request) });
    if (!result) return notFound('Employer');
    if (result.blocked) {
      return fail(
        `This employer has ${result.openAudits} audit(s) in progress. Complete or cancel them before archiving.`,
        409,
        { code: 'HAS_OPEN_AUDITS' }
      );
    }

    return ok({ archived: true }, { message: 'Employer archived successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employers/:id', method: 'DELETE' });
  }
}
