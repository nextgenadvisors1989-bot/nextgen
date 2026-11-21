/** /api/data-management/entries/[id] — GET one record (with its attachments), PUT corrects it, DELETE removes it (employer only). */
import { notFound, ok } from '@/lib/utils/api-response';
import { withDataManagement, readJson } from '@/lib/api/data-management-route';
import { deleteEntry, getEntry, updateEntry } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idOf = async (params: Promise<{ id: string }>) => {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return notFound('Record');
  return withDataManagement(request, { route: '/api/data-management/entries/[id]', method: 'GET' }, async ({ actor, employerId }) => {
    const result = await getEntry(actor.user, employerId, id);
    return ok({ entry: result.entry, company: result.scope.companyName, can: { write: result.scope.canWrite, verify: result.scope.canVerify } });
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return notFound('Record');
  return withDataManagement(request, { route: '/api/data-management/entries/[id]', method: 'PUT' }, async ({ actor, employerId }) => {
    const body = await readJson(request);
    return ok(await updateEntry(actor, employerId ?? (Number(body.employer_id) || null), id, body), { message: 'Record corrected' });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return notFound('Record');
  return withDataManagement(request, { route: '/api/data-management/entries/[id]', method: 'DELETE' }, async ({ actor, employerId }) => {
    await deleteEntry(actor, employerId, id);
    return ok({ id }, { message: 'Record deleted' });
  });
}
