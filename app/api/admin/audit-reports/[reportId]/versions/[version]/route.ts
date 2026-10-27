/**
 * GET /api/admin/audit-reports/[reportId]/versions/[version]
 * One revision in full: the stored document body, who wrote it, when, and the
 * PDF that belongs to it. `version=compare&against=n` returns a field-level
 * diff against another revision so an approver can see exactly what changed.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, notFound, ok, parseSearchParams } from '@/lib/utils/api-response';
import * as repo from '@/repositories/audit-report.repository';
import { parseSnapshot } from '@/services/audit-report.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string; version: string }> }) {
  const { reportId, version } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    await requireAdminApi(['audit_report.read']);
    const query = parseSearchParams(request);
    const against = query.get('against');

    if (version === 'compare') {
      const left = Number(against ?? 0);
      const right = Number(query.get('with') ?? 0);
      if (!left || !right) {
        return ok({ error: 'Pass ?against=<version>&with=<version> to compare two revisions' });
      }
      const [a, b] = await Promise.all([repo.findVersion(id, left), repo.findVersion(id, right)]);
      if (!a || !b) return notFound('Report version');

      return ok({
        from: { version: left, created_at: a.created_at, created_by_name: a.created_by_name },
        to: { version: right, created_at: b.created_at, created_by_name: b.created_by_name },
        diff: diffSnapshots(parseSnapshot(a.snapshot_json) as unknown as Record<string, unknown>, parseSnapshot(b.snapshot_json) as unknown as Record<string, unknown>),
      });
    }

    const numeric = Number(version);
    if (!Number.isInteger(numeric) || numeric <= 0) return notFound('Report version');

    const row = await repo.findVersion(id, numeric);
    if (!row) return notFound('Report version');

    return ok({
      version: numeric,
      change_summary: row.change_summary,
      created_at: row.created_at,
      created_by_name: row.created_by_name,
      pdf_file_id: row.pdf_file_id,
      body: parseSnapshot(row.snapshot_json),
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/audit-reports/[reportId]/versions/[version]', method: 'GET' });
  }
}

/** Shallow field-level diff: enough to show what a new revision changed. */
function diffSnapshots(from: Record<string, unknown>, to: Record<string, unknown>) {
  const keys = new Set([...Object.keys(from ?? {}), ...Object.keys(to ?? {})]);
  const changes: { field: string; from: unknown; to: unknown }[] = [];

  for (const key of keys) {
    const before = (from ?? {})[key];
    const after = (to ?? {})[key];
    const beforeJson = JSON.stringify(before ?? null);
    const afterJson = JSON.stringify(after ?? null);
    if (beforeJson === afterJson) continue;

    if (Array.isArray(before) || Array.isArray(after)) {
      changes.push({
        field: key,
        from: Array.isArray(before) ? `${before.length} item(s)` : 'none',
        to: Array.isArray(after) ? `${after.length} item(s)` : 'none',
      });
      continue;
    }
    changes.push({ field: key, from: before ?? null, to: after ?? null });
  }

  return changes;
}
