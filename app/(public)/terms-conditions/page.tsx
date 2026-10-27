import type { Metadata } from 'next';
import { APP_NAME, COMPANY_LEGAL } from '@/lib/utils/constants';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: `Terms governing the use of the ${APP_NAME} platform and services.`,
};

const SECTIONS = [
  {
    title: '1. Agreement',
    body: [
      `These terms govern access to and use of the ${APP_NAME} platform, related mobile interfaces and any professional services provided by ${COMPANY_LEGAL.name} ("we", "us", "our"). By creating an account or using the platform you accept these terms on behalf of the organisation you represent.`,
      'Where we have signed a separate master services agreement or statement of work with your organisation, that document prevails over these terms to the extent of any conflict.',
    ],
  },
  {
    title: '2. Accounts and access',
    body: [
      'Access is granted per named user. Administrator accounts are responsible for the accuracy of the users they create, the roles and permissions they assign, and for promptly disabling access when a user leaves the organisation.',
      'You must keep credentials confidential. You are responsible for activity performed through your account. Notify us immediately if you believe credentials have been compromised.',
      'Accounts are provisioned for the roles of administrator, auditor, employer, employee and verifier. Access to a panel is enforced by the platform and may not be shared or transferred without our written consent.',
    ],
  },
  {
    title: '3. Customer data',
    body: [
      'You retain ownership of all data you enter (employer, employee, payroll, compliance and audit data). You grant us a licence to process that data strictly to provide the service.',
      'Personal data of employees (including Aadhaar, PAN, bank and family details) is processed on your instructions as the data fiduciary. You are responsible for obtaining the consents required under applicable law and for ensuring the details you upload are accurate.',
      'We retain audit-trail records of every create, update, approval and download for the retention period configured for your account, so that inspections and internal reviews can be evidenced.',
    ],
  },
  {
    title: '4. Acceptable use',
    body: [
      'You agree not to attempt to bypass role-based access controls, extract data you are not entitled to, interfere with the platform, or use it to store unlawful content.',
      'Dynamic audit forms, notices and CMS content you publish are your responsibility. You must ensure that statutory registers produced from the platform reflect your actual records.',
    ],
  },
  {
    title: '5. Statutory computations',
    body: [
      'Payroll, contribution and settlement figures are computed from the rates, ceilings and rules configured for your establishment. Rates change; you must review the configuration after every statutory amendment.',
      'We provide compliance information for operational purposes. It is not a substitute for legal advice, and where a specific interpretation is required you should consult your legal or statutory advisor.',
    ],
  },
  {
    title: '6. Availability and support',
    body: [
      'We target 99.5% monthly availability for the platform, excluding scheduled maintenance announced in advance. Support is provided during business hours through the contact channels published on this site.',
      'Backups are taken according to the schedule configured for your account and retained for the configured retention window.',
    ],
  },
  {
    title: '7. Fees and payment',
    body: [
      'Fees are as agreed in your quotation or order form and are payable within the stated credit period. Applicable taxes are charged in addition. Subscriptions renew for the agreed term unless either party gives notice before the renewal date.',
    ],
  },
  {
    title: '8. Limitation of liability',
    body: [
      'To the extent permitted by law, our aggregate liability arising out of or relating to the services is limited to the fees paid by you in the twelve months preceding the claim. We are not liable for indirect or consequential loss, loss of profit, or for statutory penalties arising from data you supplied inaccurately.',
    ],
  },
  {
    title: '9. Termination',
    body: [
      'Either party may terminate for material breach on thirty days written notice. On termination you may export your data in the supported formats; after the export window we delete or anonymise data in accordance with our retention policy and applicable law.',
    ],
  },
  {
    title: '10. Governing law',
    body: [
      'These terms are governed by the laws of India. The courts at Chennai, Tamil Nadu have exclusive jurisdiction, and the parties will attempt good-faith resolution before resorting to proceedings.',
    ],
  },
];

export default function TermsPage() {
  return (
    <section className="py-14">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <h1 className="text-4xl font-bold text-ink">Terms &amp; Conditions</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Last updated {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <article key={section.title}>
              <h2 className="text-xl font-semibold text-ink">{section.title}</h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-relaxed text-ink-muted">{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-xl bg-surface-muted p-6">
          <h2 className="text-sm font-semibold text-ink">Questions about these terms?</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Write to {COMPANY_LEGAL.email} or call {COMPANY_LEGAL.phone} during business hours.
            {COMPANY_LEGAL.name}, {COMPANY_LEGAL.address}.
          </p>
        </div>
      </div>
    </section>
  );
}
