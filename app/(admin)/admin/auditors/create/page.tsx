import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditorForm } from '@/components/auditor/auditor-form';
import { auditorLookups } from '@/services/auditor.service';

export const metadata: Metadata = { title: 'Register Auditor' };
export const dynamic = 'force-dynamic';

export default async function CreateAuditorPage() {
  const user = await requireAdminApi(['auditor.create']);
  const lookups = await auditorLookups();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Register Auditor"
        description="Auditor codes are generated automatically as AUDT/<year>/<serial>. Optionally issue an auditor-portal login in the same step."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Auditors', href: '/admin/auditors' },
          { label: 'Register Auditor' },
        ]}
      />
      <AuditorForm
        mode="create"
        lookups={lookups}
        canProvisionLogin={hasPermission(user.permissions, 'auditor.update')}
      />
    </div>
  );
}
