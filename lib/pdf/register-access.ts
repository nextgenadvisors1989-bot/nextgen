/**
 * Access rules shared by the three statutory register downloads.
 *
 * Administrators may read any establishment's register (and must name one); an employer reads only its own and
 * the session wins over any `employer_id` in the URL. Everyone else - auditors, verifiers, employees - is refused.
 */
import { requireApiPanel, requireAllPermissions } from '@/lib/auth/permission-check';
import type { AuthUser } from '@/types/user';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { clientIp } from '@/lib/utils/api-response';

export interface RegisterCaller {
  user: AuthUser;
  isAdmin: boolean;
  /** The establishment the register is about, if it can already be told (employers always; admins when named). */
  employerId: number | null;
}

export async function registerCaller(request: Request, permission = 'payroll.read'): Promise<RegisterCaller> {
  const user = await requireApiPanel(['admin', 'super_admin', 'employer']);
  await requireAllPermissions([permission]);
  const slugs = user.roles.map((role) => role.slug);
  const isAdmin = slugs.includes('admin') || slugs.includes('super_admin');
  if (!isAdmin) return { user, isAdmin, employerId: Number(user.employerId ?? 0) || null };
  const named = Number(new URL(request.url).searchParams.get('employer_id') ?? 0);
  return { user, isAdmin, employerId: Number.isInteger(named) && named > 0 ? named : null };
}

export async function logRegisterDownload(request: Request, caller: RegisterCaller, input: {
  module: string; entityType: string; entityId: number; label: string; employerId: number | null;
}): Promise<void> {
  await writeActivityLog({
    userId: caller.user.id, userName: caller.user.fullName, userRole: caller.user.primaryRole, employerId: input.employerId,
    action: 'exported', module: input.module, entityType: input.entityType, entityId: input.entityId, entityLabel: input.label,
    description: `${input.label} downloaded as PDF`, ipAddress: clientIp(request),
  });
}

export function pdfResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(buffer.length),
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
