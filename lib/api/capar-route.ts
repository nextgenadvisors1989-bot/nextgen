/**
 * Shared plumbing for the /api/capar routes: every role reaches the same endpoints, so the workspace guard lists all of
 * them and `services/capar.service.ts` narrows what each one may touch.
 */
import { requireApiPanel } from '@/lib/auth/permission-check';
import { clientIp, handleRouteError, notFound, ok } from '@/lib/utils/api-response';
import type { Actor } from '@/services/capar.service';
import type { UploadInput } from '@/lib/files/file-service';
import type { AuthUser } from '@/types/user';

export const CAPAR_PANELS = ['admin', 'super_admin', 'auditor', 'verifier', 'employer'];

export function numericId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function withCapar(
  request: Request,
  context: { route: string; method: string },
  handler: (user: AuthUser, actor: Actor) => Promise<Response>
): Promise<Response> {
  let userId: number | undefined;
  try {
    const user = await requireApiPanel(CAPAR_PANELS);
    userId = user.id;
    return await handler(user, { user, ip: clientIp(request) });
  } catch (error) {
    return handleRouteError(error, { ...context, userId, ip: clientIp(request) ?? undefined });
  }
}

export const missing = () => notFound('CAPAR record');

/** Reads every `files` entry of a multipart body. */
export async function readUploads(form: FormData, field = 'files'): Promise<UploadInput[]> {
  const uploads: UploadInput[] = [];
  for (const entry of form.getAll(field)) {
    if (entry instanceof File) {
      uploads.push({ originalName: entry.name, mimeType: entry.type, data: Buffer.from(await entry.arrayBuffer()) });
    }
  }
  return uploads;
}

/** A single record always travels under `data`, so a field called `status` or `message` can never clash with the envelope. */
export function one<T>(data: T, options: { message?: string; status?: number } = {}) {
  return ok({ data: JSON.parse(JSON.stringify(data)) }, options);
}
