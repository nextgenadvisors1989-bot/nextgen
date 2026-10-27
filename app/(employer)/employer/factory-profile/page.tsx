import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { FactoryProfile } from '@/components/employer/factory-profile';

export const metadata: Metadata = { title: 'Factory Profile' };
export const dynamic = 'force-dynamic';

export default async function EmployerFactoryProfilePage() {
  await requirePanel(['employer']);
  return (
    <div className="space-y-6">
      <PageHeader title="Factory Profile" description="Your factory's licences, people, working pattern, areas, welfare facilities, treatment plants and power details."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Factory Profile' }]} />
      <FactoryProfile endpoint="/api/employer/factory-profile" />
    </div>
  );
}
