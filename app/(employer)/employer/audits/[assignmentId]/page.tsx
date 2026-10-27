import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { EmployerAuditDetail } from '@/components/employer/employer-audit-detail';
import { getAssignmentDetail } from '@/services/audit-assignment.service';
import * as assignmentRepo from '@/repositories/audit-assignment.repository';

export const metadata: Metadata = { title: 'Audit' };
export const dynamic = 'force-dynamic';

export default async function EmployerAuditDetailPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const user = await requirePageUser();
  const { assignmentId } = await params;
  const id = Number(assignmentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  // The audit must belong to this establishment: another company's audit is a 404,
  // which is the same answer as one that does not exist.
  const assignment = await assignmentRepo.findAssignmentById(id);
  if (!assignment || Number(assignment.employer_id) !== Number(user.employerId ?? 0)) notFound();

  const detail = await getAssignmentDetail(id);
  if (!detail) notFound();

  return <EmployerAuditDetail assignmentId={id} />;
}
