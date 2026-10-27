import type { Metadata } from 'next';
import { ContactForm } from './contact-form';
import { COMPANY_LEGAL } from '@/lib/utils/constants';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Talk to our compliance, audit and payroll team. We respond within one working day.',
};

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-line bg-surface-muted py-14">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <h1 className="text-4xl font-bold text-ink">Contact Us</h1>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-muted">
            Tell us about your establishment and the audits or statutory obligations you are dealing with.
            Our team responds within one working day.
          </p>
        </div>
      </section>

      <section className="py-14">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 lg:grid-cols-3 lg:px-8">
          <div className="lg:col-span-2">
            <ContactForm />
          </div>

          <aside className="space-y-6">
            <div className="rounded-xl border border-line p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Reach us directly</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-ink-muted">Email</dt>
                  <dd className="mt-0.5 text-ink-soft">
                    <a href={`mailto:${COMPANY_LEGAL.email}`} className="link">{COMPANY_LEGAL.email}</a>
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Phone</dt>
                  <dd className="mt-0.5 text-ink-soft">
                    <a href={`tel:${COMPANY_LEGAL.phone.replace(/[^+0-9]/g, '')}`} className="link">{COMPANY_LEGAL.phone}</a>
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Office</dt>
                  <dd className="mt-0.5 not-italic text-ink-soft">
                    {COMPANY_LEGAL.name}<br />{COMPANY_LEGAL.address}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Working hours</dt>
                  <dd className="mt-0.5 text-ink-soft">Monday to Saturday, 9:30 am – 6:30 pm IST</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl bg-surface-muted p-6">
              <h2 className="text-sm font-semibold text-ink">Existing customers</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                For payroll, audit or access issues, raise it from inside your panel so it is linked to your
                employer record and assigned to the right team. If you cannot sign in, use the email address above
                quoting your employer code.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
