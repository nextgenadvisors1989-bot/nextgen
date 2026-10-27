import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditorDetailView } from '@/components/auditor/auditor-detail';
import { getAuditorDetail } from '@/services/auditor.service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ auditorId: string }> }): Promise<Metadata> {
  const { auditorId } = await params;
  const detail = await getAuditorDetail(Number(auditorId));
  return { title: detail ? detail.auditor.name : 'Auditor' };
}

export default async function AuditorDetailPage({ params }: { params: Promise<{ auditorId: string }> }) {
  const user = await requireAdminApi(['auditor.read']);
  const { auditorId } = await params;
  const id = Number(auditorId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const detail = await getAuditorDetail(id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.auditor.name}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Auditors', href: '/admin/auditors' },
          { label: detail.auditor.auditor_code },
        ]}
      />
      <AuditorDetailView
        detail={detail}
        permissions={{
          update: hasPermission(user.permissions, 'auditor.update'),
          remove: hasPermission(user.permissions, 'auditor.delete'),
          provisionLogin: hasPermission(user.permissions, 'auditor.update'),
        }}
      />
    </div>
  );
}
