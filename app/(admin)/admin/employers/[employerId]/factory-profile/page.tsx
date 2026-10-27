import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { FactoryProfile } from '@/components/employer/factory-profile';

export const metadata: Metadata = { title: 'Factory Profile' };
export const dynamic = 'force-dynamic';

export default async function AdminFactoryProfilePage({ params }: { params: Promise<{ employerId: string }> }) {
  await requirePanel(['admin']);
  const id = Number((await params).employerId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title="Factory Profile" description="The company's factory details as it keeps them. Administrators can read and update any company's profile."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Employers', href: '/admin/employers' }, { label: 'Company', href: `/admin/employers/${id}` }, { label: 'Factory Profile' }]} />
      <FactoryProfile endpoint={`/api/admin/employers/${id}/factory-profile`} />
    </div>
  );
}
