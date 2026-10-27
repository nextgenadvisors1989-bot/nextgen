import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { SubmissionRecord, type SubmissionWorkspacePayload } from '@/components/dynamic-renderer/submission-record';
import { actorFromUser, submissionWorkspace } from '@/services/dynamic-submission.service';

export const metadata: Metadata = { title: 'Verify Submission' };
export const dynamic = 'force-dynamic';

export default async function VerifierSubmissionPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePanel(['verifier', 'admin', 'super_admin']);
  const workspace = await submissionWorkspace(id, actorFromUser(user)).catch(() => null);
  if (!workspace) notFound();

  const payload = JSON.parse(JSON.stringify(workspace)) as SubmissionWorkspacePayload;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Verify ${String(workspace.submission.submission_number)}`}
        description="Read the answers the engine scored, check the attachments and the generated PDF, then record your decision — the submitter is notified with your note."
        breadcrumbs={[
          { label: 'Dashboard', href: '/verifier/dashboard' },
          { label: 'Module Submissions', href: '/verifier/submissions' },
          { label: String(workspace.submission.submission_number) },
        ]}
      />
      <SubmissionRecord
        workspace={payload}
        mode="view"
        reviewBase="/api/verifier/submissions"
        backHref="/verifier/submissions"
        backLabel="Verification queue"
      />
    </div>
  );
}
