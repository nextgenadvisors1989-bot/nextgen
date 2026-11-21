/** POST /api/data-management/entries/[id]/verify — { decision: 'verify' | 'reject' | 'reopen', note? }; the employer only. */
import { notFound, ok } from '@/lib/utils/api-response';
import { withDataManagement, readJson } from '@/lib/api/data-management-route';
import { verifyEntry } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return notFound('Record');
  return withDataManagement(request, { route: '/api/data-management/entries/[id]/verify', method: 'POST' }, async ({ actor, employerId }) => {
    const result = await verifyEntry(actor, employerId, id, await readJson(request));
    return ok(result, { message: `Record ${result.status}` });
  });
}
