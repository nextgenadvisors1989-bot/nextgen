/**
 * One dispatcher for the Designation Master API of both panels.
 *
 *   GET    /api/<panel>/designations                list (search, industry, level, department, status, scope, page, limit)
 *   GET    /api/<panel>/designations/lookups        industries, levels, departments, statutory categories
 *   GET    /api/<panel>/designations/picker         every active designation the caller can pick (employee form)
 *   GET    /api/<panel>/designations/:id
 *   POST   /api/<panel>/designations                create (an employer's rows are always its own)
 *   PUT    /api/<panel>/designations/:id            update
 *   DELETE /api/<panel>/designations/:id            delete (refused while employees use it)
 *
 * `admin` sees and edits everything; `employer` sees the shared master read-only plus its own rows, which it can create, edit and delete.
 */
import { requireAdminApi, requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import * as designations from '@/services/designation.service';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function handleDesignations(request: Request, segments: string[], method: Method, panel: 'admin' | 'employer'): Promise<Response> {
  const route = `/api/${panel}/designations/${segments.join('/')}`;
  try {
    const permission = method === 'GET' ? 'designation.read' : method === 'POST' ? 'designation.create' : method === 'PUT' ? 'designation.update' : 'designation.delete';
    const user = panel === 'admin' ? await requireAdminApi([permission]) : await requireEmployerApi([permission]);
    const actor = { userId: user.id, isAdmin: panel === 'admin', employerId: panel === 'employer' ? Number(user.employerId ?? 0) || null : null };
    const [first] = segments;
    const id = Number(first);
    const hasId = Number.isInteger(id) && id > 0;

    if (method === 'GET') {
      if (!first) {
        const result = await designations.listDesignations(Object.fromEntries(new URL(request.url).searchParams), actor);
        return ok(result.rows, { pagination: result.pagination });
      }
      if (first === 'lookups') return ok({ data: await designations.designationLookups(actor) });
      if (first === 'picker') return ok(await designations.designationPicker(actor));
      if (hasId) return ok({ data: await designations.getDesignation(id, actor) });
    } else if (method === 'POST' && !first) {
      const payload = await request.json().catch(() => ({}));
      return ok({ data: await designations.createDesignation(payload, actor) }, { status: 201, message: 'Designation added' });
    } else if (method === 'PUT' && hasId) {
      const payload = await request.json().catch(() => ({}));
      return ok({ data: await designations.updateDesignation(id, payload, actor) }, { message: 'Designation updated' });
    } else if (method === 'DELETE' && hasId) {
      await designations.deleteDesignation(id, actor);
      return ok({ data: { id } }, { message: 'Designation deleted' });
    }
    return notFound('Designation resource');
  } catch (error) {
    return handleRouteError(error, { route, method });
  }
}
