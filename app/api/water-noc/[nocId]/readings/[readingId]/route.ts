/**
 * /api/water-noc/[nocId]/readings/[readingId]
 * PATCH  - correct a reading (date, value, reset flag, remarks).
 * DELETE - remove a wrong reading.
 */
import { missing, numericId, one, withWater } from '@/lib/api/water-route';
import { deleteReading, updateReading } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ nocId: string; readingId: string }> };

async function ids({ params }: Ctx) {
  const resolved = await params;
  return { nocId: numericId(resolved.nocId), readingId: numericId(resolved.readingId) };
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { nocId, readingId } = await ids(ctx);
  if (!nocId || !readingId) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/readings/[readingId]', method: 'PATCH' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await updateReading(actor, nocId, readingId, body ?? {}), { message: 'Reading saved' });
  });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { nocId, readingId } = await ids(ctx);
  if (!nocId || !readingId) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/readings/[readingId]', method: 'DELETE' }, async (_user, actor) => {
    await deleteReading(actor, nocId, readingId);
    return one({ id: readingId }, { message: 'Reading removed' });
  });
}
