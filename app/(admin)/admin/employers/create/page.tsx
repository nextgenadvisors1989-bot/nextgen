import type { Metadata } from 'next';
import { requireAllPermissions } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { EmployerForm } from '@/components/employer/employer-form';

export const metadata: Metadata = { title: 'Create Employer' };
export const dynamic = 'force-dynamic';

export default async function CreateEmployerPage() {
  await requireAllPermissions(['employer.create']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Employer"
        description="Register a new company. Fields marked with * are required."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Employers', href: '/admin/employers' },
          { label: 'Create' },
        ]}
      />
      <EmployerForm mode="create" />
    </div>
  );
}
