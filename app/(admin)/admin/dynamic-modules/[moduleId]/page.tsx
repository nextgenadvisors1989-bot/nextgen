import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ModuleEditor } from '@/components/dynamic-admin/module-editor';
import { assignableUsers, getModuleDetail, roleOptions } from '@/services/dynamic-module.service';

export const metadata: Metadata = { title: 'Module Detail' };
export const dynamic = 'force-dynamic';

export default async function DynamicModuleDetailPage({ params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await params;
  const id = Number(moduleId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requireAdminApi(['module.read']);
  const [detail, roles, users] = await Promise.all([
    getModuleDetail(id).catch(() => null),
    roleOptions(),
    assignableUsers(),
  ]);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={String(detail.module.name)}
        description={String(detail.module.description ?? 'Module settings, forms, builder and access control.')}
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Dynamic Modules', href: '/admin/dynamic-modules' },
          { label: String(detail.module.name) },
        ]}
      />
      <ModuleEditor
        detail={{
          module: detail.module as unknown as Record<string, unknown>,
          forms: detail.forms as unknown as Record<string, unknown>[],
          roleAssignments: detail.roleAssignments as unknown as Record<string, unknown>[],
          userAssignments: detail.userAssignments as unknown as Record<string, unknown>[],
          stats: detail.stats,
        }}
        roleOptions={roles}
        userOptions={users}
        permissions={{
          update: hasPermission(user.permissions, 'module.update'),
          create: hasPermission(user.permissions, 'module.create'),
          remove: hasPermission(user.permissions, 'module.delete'),
          publish: hasPermission(user.permissions, 'module.update'),
        }}
      />
    </div>
  );
}
