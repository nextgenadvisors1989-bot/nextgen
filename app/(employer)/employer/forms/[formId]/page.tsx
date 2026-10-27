import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { actorFromUser, startSubmission } from '@/services/dynamic-submission.service';

export const metadata: Metadata = { title: 'Fill Form' };
export const dynamic = 'force-dynamic';

/** Deep link: /employer/forms/[formId] starts (or resumes) the submission and opens it. */
export default async function EmployerFillFormPage({ params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  const id = Number(formId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await requirePanel(['employer']);
  const started = await startSubmission({ form_id: id }, actorFromUser(user));
  redirect(`/employer/submissions/${started.submissionId}`);
}
