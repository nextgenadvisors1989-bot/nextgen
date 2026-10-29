/**
 * One dispatcher for Act & Compliance by audit type. An administrator changes it; an auditor only reads (the service enforces this).
 *
 *   GET    /api/compliance-register/types                       the audit types with their counts
 *   POST   /api/compliance-register/types                       { name }
 *   GET    /api/compliance-register/types/:id                   the rows (Act / Chapter / Section ...) with their register documents
 *   PUT    /api/compliance-register/types/:id                   { name, status? }
 *   DELETE /api/compliance-register/types/:id
 *   POST   /api/compliance-register/types/:id/rows              { act_name, chapter, section, sub_section, amendments, explain_text }
 *   PUT    /api/compliance-register/rows/:id
 *   DELETE /api/compliance-register/rows/:id
 *   POST   /api/compliance-register/rows/:id/documents          multipart: kind (Forms | Returns | Statement/Declaration), title?, files (Word)
 *   DELETE /api/compliance-register/documents/:id
 *   GET    /api/compliance-register/documents                   every Word file in the register
 */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
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
      if (id && !c && method === 'GET') return one(await register.getType(actor, id));
      if (id && !c && method === 'PUT') return one(await register.updateType(actor, id, await body()), { message: 'Saved' });
      if (id && !c && method === 'DELETE') return one(await register.deleteType(actor, id), { message: 'Removed' });
      if (id && c === 'rows' && method === 'POST') return one(await register.createRow(actor, id, await body()), { status: 201, message: 'Saved' });
    }
    if (a === 'rows' && id) {
      if (!c && method === 'PUT') return one(await register.updateRow(actor, id, await body()), { message: 'Saved' });
      if (!c && method === 'DELETE') return one(await register.deleteRow(actor, id), { message: 'Row removed' });
      if (c === 'documents' && method === 'POST') {
        let form: FormData;
        try { form = await request.formData(); } catch { return fail('Send the file as multipart/form-data', 400, { code: 'VALIDATION_FAILED' }); }
        const result = await register.addDocuments(actor, id, form.get('kind'), form.get('title'), await readUploads(form));
        return one(result, { status: 201, message: result.files === 1 ? 'Document added' : `${result.files} documents added` });
      }
    }
    if (a === 'documents') {
      if (!b && method === 'GET') return one(await register.listDocuments(actor));
      if (id && method === 'DELETE') return one(await register.deleteDocument(actor, id), { message: 'Document removed' });
    }
    return notFound('Resource');
  } catch (error) {
    return handleRouteError(error, { route, method });
  }
}
