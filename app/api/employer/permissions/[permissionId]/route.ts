/** PUT /api/employer/permissions/[permissionId]  { decision: "Approved" | "Rejected", note? } - decide one pending request of this company. */
import { z } from 'zod';
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok, validationFailed } from '@/lib/utils/api-response';
import { decidePermission } from '@/services/employee-workday.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ decision: z.enum(['Approved', 'Rejected']), note: z.string().trim().max(500).optional().nullable() });

export async function PUT(request: Request, { params }: { params: Promise<{ permissionId: string }> }) {
  try {
    const user = await requireEmployerApi(['attendance.read']);
    const id = Number((await params).permissionId);
    if (!Number.isInteger(id) || id <= 0) return notFound('Permission request');
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationFailed([{ field: 'decision', message: 'Choose approve or reject' }]);
    await decidePermission(Number(user.employerId ?? 0), id, parsed.data.decision, user.id, parsed.data.note ?? null);
    return ok({ data: { id, status: parsed.data.decision } }, { message: `Permission ${parsed.data.decision.toLowerCase()}` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/permissions/[permissionId]', method: 'PUT' });
  }
}
