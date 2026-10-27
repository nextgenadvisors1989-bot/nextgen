import type { Metadata } from 'next';
import Link from 'next/link';
import { SERVICE_CATALOGUE, FAQS } from '@/lib/utils/public-content';

export const metadata: Metadata = {
  title: 'Services',
  description: 'Statutory compliance, safety audits, HR & payroll, contractor control, document management and risk assessment.',
};

export default function ServicesPage() {
  return (
    <>
      <section className="border-b border-line bg-surface-muted py-16">
        <div className="mx-auto max-w-4xl px-4 lg:px-8">
          <h1 className="text-4xl font-bold text-ink">Services</h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-muted">
            Six practice areas, one platform. Each service is delivered through the same role-based workspace so
            your team sees a single, consistent record.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl space-y-10 px-4 lg:px-8">
          {SERVICE_CATALOGUE.map((service, index) => (
            <div key={service.slug} id={service.slug} className="grid grid-cols-1 gap-8 rounded-xl border border-line p-8 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  Service {String(index + 1).padStart(2, '0')}
                </span>
                <h2 className="mt-2 text-2xl font-bold text-ink">{service.title}</h2>
                <p className="mt-3 text-base leading-relaxed text-ink-muted">{service.summary}</p>
              </div>
              <ul className="space-y-3">
                {service.points.map((point) => (
                  <li key={point} className="flex gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-soft">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.4" className="mt-0.5 shrink-0" aria-hidden>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface-muted py-16">
        <div className="mx-auto max-w-4xl px-4 lg:px-8">
          <h2 className="text-3xl font-bold text-ink">Frequently asked questions</h2>
          <div className="mt-8 space-y-4">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group rounded-xl border border-line bg-white p-5">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-ink">
                  {faq.question}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 transition-transform duration-200 group-open:rotate-180" aria-hidden>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{faq.answer}</p>
              </details>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/contact" className="rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-[2px] hover:bg-brand-600">
              Request a Demo
            </Link>
            <Link href="/acts-compliance" className="rounded-lg border border-line bg-white px-6 py-3 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted">
              Browse Acts &amp; Compliance
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
