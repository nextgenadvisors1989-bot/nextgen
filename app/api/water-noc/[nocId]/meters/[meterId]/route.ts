/**
 * /api/water-noc/[nocId]/meters/[meterId]
 * PATCH  - rename, change the unit, switch whether it counts toward the NOC limit, deactivate.
 * DELETE - remove the meter.
 */
import { missing, numericId, one, withWater } from '@/lib/api/water-route';
import { deleteMeter, updateMeter } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ nocId: string; meterId: string }> };

async function ids({ params }: Ctx) {
  const resolved = await params;
  return { nocId: numericId(resolved.nocId), meterId: numericId(resolved.meterId) };
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { nocId, meterId } = await ids(ctx);
  if (!nocId || !meterId) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/meters/[meterId]', method: 'PATCH' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await updateMeter(actor, nocId, meterId, body ?? {}), { message: 'Meter saved' });
  });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { nocId, meterId } = await ids(ctx);
  if (!nocId || !meterId) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/meters/[meterId]', method: 'DELETE' }, async (_user, actor) => {
    await deleteMeter(actor, nocId, meterId);
    return one({ id: meterId }, { message: 'Meter removed' });
  });
}
