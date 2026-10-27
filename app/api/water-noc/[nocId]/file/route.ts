/** POST /api/water-noc/[nocId]/file - multipart upload (`file`) of the NOC letter; it also becomes the legal-register file. */
import { fail } from '@/lib/utils/api-response';
import { missing, numericId, one, readUploads, withWater } from '@/lib/api/water-route';
import { attachNocFile } from '@/services/water-noc.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ nocId: string }> }) {
  const id = numericId((await params).nocId);
  if (!id) return missing();
  return withWater(request, { route: '/api/water-noc/[nocId]/file', method: 'POST' }, async (_user, actor) => {
    const form = await request.formData().catch(() => null);
    if (!form) return fail('Send the file as multipart/form-data', 400, { code: 'VALIDATION_FAILED' });
    const [file] = await readUploads(form, 'file');
    if (!file) return fail('Choose the NOC letter to upload', 422, { code: 'VALIDATION_FAILED' });
    return one(await attachNocFile(actor, id, file), { message: 'NOC letter attached', status: 201 });
  });
}
