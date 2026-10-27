import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { actorFromUser, startSubmission } from '@/services/dynamic-submission.service';

export const metadata: Metadata = { title: 'Fill Form' };
export const dynamic = 'force-dynamic';

/**
 * Deep-link entry point: /auditor/forms/[formId] opens the form for this auditor.
 *
 * A submission is created (or the existing draft resumed) and the browser is sent
 * straight to the workspace, so a form can never be filled without being persisted
 * — autosave needs a submission to belong to.
 */
export default async function FillFormPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const id = Number(formId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePanel(['auditor', 'admin', 'super_admin']);
  const started = await startSubmission({ form_id: id }, actorFromUser(user));
  redirect(`/auditor/submissions/${started.submissionId}`);
}
