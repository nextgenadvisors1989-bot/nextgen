import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ClientBilling } from '@/components/billing/client-billing';

export const metadata: Metadata = { title: 'Billing' };
export const dynamic = 'force-dynamic';

export default async function EmployerBillingPage() {
  await requirePanel(['employer']);
  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="The quotations and tax invoices NextGen has sent your company, with receipts for your payments." breadcrumbs={[{ label: 'Dashboard', href: '/employer/dashboard' }, { label: 'Billing' }]} />
      <ClientBilling />
    </div>
  );
}
