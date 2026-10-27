/**
 * POST /api/files/upload — multipart upload into the document vault.
 *
 * Field names follow the shipped uploaders: `files` (one or many), `entityType`,
 * `entityId`, `category`, plus optional `accessLevel`, `description`, `tags`.
 * The response is the `{ success, files[] }` envelope the drag-and-drop
 * components read, each entry carrying a ready-to-use download URL.
 */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { clientIp, fail, handleRouteError, ok } from '@/lib/utils/api-response';
import {
  ACCESS_LEVELS, saveUploads,
  type AccessLevel, type EntityType, type UploadInput,
} from '@/lib/files/file-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  let userId: number | undefined;
  let body: Record<string, unknown> = {};

  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'employer', 'employee', 'auditor', 'verifier']);
    userId = user.id;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return fail('The upload could not be read — send the files as multipart/form-data', 400, {
        code: 'VALIDATION_FAILED',
      });
    }
    const rawFiles = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
    if (!rawFiles.length) return fail('Choose at least one file to upload');

    const entityType = String(formData.get('entityType') ?? 'OTHER').toUpperCase() as EntityType;
    body = { entityType, entityId: formData.get('entityId'), category: formData.get('category') };

    const rawAccess = String(formData.get('accessLevel') ?? 'private').toLowerCase();
    const accessLevel = (ACCESS_LEVELS as readonly string[]).includes(rawAccess)
      ? (rawAccess as AccessLevel)
      : 'private';

    const entityIdRaw = formData.get('entityId');
    const entityId = entityIdRaw === null || entityIdRaw === '' ? null : Number(entityIdRaw);

    const uploads: UploadInput[] = [];
    for (const file of rawFiles) {
      uploads.push({
        originalName: file.name,
        mimeType: file.type,
        data: Buffer.from(await file.arrayBuffer()),
      });
    }

    const files = await saveUploads(
      uploads,
      {
        entityType,
        entityId: Number.isFinite(entityId) ? entityId : null,
        category: (formData.get('category') as string | null) || null,
        accessLevel,
        description: (formData.get('description') as string | null) || null,
        tags: (formData.get('tags') as string | null) || null,
      },
      { user, ip: clientIp(request) }
    );

    return ok(
      { files },
      { status: 201, message: files.length === 1 ? 'File uploaded successfully' : `${files.length} files uploaded successfully` }
    );
  } catch (error) {
    return handleRouteError(error, {
      route: '/api/files/upload', method: 'POST', body, userId, ip: clientIp(request) ?? undefined,
    });
  }
}
