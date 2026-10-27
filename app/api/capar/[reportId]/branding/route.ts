/**
 * /api/capar/[reportId]/branding - the logo / letterhead printed on this one report.
 * POST   multipart `kind` (logo | letterhead) + `file`: upload an override.
 * DELETE ?kind=logo|letterhead: drop the override and fall back to the company default.
 */
import { fail, ok, serialize } from '@/lib/utils/api-response';
import { missing, numericId, one, readUploads, withCapar } from '@/lib/api/capar-route';
import { setBranding } from '@/services/capar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ reportId: string }> };

function kindOf(value: unknown): 'logo' | 'letterhead' | null {
  return value === 'logo' || value === 'letterhead' ? value : null;
}

export async function POST(request: Request, { params }: Ctx) {
  const id = numericId((await params).reportId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/branding', method: 'POST' }, async (_user, actor) => {
    const form = await request.formData().catch(() => null);
    const kind = kindOf(form?.get('kind'));
    if (!form || !kind) return fail('Say whether this is the logo or the letterhead', 422, { code: 'VALIDATION_FAILED' });
    const [file] = await readUploads(form, 'file');
    if (!file) return fail('Choose an image to upload', 422, { code: 'VALIDATION_FAILED' });
    return one(await setBranding(actor, id, kind, file), { message: `${kind === 'logo' ? 'Logo' : 'Letterhead'} updated` });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const id = numericId((await params).reportId);
  if (!id) return missing();
  return withCapar(request, { route: '/api/capar/[reportId]/branding', method: 'DELETE' }, async (_user, actor) => {
    const kind = kindOf(new URL(request.url).searchParams.get('kind'));
    if (!kind) return fail('Say whether this is the logo or the letterhead', 422, { code: 'VALIDATION_FAILED' });
    await setBranding(actor, id, kind, null);
    return one({ kind }, { message: 'Back to the company default' });
  });
}
