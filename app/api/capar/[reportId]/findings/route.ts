/** POST /api/capar/[reportId]/findings - add a finding row. */
import { created, serialize } from '@/lib/utils/api-response';
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { addFinding } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const id = numericId((await params).reportId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/findings', method: 'POST' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await addFinding(actor, id, body ?? {}), { message: 'Finding added', status: 201 });
  });
}
