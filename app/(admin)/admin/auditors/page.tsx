import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditorsTable } from '@/components/auditor/auditors-table';
import { auditorLookups } from '@/services/auditor.service';

export const metadata: Metadata = { title: 'Auditors' };
export const dynamic = 'force-dynamic';

export default async function AuditorsPage() {
  const user = await requireAdminApi(['auditor.read']);
  const lookups = await auditorLookups();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditors"
        description="Auditor register with accreditation types, workload against capacity, ratings and portal-login status."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Auditors' }]}
      />
      <AuditorsTable
        auditorTypes={lookups.auditorTypes.map((type) => ({ value: String(type.id), label: `${type.name} (${type.code})` }))}
        employers={lookups.employers.map((employer) => ({ value: String(employer.id), label: employer.company_name }))}
        permissions={{
          create: hasPermission(user.permissions, 'auditor.create'),
          update: hasPermission(user.permissions, 'auditor.update'),
          remove: hasPermission(user.permissions, 'auditor.delete'),
        }}
      />
    </div>
  );
}
