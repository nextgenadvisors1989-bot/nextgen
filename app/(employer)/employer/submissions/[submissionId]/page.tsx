import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { SubmissionRecord, type SubmissionWorkspacePayload } from '@/components/dynamic-renderer/submission-record';
import { actorFromUser, submissionWorkspace } from '@/services/dynamic-submission.service';

export const metadata: Metadata = { title: 'Submission' };
export const dynamic = 'force-dynamic';

export default async function EmployerSubmissionPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePanel(['employer']);
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
            ? 'Fill the form — your answers save automatically every three seconds. Submit when the checklist is green.'
            : "The answers as submitted, exactly as the engine validated and scored them, with the reviewer's decision."
        }
        breadcrumbs={[
          { label: 'Dashboard', href: '/employer/dashboard' },
          { label: 'My Submissions', href: '/employer/submissions' },
          { label: String(workspace.submission.submission_number) },
        ]}
      />
      <SubmissionRecord
        workspace={payload}
        mode={fillMode ? 'fill' : 'view'}
        apiBase="/api/employer/submissions"
        backHref="/employer/submissions"
        backLabel="My submissions"
      />
    </div>
  );
}
