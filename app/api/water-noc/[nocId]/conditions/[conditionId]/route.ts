/**
 * /api/water-noc/[nocId]/conditions/[conditionId]
 * PATCH  - tick the condition (Compliant / Non-Compliant / Not Applicable), add remarks or reword it.
 * DELETE - remove it from the checklist.
 */
import { missing, numericId, one, withWater } from '@/lib/api/water-route';
import { deleteCondition, updateCondition } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ nocId: string; conditionId: string }> };

async function ids({ params }: Ctx) {
  const resolved = await params;
  return { nocId: numericId(resolved.nocId), conditionId: numericId(resolved.conditionId) };
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { nocId, conditionId } = await ids(ctx);
  if (!nocId || !conditionId) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/conditions/[conditionId]', method: 'PATCH' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await updateCondition(actor, nocId, conditionId, body ?? {}), { message: 'Condition saved' });
  });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { nocId, conditionId } = await ids(ctx);
  if (!nocId || !conditionId) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/conditions/[conditionId]', method: 'DELETE' }, async (_user, actor) => {
    await deleteCondition(actor, nocId, conditionId);
    return one({ id: conditionId }, { message: 'Condition removed' });
  });
}
