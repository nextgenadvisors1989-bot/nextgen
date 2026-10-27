import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { getErrorLog } from '@/services/audit-log.service';
import { ErrorLogDetail } from '@/components/logs/error-log-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ errorId: string }> }): Promise<Metadata> {
  const { errorId } = await params;
  try {
    const detail = await getErrorLog(Number(errorId));
    return { title: `Error #${errorId}` };
  } catch {
    return { title: 'Error Log' };
  }
}

export default async function ErrorLogDetailPage({ params }: { params: Promise<{ errorId: string }> }) {
  const { errorId } = await params;
  const id = Number(errorId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePanel(['admin', 'super_admin']);
  if (!hasPermission(user.permissions, 'activity_log.read')) notFound();

  let detail;
  try {
    detail = await getErrorLog(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Error #${id}`}
        description="Full capture: message, stack trace, the request that raised it and every other time it fired."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Error Logs', href: '/admin/error-logs' },
          { label: `#${id}` },
        ]}
      />
      <nav className="text-sm text-ink-muted">
        <Link href="/admin/error-logs" className="text-brand-600 hover:underline">← Back to the error queue</Link>
      </nav>
      <ErrorLogDetail
        error={JSON.parse(JSON.stringify(detail.error))}
        similar={JSON.parse(JSON.stringify(detail.similar))}
        canResolve={hasPermission(user.permissions, 'activity_log.update')}
      />
    </div>
  );
}
