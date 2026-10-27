import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CaparCategories } from '@/components/capar/capar-categories';

export const metadata: Metadata = { title: 'CAPAR Categories' };
export const dynamic = 'force-dynamic';

export default async function AdminCaparCategoriesPage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="CAPAR Categories"
        description="The headings auditors group findings under, such as Business Practices, Fire Safety or Chemical Management."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'CAPAR Reports', href: '/admin/capar' }, { label: 'Categories' }]}
      />
      <CaparCategories />
    </div>
  );
}
