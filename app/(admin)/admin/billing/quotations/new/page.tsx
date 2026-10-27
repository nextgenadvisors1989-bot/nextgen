import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { QuotationEditor } from '@/components/billing/quotation-editor';

export const metadata: Metadata = { title: 'New Quotation' };
export const dynamic = 'force-dynamic';

export default async function NewQuotationPage() {
  await requirePanel(['admin']);
  return (
    <div className="space-y-6">
      <PageHeader title="New quotation" description="Price the service lines for a client. It stays a draft until you mark it sent." breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Billing', href: '/admin/billing' }, { label: 'New quotation' }]} />
      <QuotationEditor />
    </div>
  );
}
