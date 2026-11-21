/**
 * /api/data-management/entries
 * GET  — records of one register (register, from, to, status, q, page, limit; employer_id for an administrator or auditor).
 * POST — enters a record: { register, entry_date, shift?, remarks?, values: { field: value } }.
 */
import { created, fail, ok } from '@/lib/utils/api-response';
import { withDataManagement, readJson } from '@/lib/api/data-management-route';
import { createEntry, listEntries } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withDataManagement(request, { route: '/api/data-management/entries', method: 'GET' }, async ({ actor, url, employerId }) => {
    const register = url.searchParams.get('register') ?? '';
    if (!register) return fail('Choose a register', 422, { code: 'VALIDATION_FAILED' });
    const result = await listEntries(actor.user, employerId, {
      register, from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined, status: url.searchParams.get('status') ?? undefined,
      q: url.searchParams.get('q') ?? undefined, page: Number(url.searchParams.get('page')) || 1, limit: Number(url.searchParams.get('limit')) || 25,
    });
    const p = result.pagination;
    return ok(result.rows, {
      pagination: { ...p, from: (p.page - 1) * p.limit + 1, to: Math.min(p.page * p.limit, p.total) },
      extra: { company: result.scope.companyName, can: { write: result.scope.canWrite, verify: result.scope.canVerify }, viewer: result.scope.viewer },
    });
  });
}

export async function POST(request: Request) {
  return withDataManagement(request, { route: '/api/data-management/entries', method: 'POST' }, async ({ actor, employerId }) => {
    const body = await readJson(request);
    const result = await createEntry(actor, employerId ?? (Number(body.employer_id) || null), String(body.register ?? ''), body);
    return created(result, 'Record saved');
  });
}
