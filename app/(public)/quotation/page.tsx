import type { Metadata } from 'next';
import { QuotationRequest } from '@/components/public/quotation-request';

export const metadata: Metadata = {
  title: 'Quotation Generation',
  description: 'Choose the compliance, safety and environmental services you need and request a priced quotation.',
};

export default function QuotationPage() {
  return (
    <>
      <section className="border-b border-line bg-surface-muted py-14">
        <div className="mx-auto max-w-5xl px-4 lg:px-8">
          <h1 className="text-4xl font-bold text-ink">Quotation Generation</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">
            Tell us which services you need and a little about your plant. We send back an itemised, priced quotation with GST, and turn it into a tax invoice once you accept.
          </p>
        </div>
      </section>
      <section className="py-12">
        <div className="mx-auto max-w-5xl px-4 lg:px-8"><QuotationRequest /></div>
      </section>
    </>
  );
}
