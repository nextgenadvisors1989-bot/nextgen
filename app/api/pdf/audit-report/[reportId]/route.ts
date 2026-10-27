/**
 * GET /api/pdf/audit-report/[reportId]
 *
 * Streams the report PDF. Available to administrators, the assigned verifier,
 * the assigned auditor and the employer's portal users — each scoped to reports
 * they are actually entitled to see. If no PDF has been generated yet (or the
 * body has moved on since the last one) it is generated on demand and stored as
 * the next version of the file, so the download is never stale.
 */
import { requireApiPanel, requireAllPermissions } from '@/lib/auth/permission-check';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { generateAndStorePdf, getReportDetail } from '@/services/audit-report.service';
import { findFile, readFileBytes, registerDownload } from '@/lib/files/file-service';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { clientIp, fail, handleRouteError, notFound, userAgent } from '@/lib/utils/api-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return notFound('Report');

  try {
    const user = await requireApiPanel(['admin', 'super_admin', 'verifier', 'auditor', 'employer']);
    const slugs = user.roles.map((role) => role.slug);
    const isAdmin = slugs.includes('admin') || slugs.includes('super_admin');

    const scope = await queryOne<{ id: number; employer_id: number; auditor_id: number | null; report_number: string; audit_title: string } & RowDataPacket>(
      'SELECT id, employer_id, auditor_id, report_number, audit_title FROM audit_reports WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    if (!scope) return notFound('Report');

    if (isAdmin) {
      await requireAllPermissions(['audit_report.download']);
    } else if (slugs.includes('verifier')) {
      await requireAllPermissions(['verifier.download']);
      const assigned = await queryOne<RowDataPacket>(
        `SELECT 1 AS ok FROM verifier_assignments WHERE report_id = ? AND verifier_id = ? LIMIT 1`,
        [id, user.id]
      );
      if (!assigned && !(await isEmployerOf(user.employerId, scope.employer_id))) {
        return fail('This report is not in your verification queue', 403);
      }
    } else if (slugs.includes('employer')) {
      await requireAllPermissions(['report.download']);
      if (Number(scope.employer_id) !== Number(user.employerId)) {
        return fail('This report belongs to another organisation', 403);
      }
      // Employers only see reports that have cleared verification.
      const status = await queryOne<{ status: string } & RowDataPacket>('SELECT status FROM audit_reports WHERE id = ?', [id]);
      if (!status || !['Approved', 'Archived'].includes(String(status.status))) {
        return fail('This report has not been released yet', 403);
      }
    } else {
      await requireAllPermissions(['audit_report.download']);
      if (Number(scope.auditor_id ?? 0) !== Number(user.auditorId ?? 0)) {
        return fail('This report was filed by another auditor', 403);
      }
    }

    const detail = await getReportDetail(id);
    if (!detail) return notFound('Report');

    // Regenerate when the stored PDF is missing; otherwise serve what was filed.
    let fileId = detail.report.pdf_file_id ? Number(detail.report.pdf_file_id) : null;
    if (!fileId) {
      const generated = await generateAndStorePdf(id, { user, ip: clientIp(request), userAgent: userAgent(request) });
      fileId = generated.fileId;
    }
    if (!fileId) return fail('The report PDF could not be generated', 500);

    const file = await findFile(fileId);
    if (!file) return notFound('Report PDF');

    const buffer = await readFileBytes(file);
    await registerDownload(file, { user, ip: clientIp(request), userAgent: userAgent(request) });

    await writeActivityLog({
      userId: user.id, userName: user.fullName, userRole: user.primaryRole,
      employerId: Number(scope.employer_id), action: 'exported', module: 'audit_report',
      entityType: 'audit_report', entityId: id,
      entityLabel: `${scope.report_number} — ${scope.audit_title}`,
      description: `Report PDF downloaded (${scope.report_number})`,
      ipAddress: clientIp(request),
    });

    const filename = `${String(scope.report_number).replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(buffer.length),
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/pdf/audit-report/[reportId]', method: 'GET' });
  }
}

/** Verifiers occasionally review their own employer's reports; allow that case. */
async function isEmployerOf(userEmployerId: number | null | undefined, reportEmployerId: number): Promise<boolean> {
  return Boolean(userEmployerId) && Number(userEmployerId) === Number(reportEmployerId);
}
