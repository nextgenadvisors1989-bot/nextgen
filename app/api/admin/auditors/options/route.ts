/**
 * GET /api/admin/auditors/options
 *
 *   ?lookups=true  → auditor types + employers (for the create/edit form)
 *   ?search=…      → lightweight auditor options with live open-assignment counts
 *                    (used by the audit-assignment wizard to warn about workload)
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { auditorLookups, auditorOptions } from '@/services/auditor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdminApi(['auditor.read']);
    const params = parseSearchParams(request);
    const lookupsOnly = params.get('lookups');

    if (lookupsOnly === 'true' || lookupsOnly === '1') {
      const lookups = await auditorLookups();
      return ok(lookups);
    }

    const search = params.get('search') ?? undefined;
    const limitParam = params.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;
    const auditors = await auditorOptions(search, Number.isFinite(limit) ? limit : undefined);

    return ok(
      auditors.map((row) => ({
        id: Number(row.id),
        auditor_code: String(row.auditor_code),
        name: String(row.name),
        email: String(row.email),
        specialization: row.specialization ?? null,
        auditor_type_name: row.auditor_type_name ?? null,
        max_concurrent_audits: Number(row.max_concurrent_audits ?? 5),
        open_assignments: Number(row.open_assignments ?? 0),
      }))
    );
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/auditors/options', method: 'GET', ip: clientIp(request) ?? undefined });
  }
}
