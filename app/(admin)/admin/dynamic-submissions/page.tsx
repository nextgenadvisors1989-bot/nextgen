import type { Metadata } from 'next';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { hasPermission } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/ui/breadcrumb';
import { SubmissionList } from '@/components/dynamic-renderer/submission-list';
import { actorFromUser, submissionOptions } from '@/services/dynamic-submission.service';

export const metadata: Metadata = { title: 'Dynamic Submissions' };
export const dynamic = 'force-dynamic';

export default async function DynamicSubmissionsPage() {
  const user = await requireAdminApi(['submission.read']);
  const options = await submissionOptions(actorFromUser(user));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dynamic Submissions"
        description="Every draft, filed form and verification decision from the dynamic module engine, with the answers, tables, files, score and generated PDF."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Dynamic Submissions' }]}
      />
      <SubmissionList
        endpoint="/api/admin/dynamic-submissions"
        basePath="/admin/dynamic-submissions"
        stats={options.stats}
        modules={options.modules.map((module) => ({ value: String(module.value), label: module.label }))}
        forms={options.forms.map((form) => ({ value: String(form.value), label: form.label }))}
        statuses={options.statuses}
        permissions={{
          review: hasPermission(user.permissions, 'submission.approve'),
          remove: hasPermission(user.permissions, 'submission.delete'),
          download: hasPermission(user.permissions, 'submission.download'),
        }}
      />
    </div>
  );
}
