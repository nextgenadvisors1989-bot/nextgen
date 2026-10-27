import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAllPermissions } from '@/lib/auth/permission-check';
import { findEmployerById } from '@/repositories/employer.repository';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EmployerForm } from '@/components/employer/employer-form';

export const metadata: Metadata = { title: 'Edit Employer' };
export const dynamic = 'force-dynamic';

export default async function EditEmployerPage({ params }: { params: Promise<{ employerId: string }> }) {
  await requireAllPermissions(['employer.update']);
  const { employerId } = await params;
  const id = Number(employerId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const employer = await findEmployerById(id);
  if (!employer) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit — ${employer.company_name}`}
        description="Changes are written to the audit trail with the previous and new values."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Employers', href: '/admin/employers' },
          { label: employer.employer_code, href: `/admin/employers/${employer.id}` },
          { label: 'Edit' },
        ]}
      />
      <EmployerForm mode="edit" employer={employer} />
    </div>
  );
}
