import type { Metadata } from 'next/dist/lib/metadata/types/metadata-interface';
import { requirePageUser } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { AdminModuleFamilyRegister } from '@/components/dynamic-admin/module-family-register';
import { moduleFamily } from '@/lib/modules/module-families';

export const metadata: Metadata = { title: 'Work Permits' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        title='Work Permits'
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Work Permits' },
        ]}
      />
      <AdminModuleFamilyRegister family={moduleFamily('work-permits')!} />
    </div>
  );
}
