import type { Metadata } from 'next';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { notFound } from 'next/navigation';
import { InvoiceEditor } from '@/components/billing/invoice-editor';

export const metadata: Metadata = { title: 'Tax Invoice' };
export const dynamic = 'force-dynamic';

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  await requirePanel(['admin']);
  const id = Number((await params).invoiceId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title="Tax invoice" description="Issue it, record the payments received, or cancel it if nothing was paid." breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Billing', href: '/admin/billing' }, { label: 'Invoice' }]} />
      <InvoiceEditor invoiceId={id} />
    </div>
  );
}
