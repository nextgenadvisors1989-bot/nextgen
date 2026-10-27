import type { Metadata } from 'next/dist/lib/metadata/types/metadata-interface';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AuditorModuleFamilyScreen } from '@/components/dynamic-admin/module-family-screen';
import { moduleFamily } from '@/lib/modules/module-families';

export const metadata: Metadata = { title: 'My Work Permits' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        title='My Work Permits'
        breadcrumbs={[
          { label: 'Dashboard', href: '/auditor/dashboard' },
          { label: 'Work Permits' },
        ]}
      />
      <AuditorModuleFamilyScreen family={moduleFamily('work-permits')!} />
    </div>
  );
}
