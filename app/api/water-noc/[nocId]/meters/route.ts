/** POST /api/water-noc/[nocId]/meters - add a water meter (borewell, RO feed, canteen ...) to the NOC. */
import { missing, numericId, one, withWater } from '@/lib/api/water-route';
import { addMeter } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ nocId: string }> }) {
  const id = numericId((await params).nocId);
  if (!id) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/meters', method: 'POST' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await addMeter(actor, id, body ?? {}), { message: 'Meter added', status: 201 });
  });
}
