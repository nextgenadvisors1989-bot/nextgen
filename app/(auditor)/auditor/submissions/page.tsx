import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { SubmissionList } from '@/components/dynamic-renderer/submission-list';
import { actorFromUser, submissionOptions } from '@/services/dynamic-submission.service';

export const metadata: Metadata = { title: 'My Submissions' };
export const dynamic = 'force-dynamic';

export default async function AuditorSubmissionsPage() {
  const user = await requirePanel(['auditor', 'admin', 'super_admin']);
  const options = await submissionOptions(actorFromUser(user));

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Submissions"
        description="Every dynamic form you have started or filed, with its score, the verification decision and the generated PDF."
        breadcrumbs={[
          { label: 'Dashboard', href: '/auditor/dashboard' },
          { label: 'Assigned Modules', href: '/auditor/modules' },
          { label: 'My Submissions' },
        ]}
      />
      <SubmissionList
        endpoint="/api/auditor/submissions"
        basePath="/auditor/submissions"
        stats={options.stats}
        modules={options.modules.map((module) => ({ value: String(module.value), label: module.label }))}
        forms={options.forms.map((form) => ({ value: String(form.value), label: form.label }))}
        statuses={options.statuses}
        permissions={{ review: false, remove: false, download: true }}
        emptyTitle="You have not started any form yet"
        emptySubtitle="Open one of your assigned modules, pick a form and start filling it in — drafts save automatically."
      />
    </div>
  );
}
