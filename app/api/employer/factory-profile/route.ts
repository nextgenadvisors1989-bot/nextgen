/** GET / PUT /api/employer/factory-profile - the signed-in company's own factory profile. */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { fail, handleRouteError, ok } from '@/lib/utils/api-response';
import { getFactoryProfile, saveFactoryProfile } from '@/services/factory-profile.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireEmployerApi(['employer.read']);
    const id = Number(user.employerId ?? 0);
    return id ? ok({ data: await getFactoryProfile(id) }) : fail('Your login is not linked to a company', 403);
  } catch (error) { return handleRouteError(error, { route: '/api/employer/factory-profile', method: 'GET' }); }
}

export async function PUT(request: Request) {
  try {
    const user = await requireEmployerApi(['employer.update']);
    const id = Number(user.employerId ?? 0);
    if (!id) return fail('Your login is not linked to a company', 403);
    await saveFactoryProfile(id, await request.json().catch(() => ({})), user.id);
    return ok({ data: await getFactoryProfile(id) }, { message: 'Factory profile saved' });
  } catch (error) { return handleRouteError(error, { route: '/api/employer/factory-profile', method: 'PUT' }); }
}
