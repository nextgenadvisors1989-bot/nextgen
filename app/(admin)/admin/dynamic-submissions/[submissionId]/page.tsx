import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminApi } from '@/lib/auth/api-guards';
import { PageHeader } from '@/components/ui/breadcrumb';
import { SubmissionRecord, type SubmissionWorkspacePayload } from '@/components/dynamic-renderer/submission-record';
import { actorFromUser, submissionWorkspace } from '@/services/dynamic-submission.service';

export const metadata: Metadata = { title: 'Submission' };
export const dynamic = 'force-dynamic';

export default async function DynamicSubmissionPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requireAdminApi(['submission.read']);
  const workspace = await submissionWorkspace(id, actorFromUser(user)).catch(() => null);
  if (!workspace) notFound();

  const payload = JSON.parse(JSON.stringify(workspace)) as SubmissionWorkspacePayload;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Submission ${String(workspace.submission.submission_number)}`}
        description="The submitted answers exactly as the engine validated and scored them, with the reviewer's decision and the version history behind the PDF."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Dynamic Submissions', href: '/admin/dynamic-submissions' },
          { label: String(workspace.submission.submission_number) },
        ]}
      />
      <SubmissionRecord
        workspace={payload}
        mode="view"
        reviewBase="/api/admin/dynamic-submissions"
        backHref="/admin/dynamic-submissions"
        backLabel="All submissions"
      />
    </div>
  );
}
