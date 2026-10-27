import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { InvoiceEditor } from '@/components/billing/invoice-editor';

export const metadata: Metadata = { title: 'New Tax Invoice' };
export const dynamic = 'force-dynamic';

export default async function NewInvoicePage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader title="New tax invoice" description="A draft has no invoice number until you issue it." breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Billing', href: '/admin/billing' }, { label: 'New invoice' }]} />
      <InvoiceEditor />
    </div>
  );
}
