import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, COMPANY_LEGAL } from '@/lib/utils/constants';
import { STATUTORY_COVERAGE } from '@/lib/utils/public-content';

export const metadata: Metadata = {
  title: 'About Us',
  description: `${APP_NAME} helps Indian establishments stay compliant, audited and payroll-ready.`,
};

export default function AboutPage() {
  return (
    <>
      <section className="border-b border-line bg-surface-muted py-16">
        <div className="mx-auto max-w-4xl px-4 lg:px-8">
          <h1 className="text-4xl font-bold text-ink">About {APP_NAME}</h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-muted">
            {APP_NAME} was built after years of watching compliance teams run establishments on spreadsheets,
            WhatsApp groups and filing cabinets. We put the registers, the audits, the audits&rsquo; evidence and
            the payroll behind them into one system, with an approval chain that stands up to an inspection.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 lg:grid-cols-3 lg:px-8">
          <div className="lg:col-span-2 space-y-10">
            <Block title="What we do">
              We operate as your compliance office: mapping the Acts that apply to each establishment, maintaining
              the licence and return register, running scheduled safety and compliance audits through qualified
              auditors, verifying every report before it is released, and keeping the payroll records that the
              EPFO, ESIC and the Labour Department ask for.
            </Block>

            <Block title="How we work">
              Every engagement starts with an applicability assessment — industry, state, headcount, contractor
              deployment and hazardous processes. That produces the compliance calendar for the year, the audit
              schedule and the list of documents that must be kept current. From then on the platform chases the
              deadlines automatically, escalating to the assigned owner by email, SMS and WhatsApp.
            </Block>

            <div>
              <h2 className="text-2xl font-bold text-ink">Statutory coverage</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                The platform ships with the applicability logic for the principal central and Tamil Nadu state
                legislation. State-specific rules can be added without changing code.
              </p>
              <div className="mt-6 overflow-hidden rounded-xl border border-line">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="table-head">Act / Rule</th>
                      <th className="table-head">What we track</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STATUTORY_COVERAGE.map((entry) => (
                      <tr key={entry.act} className="transition-colors duration-150 hover:bg-surface-muted">
                        <td className="table-cell font-medium text-ink">{entry.act}</td>
                        <td className="table-cell text-ink-soft">{entry.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <Pillar title="Accuracy first" text="Statutory figures are computed from the wage records themselves — never re-keyed." />
              <Pillar title="Evidence always" text="Every submission, version, approval and download is logged against a user and a timestamp." />
              <Pillar title="No surprises" text="Expiry and due-date reminders reach the responsible person well before the deadline." />
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-xl border border-line p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Registered office</h3>
              <address className="mt-4 not-italic text-sm leading-relaxed text-ink-soft">
                {COMPANY_LEGAL.name}<br />
                <span className="block">{COMPANY_LEGAL.address}</span>
              </address>
              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Email</dt><dd className="text-ink-soft">{COMPANY_LEGAL.email}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Phone</dt><dd className="text-ink-soft">{COMPANY_LEGAL.phone}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">GSTIN</dt><dd className="text-ink-soft">{COMPANY_LEGAL.gstin}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">CIN</dt><dd className="text-ink-soft">{COMPANY_LEGAL.cin}</dd></div>
              </dl>
            </div>

            <div className="rounded-xl bg-brand-50 p-6">
              <h3 className="text-sm font-semibold text-brand-800">Want a walkthrough?</h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-700">
                We will show you the audit workflow end to end with your own industry&rsquo;s forms.
              </p>
              <Link href="/contact" className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
                Book a demo
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-ink">{title}</h2>
      <p className="mt-3 text-base leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

function Pillar({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-line p-5">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{text}</p>
    </div>
  );
}
