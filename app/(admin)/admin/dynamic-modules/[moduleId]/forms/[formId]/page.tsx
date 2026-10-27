import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { FormBuilder } from '@/components/dynamic-builder/form-builder';
import { getFormDetail, getModuleDetail } from '@/services/dynamic-module.service';

export const metadata: Metadata = { title: 'Form Builder' };
export const dynamic = 'force-dynamic';

export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ moduleId: string; formId: string }>;
}) {
  const { moduleId, formId } = await params;
  const moduleKey = Number(moduleId);
  const formKey = Number(formId);
  if (!Number.isInteger(moduleKey) || moduleKey <= 0 || !Number.isInteger(formKey) || formKey <= 0) notFound();

  const user = await requireAdminApi(['form.read']);
  const [detail, moduleDetail] = await Promise.all([
    getFormDetail(formKey).catch(() => null),
    getModuleDetail(moduleKey).catch(() => null),
  ]);
  if (!detail || !moduleDetail || Number(detail.form.module_id) !== moduleKey) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Builder — ${String(detail.form.name)}`}
        description="Sections, fields, dropdown values, conditional logic, formulas, tables, scoring and preview. Save writes the whole structure in one request; publish promotes it to the live version."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Dynamic Modules', href: '/admin/dynamic-modules' },
          { label: String(moduleDetail.module.name), href: `/admin/dynamic-modules/${moduleKey}` },
          { label: String(detail.form.name) },
        ]}
      />
      <FormBuilder
        moduleId={moduleKey}
        formId={formKey}
        form={detail.form as unknown as Record<string, unknown>}
        structure={detail.structure as unknown as Record<string, unknown>}
        counts={detail.counts}
        permissions={{
          update: hasPermission(user.permissions, 'form.update'),
          publish: hasPermission(user.permissions, 'form.update'),
          create: hasPermission(user.permissions, 'form.create'),
        }}
      />
    </div>
  );
}
