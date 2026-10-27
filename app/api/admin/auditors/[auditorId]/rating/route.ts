/**
 * PUT /api/admin/auditors/[auditorId]/rating — sets the auditor's 0–5 rating.
 */
import { z } from 'zod';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, notFound, ok, validationFailed } from '@/lib/utils/api-response';
import { rateAuditor } from '@/services/auditor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ratingSchema = z.object({ rating: z.coerce.number().min(0, 'Rating must be 0–5').max(5, 'Rating must be 0–5') });

export async function PUT(request: Request, { params }: { params: Promise<{ auditorId: string }> }) {
  const { auditorId } = await params;
  const id = Number(auditorId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Auditor');

  try {
    const user = await requireAdminApi(['auditor.update']);
    const parsed = ratingSchema.safeParse(await request.json());
    if (!parsed.success) return validationFailed(parsed.error.flatten().fieldErrors);

    const result = await rateAuditor(id, parsed.data.rating, { user, ip: clientIp(request) });
    if (!result) return notFound('Auditor');
    return ok(result, { message: `Auditor rated ${parsed.data.rating}/5` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditors/[auditorId]/rating', method: 'PUT' });
  }
}
