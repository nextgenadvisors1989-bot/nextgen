/**
 * /api/capar/[reportId]
 * GET    - the report with its findings, files, review history and what the caller may do next.
 * PATCH  - header details (facility, representative, audit date, closing meeting ...).
 * DELETE - discard a draft.
 */
import { ok, serialize } from '@/lib/utils/api-response';
import { missing, numericId, one, withCapar } from '@/lib/api/capar-route';
import { deleteReport, getReportDetail, updateReport } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const id = numericId((await params).reportId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]', method: 'GET' }, async (user) =>
    one(await getReportDetail(user, id))
  );
}

export async function PATCH(request: Request, { params }: Ctx) {
  const id = numericId((await params).reportId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]', method: 'PATCH' }, async (_user, actor) => {
    const body = await request.json().catch(() => ({}));
    return one(await updateReport(actor, id, body ?? {}), { message: 'Report saved' });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const id = numericId((await params).reportId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]', method: 'DELETE' }, async (_user, actor) => {
    await deleteReport(actor, id);
    return one({ id }, { message: 'Draft deleted' });
  });
}
