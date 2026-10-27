import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Bill Generation',
  description: 'GST tax invoices and payment receipts: how billing works, and where clients find their bills.',
};

const STEPS: [string, string][] = [
  ['Quotation', 'An itemised quotation is prepared for your scope, with GST shown separately, and sent to you.'],
  ['Acceptance', 'When you accept it, the quotation is turned into a draft tax invoice with the same lines and rates.'],
  ['Tax invoice', 'The invoice is issued with its own number: CGST and SGST for a buyer in the same state, IGST otherwise, with the HSN / SAC summary.'],
  ['Receipt', 'Each payment you make is recorded against the invoice and acknowledged with a numbered receipt.'],
];

export default function BillGenerationPage() {
  return (
    <>
      <section className="border-b border-line bg-surface-muted py-14">
        <div className="mx-auto max-w-5xl px-4 lg:px-8">
          <h1 className="text-4xl font-bold text-ink">Bill Generation</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">GST tax invoices and payment receipts are generated from your accepted quotation, and every one is available to download from your client portal.</p>
        </div>
      </section>
      <section className="py-12">
        <div className="mx-auto max-w-5xl px-4 lg:px-8">
          <ol className="grid gap-4 md:grid-cols-2">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-4 rounded-xl border border-line bg-white p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white" aria-hidden>{i + 1}</span>
                <span><span className="block text-base font-bold text-ink">{title}</span><span className="mt-1 block text-sm leading-relaxed text-ink-muted">{text}</span></span>
              </li>
            ))}
          </ol>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-muted p-6">
              <h2 className="text-lg font-bold text-ink">Already a client?</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">Sign in to your client portal and open <strong>Billing</strong> to view and download your quotations, tax invoices and receipts.</p>
              <Link href="/login?next=/employer/billing" className="mt-4 inline-block rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Sign in to Billing</Link>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted p-6">
              <h2 className="text-lg font-bold text-ink">Need a quotation first?</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">Choose the services you want and we will send an itemised, priced quotation.</p>
              <Link href="/quotation" className="mt-4 inline-block rounded-lg border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface-muted">Get a quotation</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
