/**
 * One dispatcher for the document-pack API; every role reaches it and `services/evidence.service.ts` narrows what each may touch.
 *
 *   GET    /api/evidence/template                                   (admin) sections with items
 *   POST   /api/evidence/template/sections | /items                 (admin) add
 *   PUT    /api/evidence/template/sections/:id | /items/:id         (admin) edit
 *   DELETE /api/evidence/template/sections/:id | /items/:id         (admin) remove
 *   GET    /api/evidence/access                                     (admin) auditors with the number of sections each has
 *   GET    /api/evidence/access/:auditorId                          (admin) the sections, ticked where granted
 *   PUT    /api/evidence/access/:auditorId                          (admin) { section_ids: [] }
 *   GET    /api/evidence/auditor/employers                          (auditor, admin) companies with their latest submission
 *   GET    /api/evidence/employers/:employerId                      the checklist ("me" = the signed-in employer's own company)
 *   PUT    /api/evidence/employers/:employerId/items/:itemId        status, reference, validity, notes
 *   POST   /api/evidence/employers/:employerId/items/:itemId/files  multipart `files`
 *   DELETE /api/evidence/employers/:employerId/items/:itemId/files/:fileId
 *   POST   /api/evidence/employers/:employerId/submit               { note? } freezes a dated submission
 *   GET    /api/evidence/employers/:employerId/submissions
 */
import { requireApiPanel, requireAllPermissions } from '@/lib/auth/permission-check';
import { clientIp, fail, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import { readUploads, numericId, one } from '@/lib/api/capar-route';
import * as evidence from '@/services/evidence.service';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function handleEvidence(request: Request, segments: string[], method: Method): Promise<Response> {
  const route = `/api/evidence/${segments.join('/')}`;
  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'auditor', 'employer']);
    const [a, b, c, d, e, f] = segments;
    const isUpload = method === 'POST' && e === 'files';
    await requireAllPermissions([isUpload ? 'evidence.upload' : method === 'GET' ? 'evidence.read' : method === 'POST' ? 'evidence.create' : method === 'PUT' ? 'evidence.update' : 'evidence.delete']);
    const actor: evidence.EvidenceActor = { user, role: evidence.evidenceRoleOf(user), ip: clientIp(request) };
    const body = async () => request.json().catch(() => ({}));

    if (a === 'template') {
      if (method === 'GET' && !b) return ok({ data: await evidence.listTemplate(actor) });
      const id = numericId(c ?? '');
      if (b === 'sections') {
        if (method === 'POST' && !c) return ok({ data: await evidence.createSection(actor, await body()) }, { status: 201, message: 'Section added' });
        if (id && method === 'PUT') return ok({ data: await evidence.updateSection(actor, id, await body()) }, { message: 'Saved' });
        if (id && method === 'DELETE') return ok({ data: await evidence.deleteSection(actor, id) }, { message: 'Removed' });
      }
      if (b === 'items') {
        if (method === 'POST' && !c) return ok({ data: await evidence.createItem(actor, await body()) }, { status: 201, message: 'Document added' });
        if (id && method === 'PUT') return ok({ data: await evidence.updateItem(actor, id, await body()) }, { message: 'Saved' });
        if (id && method === 'DELETE') return ok({ data: await evidence.deleteItem(actor, id) }, { message: 'Removed' });
      }
    }

    if (a === 'access') {
      if (method === 'GET' && !b) return ok({ data: await evidence.listAccess(actor) });
      const auditorId = numericId(b ?? '');
      if (auditorId && method === 'GET') return ok({ data: await evidence.getAccess(actor, auditorId) });
      if (auditorId && method === 'PUT') return ok({ data: await evidence.setAccess(actor, auditorId, await body()) }, { message: 'Access saved' });
    }

    if (a === 'auditor' && b === 'employers' && method === 'GET') return one(await evidence.auditorEmployers(actor));

    if (a === 'employers') {
      const employerId = b === 'me' ? Number(user.employerId ?? 0) || null : numericId(b ?? '');
      if (!employerId) return notFound('Company');
      if (method === 'GET' && !c) return one(await evidence.getChecklist(actor, employerId));
      if (c === 'submit' && method === 'POST') return one(await evidence.submitPack(actor, employerId, await body()), { message: 'Pack submitted', status: 201 });
      if (c === 'submissions' && method === 'GET') return one(await evidence.listSubmissions(actor, employerId));
      if (c === 'items') {
        const itemId = numericId(d ?? '');
        if (!itemId) return notFound('Document');
        if (!e && method === 'PUT') return one(await evidence.saveItem(actor, employerId, itemId, await body()), { message: 'Saved' });
        if (e === 'files' && method === 'POST') {
          let form: FormData;
          try { form = await request.formData(); } catch { return fail('Send the files as multipart/form-data', 400, { code: 'VALIDATION_FAILED' }); }
          const saved = await evidence.attachFiles(actor, employerId, itemId, await readUploads(form));
          return one({ files: saved }, { message: saved.length === 1 ? 'File attached' : `${saved.length} files attached`, status: 201 });
        }
        const fileId = numericId(f ?? '');
        if (e === 'files' && fileId && method === 'DELETE') return one(await evidence.removeFile(actor, employerId, itemId, fileId), { message: 'File removed' });
      }
    }
    return notFound('Resource');
  } catch (error) {
    return handleRouteError(error, { route, method });
  }
}
