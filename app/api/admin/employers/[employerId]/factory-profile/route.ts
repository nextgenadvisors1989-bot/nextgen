/** GET / PUT /api/admin/employers/[employerId]/factory-profile - any company's factory profile, for an administrator. */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { getFactoryProfile, saveFactoryProfile } from '@/services/factory-profile.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idOf = async (params: Promise<{ employerId: string }>) => { const id = Number((await params).employerId); return Number.isInteger(id) && id > 0 ? id : null; };

export async function GET(_request: Request, { params }: { params: Promise<{ employerId: string }> }) {
  try {
    await requireAdminApi(['employer.read']);
    const id = await idOf(params);
    return id ? ok({ data: await getFactoryProfile(id) }) : notFound('Company');
  } catch (error) { return handleRouteError(error, { route: '/api/admin/employers/[employerId]/factory-profile', method: 'GET' }); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ employerId: string }> }) {
  try {
    const user = await requireAdminApi(['employer.update']);
    const id = await idOf(params);
    if (!id) return notFound('Company');
    await saveFactoryProfile(id, await request.json().catch(() => ({})), user.id);
    return ok({ data: await getFactoryProfile(id) }, { message: 'Factory profile saved' });
  } catch (error) { return handleRouteError(error, { route: '/api/admin/employers/[employerId]/factory-profile', method: 'PUT' }); }
}
