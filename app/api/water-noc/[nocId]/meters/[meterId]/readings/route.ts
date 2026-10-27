/** POST /api/water-noc/[nocId]/meters/[meterId]/readings - record a meter reading (date, cumulative value, optional reset). */
import { missing, numericId, one, withWater } from '@/lib/api/water-route';
import { addReading } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ nocId: string; meterId: string }> }) {
  const resolved = await params;
  const nocId = numericId(resolved.nocId);
  const meterId = numericId(resolved.meterId);
  if (!nocId || !meterId) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/meters/[meterId]/readings', method: 'POST' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await addReading(actor, nocId, meterId, body ?? {}), { message: 'Reading recorded', status: 201 });
  });
}
