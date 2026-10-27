import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { CompanyProfile } from '@/components/employer/company-profile';

export const metadata: Metadata = { title: 'Company Profile' };
export const dynamic = 'force-dynamic';

export default async function EmployerProfilePage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Profile"
        description="Your establishment's own file: what the platform holds about it, where it operates and who to contact."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Company Profile' }]}
      />
      <CompanyProfile canUpdate={hasPermission(user.permissions, 'employer.update')} />
    </div>
  );
}
