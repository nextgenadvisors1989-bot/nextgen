/**
 * /api/water-noc/[nocId]
 * GET    - the NOC with its conditions, meters, readings and usage against the approved quantity.
 * PATCH  - change the NOC details (number, authority, dates, approved quantity, well details ...).
 * DELETE - admin only: remove the NOC and its legal-register row.
 */
import { missing, numericId, one, withWater } from '@/lib/api/water-route';
import { deleteNoc, getNocDetail, updateNoc } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ nocId: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const id = numericId((await params).nocId);
  if (!id) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]', method: 'GET' }, async (user) => one(await getNocDetail(user, id)));
}

export async function PATCH(request: Request, { params }: Ctx) {
  const id = numericId((await params).nocId);
  if (!id) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]', method: 'PATCH' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await updateNoc(actor, id, body ?? {}), { message: 'NOC saved' });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const id = numericId((await params).nocId);
  if (!id) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]', method: 'DELETE' }, async (_user, actor) => {
    await deleteNoc(actor, id);
    return one({ id }, { message: 'NOC deleted' });
  });
}
