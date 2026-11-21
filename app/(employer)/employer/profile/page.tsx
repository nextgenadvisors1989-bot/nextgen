import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/breadcrumb';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { Tabs } from '@/components/ui/tabs';
import { CompanyProfile } from '@/components/employer/company-profile';
import { FactoryProfile } from '@/components/employer/factory-profile';

export const metadata: Metadata = { title: 'Company & Factory Profile' };
export const dynamic = 'force-dynamic';

/** The company and its factory are one establishment, so they are one page: who it is and how to reach it, then the factory's licences, people, areas and plants. */
export default async function EmployerProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const { tab } = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Company & Factory Profile"
        description="Your establishment's own file: who it is and who to contact, then the factory's licences, people, working pattern, areas, welfare facilities, treatment plants and power details."
        breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Company & Factory Profile' }]}
      />
      <Tabs
        defaultTab={tab === 'factory' ? 'factory' : 'company'}
        items={[
          { key: 'company', label: 'Company & contact', content: <CompanyProfile canUpdate={hasPermission(user.permissions, 'employer.update')} /> },
          { key: 'factory', label: 'Factory details', content: <FactoryProfile endpoint="/api/employer/factory-profile" /> },
        ]}
      />
    </div>
  );
}
