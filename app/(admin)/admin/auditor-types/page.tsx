import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditorTypesPanel } from '@/components/auditor/auditor-types-panel';

export const metadata: Metadata = { title: 'Auditor Types' };
export const dynamic = 'force-dynamic';

export default async function AuditorTypesPage() {
  const user = await requireAdminApi(['auditor_type.read']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditor Types"
        description="Classification of auditor accreditation — safety, water, food safety, environmental, electrical, social compliance, quality and fire safety."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Auditors', href: '/admin/auditors' },
          { label: 'Auditor Types' },
        ]}
      />
      <AuditorTypesPanel
        permissions={{
          create: hasPermission(user.permissions, 'auditor_type.create'),
          update: hasPermission(user.permissions, 'auditor_type.update'),
          remove: hasPermission(user.permissions, 'auditor_type.delete'),
        }}
      />
    </div>
  );
}
