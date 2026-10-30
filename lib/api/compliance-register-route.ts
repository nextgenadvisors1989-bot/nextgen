/**
 * One dispatcher for Audit and Assessment, and Act & Compliance. An administrator changes it; an auditor only reads (the service enforces this).
 *
 *   GET    /api/compliance-register/types                       the audit types (Audit and Assessment)
 *   POST   /api/compliance-register/types                       { name }
 *   PUT    /api/compliance-register/types/:id                   { name, status? }
 *   DELETE /api/compliance-register/types/:id
 *   GET    /api/compliance-register/rows                        the Act & Compliance table with the records of every row
 *   POST   /api/compliance-register/rows                        { act_name, chapter, section, sub_section, amendments, explain_text }
 *   PUT    /api/compliance-register/rows/:id
 *   DELETE /api/compliance-register/rows/:id
 *   POST   /api/compliance-register/rows/:id/records            JSON or multipart: kind, title, content, optional Word file
 *   PUT    /api/compliance-register/records/:id                 { title, content }
 *   DELETE /api/compliance-register/records/:id
 */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { clientIp, fail, handleRouteError, notFound } from '@/lib/utils/api-response';
import { readUploads, numericId, one } from '@/lib/api/capar-route';
import * as register from '@/services/compliance-register.service';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function handleComplianceRegister(request: Request, segments: string[], method: Method): Promise<Response> {
  const route = `/api/compliance-register/${segments.join('/')}`;
  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'auditor']);
    const actor: register.RegisterActor = { user, role: register.registerRoleOf(user), ip: clientIp(request) };
    const [a, b, c] = segments;
    const id = numericId(b ?? '');
    const body = async () => request.json().catch(() => ({}));

    if (a === 'types') {
      if (!b && method === 'GET') return one(await register.listTypes(actor));
      if (!b && method === 'POST') return one(await register.createType(actor, await body()), { status: 201, message: 'Audit type added' });
      if (id && !c && method === 'PUT') return one(await register.updateType(actor, id, await body()), { message: 'Saved' });
      if (id && !c && method === 'DELETE') return one(await register.deleteType(actor, id), { message: 'Removed' });
    }
    if (a === 'rows') {
      if (!b && method === 'GET') return one(await register.listRows(actor));
      if (!b && method === 'POST') return one(await register.createRow(actor, await body()), { status: 201, message: 'Saved' });
      if (id && !c && method === 'PUT') return one(await register.updateRow(actor, id, await body()), { message: 'Saved' });
      if (id && !c && method === 'DELETE') return one(await register.deleteRow(actor, id), { message: 'Row removed' });
      if (id && c === 'records' && method === 'POST') {
        if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
          let form: FormData;
          try { form = await request.formData(); } catch { return fail('Send the record as multipart/form-data', 400, { code: 'VALIDATION_FAILED' }); }
          return one(await register.addRecord(actor, id, form.get('kind'), { title: form.get('title'), content: form.get('content') }, await readUploads(form)), { status: 201, message: 'Saved' });
        }
        const json = (await body()) as { kind?: unknown; title?: unknown; content?: unknown };
        return one(await register.addRecord(actor, id, json.kind, { title: json.title, content: json.content }), { status: 201, message: 'Saved' });
      }
    }
    if (a === 'records' && id) {
      if (method === 'PUT') return one(await register.updateRecord(actor, id, await body()), { message: 'Saved' });
      if (method === 'DELETE') return one(await register.deleteDocument(actor, id), { message: 'Removed' });
    }
    return notFound('Resource');
  } catch (error) {
    return handleRouteError(error, { route, method });
  }
}
