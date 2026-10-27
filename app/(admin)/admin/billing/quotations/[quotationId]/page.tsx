import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { notFound } from 'next/navigation';
import { QuotationEditor } from '@/components/billing/quotation-editor';

export const metadata: Metadata = { title: 'Quotation' };
export const dynamic = 'force-dynamic';

export default async function QuotationPage({ params }: { params: Promise<{ quotationId: string }> }) {
  await requirePanel(['admin']);
  const id = Number((await params).quotationId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title="Quotation" description="Edit it while it is a draft or sent; accept it to turn it into an invoice." breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Billing', href: '/admin/billing' }, { label: 'Quotation' }]} />
      <QuotationEditor quotationId={id} />
    </div>
  );
}
