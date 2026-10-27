/** POST /api/capar/[reportId]/reopen - an administrator reopens an approved report for correction. */
import { ok, serialize } from '@/lib/utils/api-response';
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { reopenReport } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const id = numericId((await params).reportId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/reopen', method: 'POST' }, async (_user, actor) =>
    one(await reopenReport(actor, id), { message: 'Report reopened' })
  );
}
