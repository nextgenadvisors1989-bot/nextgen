/**
 * /api/capar/categories
 * GET  - the headings findings are grouped under (admin may ask for inactive ones too with ?all=1).
 * POST - admin adds a heading.
 */
import { created, ok, serialize } from '@/lib/utils/api-response';
import { one, withCapar } from '@/lib/api/capar-route';
import { createCategory, listCategories } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withCapar(request, { route: '/api/capar/categories', method: 'GET' }, async (user) => {
    const all = new URL(request.url).searchParams.get('all') === '1';
    return ok(serialize(await listCategories(user, all)));
  });
}

export async function POST(request: Request) {
  return withCapar(request, { route: '/api/capar/categories', method: 'POST' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await createCategory(actor, body ?? {}), { message: 'Category added', status: 201 });
  });
}
