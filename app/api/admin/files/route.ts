/**
 * GET  /api/admin/files — the document vault with filters, statistics and the
 *      option lists the library screen renders.
 * POST /api/admin/files — multipart upload from the library (requires
 *      `file.create`). Entity attachment screens keep using `/api/files/upload`.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, created, fail, handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { fileListQuerySchema } from '@/lib/validations/file.validation';
import { listFiles, uploadFiles } from '@/services/file.service';
import { ACCESS_LEVELS, ENTITY_TYPES, type AccessLevel, type EntityType, type UploadInput } from '@/lib/files/file-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminApi(['file.read']);
    const filters = fileListQuerySchema.parse(Object.fromEntries(parseSearchParams(request)));
    const result = await listFiles(filters);
    return ok(result.data, {
      pagination: result.pagination,
      extra: {
        stats: result.stats,
        extensions: result.extensions,
        entityBreakdown: result.entityBreakdown,
        categories: result.categories,
        uploaders: result.uploaders,
        entityTypes: ENTITY_TYPES,
        accessLevels: ACCESS_LEVELS,
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/files', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['file.create']);
    const formData = await request.formData();

    const rawFiles = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
    if (!rawFiles.length) return fail('Choose at least one file to upload');

    const entityType = String(formData.get('entityType') ?? 'OTHER').toUpperCase();
    if (!(ENTITY_TYPES as readonly string[]).includes(entityType)) {
      return fail(`Unknown entity type "${entityType}"`, 422, { code: 'VALIDATION_FAILED' });
    }

    const rawAccess = String(formData.get('accessLevel') ?? 'private').toLowerCase();
    if (!(ACCESS_LEVELS as readonly string[]).includes(rawAccess)) {
      return fail(`Unknown access level "${rawAccess}"`, 422, { code: 'VALIDATION_FAILED' });
    }

    const entityIdRaw = formData.get('entityId');
    const entityId = entityIdRaw === null || entityIdRaw === '' ? null : Number(entityIdRaw);

    const uploads: UploadInput[] = [];
    for (const file of rawFiles) {
      uploads.push({ originalName: file.name, mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) });
    }

    const files = await uploadFiles(
      uploads,
      {
        entityType: entityType as EntityType,
        entityId: Number.isFinite(entityId) ? entityId : null,
        category: (formData.get('category') as string | null) || null,
        accessLevel: rawAccess as AccessLevel,
        description: (formData.get('description') as string | null) || null,
        tags: (formData.get('tags') as string | null) || null,
        expiresAt: (formData.get('expiresAt') as string | null) || null,
      },
      { user, ip: clientIp(request) }
    );

    return created(
      { files },
      files.length === 1 ? `${files[0].original_name} added to the vault` : `${files.length} files added to the vault`
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/files', method: 'POST' });
  }
}
