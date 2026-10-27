import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ModuleTable } from '@/components/dynamic-admin/module-table';
import { moduleRegister, roleOptions } from '@/services/dynamic-module.service';

export const metadata: Metadata = { title: 'Dynamic Modules' };
export const dynamic = 'force-dynamic';

export default async function DynamicModulesPage() {
  const user = await requireAdminApi(['module.read']);
  const [register, roles] = await Promise.all([moduleRegister(), roleOptions()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dynamic Modules"
        description="Audits, assessments, risk reports, studies, work permits and custom forms are all built here — module settings, forms, fields, tables, rules and scoring — then published to the panels that use them."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Dynamic Modules' }]}
      />
      <ModuleTable
        stats={register.stats}
        roleOptions={roles}
        permissions={{
          create: hasPermission(user.permissions, 'module.create'),
          update: hasPermission(user.permissions, 'module.update'),
          remove: hasPermission(user.permissions, 'module.delete'),
        }}
      />
    </div>
  );
}
