/** POST /api/water-noc/[nocId]/conditions/standard - copy the 18 standard NOC conditions onto a NOC that has none yet. */
import { missing, numericId, one, withWater } from '@/lib/api/water-route';
import { addStandardConditions } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ nocId: string }> }) {
  const id = numericId((await params).nocId);
  if (!id) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/conditions/standard', method: 'POST' }, async (_user, actor) =>
    one(await addStandardConditions(actor, id), { message: 'Standard conditions added', status: 201 })
  );
}
