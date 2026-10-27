/**
 * /api/capar/[reportId]/findings/[findingId]
 * PATCH  - change any part of the row (requirement, finding, root cause, action plan, timeline, status ...).
 * DELETE - remove the row.
 */
import { ok, serialize } from '@/lib/utils/api-response';
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { deleteFinding, updateFinding } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ reportId: string; findingId: string }> };

async function ids({ params }: Ctx) {
  const resolved = await params;
  return { reportId: numericId(resolved.reportId), findingId: numericId(resolved.findingId) };
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { reportId, findingId } = await ids(ctx);
  if (!reportId || !findingId) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/findings/[findingId]', method: 'PATCH' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await updateFinding(actor, reportId, findingId, body ?? {}), { message: 'Finding saved' });
  });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { reportId, findingId } = await ids(ctx);
  if (!reportId || !findingId) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/findings/[findingId]', method: 'DELETE' }, async (_user, actor) => {
    await deleteFinding(actor, reportId, findingId);
    return one({ id: findingId }, { message: 'Finding removed' });
  });
}
