import type { Metadata } from 'next/dist/lib/metadata/types/metadata-interface';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditorModuleFamilyScreen } from '@/components/dynamic-admin/module-family-screen';
import { moduleFamily } from '@/lib/modules/module-families';

export const metadata: Metadata = { title: 'My Assessments' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        title='My Assessments'
        breadcrumbs={[
          { label: 'Dashboard', href: '/auditor/dashboard' },
          { label: 'Assessments' },
        ]}
      />
      <AuditorModuleFamilyScreen family={moduleFamily('assessments')!} />
    </div>
  );
}
