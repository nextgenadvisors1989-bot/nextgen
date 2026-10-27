/**
 * GET  /api/employee/documents — the employee's own document register.
 * POST /api/employee/documents — files a document against the caller's own
 *      record. Accepts either multipart/form-data with a `file` (or `files`)
 *      part, or JSON naming a file already in the vault.
 *
 * A document the employee uploads is shared with their employer: the personal
 * file the employer keeps is the same file, so filing it privately would hide the
 * very paper the checklist asks for.
 */
import { requireEmployeeApi } from '@/lib/auth/api-guards';
import { getScoping } from '@/lib/auth/auth';
import { clientIp, created, fail, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { addMyDocument, listMyDocuments } from '@/services/employee.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireEmployeeApi(['employee.read']);
    const { employeeId } = await getScoping(user.id);
    if (!employeeId) return fail('No employee record is linked to this login', 404, { code: 'NOT_FOUND' });

    const documents = await listMyDocuments(employeeId);
    const rows = documents as unknown as Record<string, unknown>[];
    const stats = {
      total: rows.length,
      verified: rows.filter((row) => Number(row.is_verified ?? 0) === 1).length,
      pending: rows.filter((row) => Number(row.is_verified ?? 0) !== 1).length,
    };
    return ok(documents, { extra: { stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/documents', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireEmployeeApi(['employee.update']);
    const { employeeId } = await getScoping(user.id);
    if (!employeeId) return fail('No employee record is linked to this login', 404, { code: 'NOT_FOUND' });

    const contentType = request.headers.get('content-type') ?? '';
    let body: Record<string, unknown> = {};
    let upload: { originalName: string; mimeType: string; data: Buffer } | null = null;

    if (contentType.includes('multipart/form-data')) {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return fail('The upload could not be read — send the file as multipart/form-data', 400, { code: 'VALIDATION_FAILED' });
      }

      for (const key of ['document_type', 'document_name', 'document_number', 'remarks', 'document_date', 'file_id']) {
        const value = formData.get(key);
        if (value !== null && !(value instanceof File)) body[key] = String(value);
      }

      // The shipped uploader posts `file`; the multi-file control posts `files`.
      const candidate = formData.get('file') ?? formData.getAll('files').find((entry) => entry instanceof File);
      if (candidate instanceof File) {
        upload = {
          originalName: candidate.name,
          mimeType: candidate.type || 'application/octet-stream',
          data: Buffer.from(await candidate.arrayBuffer()),
        };
      }
    } else {
      body = ((await request.json().catch(() => ({}))) as Record<string, unknown>) ?? {};
    }

    const result = await addMyDocument(employeeId, body, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    }, upload);
    if (!result) return fail('Your employee record could not be found', 404, { code: 'NOT_FOUND' });

    return created(result, 'Document uploaded successfully');
  } catch (error) {
    return handleRouteError(error, { route: '/api/employee/documents', method: 'POST' });
  }
}
