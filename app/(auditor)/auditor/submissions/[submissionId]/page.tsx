import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { SubmissionRecord, type SubmissionWorkspacePayload } from '@/components/dynamic-renderer/submission-record';
import { actorFromUser, submissionWorkspace } from '@/services/dynamic-submission.service';

export const metadata: Metadata = { title: 'Submission' };
export const dynamic = 'force-dynamic';

export default async function AuditorSubmissionPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePanel(['auditor', 'admin', 'super_admin']);
  const workspace = await submissionWorkspace(id, actorFromUser(user)).catch(() => null);
  if (!workspace) notFound();

  const payload = JSON.parse(JSON.stringify(workspace)) as SubmissionWorkspacePayload;
  const fillMode = workspace.permissions.canEdit;

  return (
    <div className="space-y-6">
      <PageHeader
        title={String(workspace.submission.submission_number)}
        description={
          fillMode
            ? 'Fill the form — your answers save automatically every three seconds. Submit when the checklist is green and the verifier is notified with the PDF.'
            : 'The answers you submitted, exactly as the engine validated and scored them, with the reviewer\'s decision.'
        }
        breadcrumbs={[
          { label: 'Dashboard', href: '/auditor/dashboard' },
          { label: 'My Submissions', href: '/auditor/submissions' },
          { label: String(workspace.submission.submission_number) },
        ]}
      />
      <SubmissionRecord
        workspace={payload}
        mode={fillMode ? 'fill' : 'view'}
        apiBase="/api/auditor/submissions"
        backHref="/auditor/submissions"
        backLabel="My submissions"
      />
    </div>
  );
}
