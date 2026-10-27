/**
 * POST /api/admin/settings/company/upload-logo — uploads the platform logo, or (with kind=letterhead) the letterhead banner
 * printed at the top of CAPAR reports.
 *
 * The file goes into the document vault (so it is versioned, audited and
 * access-controlled like everything else) and the resulting URL is written into
 * the `company.logo_path` setting, which is what the PDF letterhead and the
 * public site read.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, fail, handleRouteError, ok } from '@/lib/utils/api-response';
import { saveUploads, type UploadInput } from '@/lib/files/file-service';
import { settingsForGroup, upsertSetting } from '@/repositories/setting.repository';
import { writeActivityLog } from '@/lib/logger/activity-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];

export async function POST(request: Request) {
  try {
    const user = await requireAdminApi(['settings.update']);
    const formData = await request.formData();
    const file = formData.get('file');
    const kind = formData.get('kind') === 'letterhead' ? 'letterhead' : 'logo';
    const noun = kind === 'letterhead' ? 'letterhead' : 'logo';
    if (!(file instanceof File)) return fail('Choose an image file to upload', 400, { code: 'VALIDATION_FAILED' });
    // A letterhead is drawn straight into PDFs, which can embed PNG and JPEG only.
    const allowed = kind === 'letterhead' ? ['image/png', 'image/jpeg'] : ALLOWED;
    if (!allowed.includes(file.type)) {
      return fail(kind === 'letterhead' ? 'The letterhead must be a PNG or JPEG image' : 'The logo must be a PNG, JPEG, WebP or SVG image', 422, { code: 'VALIDATION_FAILED' });
    }
    if (file.size > 2 * 1024 * 1024) {
      return fail(`The ${noun} must be smaller than 2 MB`, 422, { code: 'VALIDATION_FAILED' });
    }

    const upload: UploadInput = {
      originalName: file.name,
      mimeType: file.type,
      data: Buffer.from(await file.arrayBuffer()),
    };

    // The logo lives in the vault like every other byte the platform stores, so
    // it is versioned, audited and downloadable through the same access rules.
    const [stored] = await saveUploads(
      [upload],
      {
        entityType: 'OTHER',
        entityId: null,
        category: 'Branding',
        accessLevel: 'public',
        description: kind === 'letterhead' ? 'Letterhead banner printed at the top of CAPAR reports' : 'Platform logo used on PDF letterheads, emails and the public site',
        tags: `${noun}, branding, settings`,
      },
      { user, ip: clientIp(request) }
    );

    const rows = await settingsForGroup('company');
    const settingKey = kind === 'letterhead' ? 'letterhead_path' : 'logo_path';
    const existing = rows.find((row) => String(row.setting_key) === settingKey);
    await upsertSetting({
      group: 'company',
      key: settingKey,
      value: stored.url,
      isEncrypted: false,
      label: kind === 'letterhead' ? 'Letterhead' : 'Logo',
      description: kind === 'letterhead' ? 'Vault URL of the letterhead banner printed at the top of CAPAR reports' : 'Vault URL of the uploaded logo, used on PDF letterheads and the public site',
      userId: user.id,
    });

    await writeActivityLog({
      userId: user.id,
      userName: user.fullName,
      userRole: user.primaryRole,
      action: 'updated',
      module: 'settings',
      entityType: 'settings',
      entityLabel: kind === 'letterhead' ? 'Company letterhead' : 'Company logo',
      description: `Company ${noun} replaced with ${file.name} (${(file.size / 1024).toFixed(0)} kB)`,
      oldValues: { [settingKey]: existing?.setting_value ?? null },
      newValues: { [settingKey]: stored.url },
      ipAddress: clientIp(request),
    });

    return ok(
      { path: stored.url, fileId: stored.id, name: stored.original_name, sizeBytes: stored.size_bytes },
      { message: kind === 'letterhead' ? `${file.name} is now the CAPAR letterhead` : `${file.name} is now the platform logo` }
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/settings/company/upload-logo', method: 'POST' });
  }
}
