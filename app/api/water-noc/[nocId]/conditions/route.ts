/** POST /api/water-noc/[nocId]/conditions - add one condition to the NOC checklist. */
import { missing, numericId, one, withWater } from '@/lib/api/water-route';
import { addCondition } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ nocId: string }> }) {
  const id = numericId((await params).nocId);
  if (!id) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/conditions', method: 'POST' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await addCondition(actor, id, body ?? {}), { message: 'Condition added', status: 201 });
  });
}
