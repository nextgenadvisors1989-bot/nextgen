import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditorForm } from '@/components/auditor/auditor-form';
import { auditorLookups, getAuditorDetail } from '@/services/auditor.service';

export const metadata: Metadata = { title: 'Edit Auditor' };
export const dynamic = 'force-dynamic';

export default async function EditAuditorPage({ params }: { params: Promise<{ auditorId: string }> }) {
  await requireAdminApi(['auditor.update']);
  const { auditorId } = await params;
  const id = Number(auditorId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [detail, lookups] = await Promise.all([getAuditorDetail(id), auditorLookups()]);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${detail.auditor.name}`}
        description={`Auditor ${detail.auditor.auditor_code} · workload ${detail.stats.pending}/${detail.auditor.max_concurrent_audits} open assignments.`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Auditors', href: '/admin/auditors' },
          { label: detail.auditor.auditor_code, href: `/admin/auditors/${id}` },
          { label: 'Edit' },
        ]}
      />
      <AuditorForm mode="edit" auditor={detail.auditor} lookups={lookups} />
    </div>
  );
}
