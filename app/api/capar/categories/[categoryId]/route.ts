/**
 * /api/capar/categories/[categoryId]
 * PATCH  - rename, reorder, describe or switch a heading on / off.
 * DELETE - remove it (a heading already used by findings is switched off instead).
 */
import { ok, serialize } from '@/lib/utils/api-response';
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { deleteCategory, updateCategory } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ categoryId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const id = numericId((await params).categoryId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/categories/[categoryId]', method: 'PATCH' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await updateCategory(actor, id, body ?? {}), { message: 'Category saved' });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const id = numericId((await params).categoryId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/categories/[categoryId]', method: 'DELETE' }, async (_user, actor) => {
    const result = await deleteCategory(actor, id);
    return one(result, {
      message: result.removed ? 'Category removed' : `Switched off - ${result.used} finding(s) already use it`,
    });
  });
}
