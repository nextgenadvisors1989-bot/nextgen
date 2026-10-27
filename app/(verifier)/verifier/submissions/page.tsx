import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { SubmissionList } from '@/components/dynamic-renderer/submission-list';
import { actorFromUser, submissionOptions } from '@/services/dynamic-submission.service';

export const metadata: Metadata = { title: 'Module Submissions' };
export const dynamic = 'force-dynamic';

export default async function VerifierSubmissionsPage() {
  const user = await requirePanel(['verifier', 'admin', 'super_admin']);
  const options = await submissionOptions(actorFromUser(user));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Module Submissions"
        description="Dynamic-form submissions whose module requires verification: read every answer, the tables and the attachments, then approve, return for corrections or reject with a score and a note."
        breadcrumbs={[{ label: 'Dashboard', href: '/verifier/dashboard' }, { label: 'Module Submissions' }]}
      />
      <SubmissionList
        endpoint="/api/verifier/submissions"
        basePath="/verifier/submissions"
        stats={options.stats}
        modules={options.modules.map((module) => ({ value: String(module.value), label: module.label }))}
        forms={options.forms.map((form) => ({ value: String(form.value), label: form.label }))}
        statuses={options.statuses}
        permissions={{ review: true, remove: false, download: true }}
        emptyTitle="Nothing waiting for verification"
        emptySubtitle="When an auditor or employer submits a form whose module needs verification it appears here with the answers and the generated PDF."
      />
    </div>
  );
}
