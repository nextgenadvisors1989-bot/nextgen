import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { BillingHome } from '@/components/billing/billing-home';

export const metadata: Metadata = { title: 'Billing' };
export const dynamic = 'force-dynamic';

export default async function AdminBillingPage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Quotations, GST tax invoices and payment receipts for your clients." breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Billing' }]} />
      <BillingHome />
    </div>
  );
}
