import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, COMPANY_LEGAL } from '@/lib/utils/constants';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${APP_NAME} collects, uses, stores and protects personal data.`,
};

const SECTIONS = [
  {
    title: '1. Who we are',
    body: [
      `${COMPANY_LEGAL.name} operates the ${APP_NAME} compliance, audit, HR and payroll platform. We act as a data processor for the employee and payroll data our customers upload, and as a data fiduciary for the account and enquiry data we collect directly.`,
    ],
  },
  {
    title: '2. What we collect',
    body: [
      'Account data: name, work email, mobile number, role, employer, designation, last sign-in and session records.',
      'Employee data uploaded by our customers: identity details (including Aadhaar, PAN where provided), contact and family details, bank account, PF/ESI identifiers, attendance, leave, salary structure and payroll records.',
      'Compliance and audit data: licences, registrations, returns, audit forms, findings, evidence files and verification comments.',
      'Technical data: IP address, browser and device information, and a record of significant actions performed in the platform (activity logs and audit trails).',
      'Enquiry data submitted through the contact form on this site.',
    ],
  },
  {
    title: '3. Why we process it',
    body: [
      'To provide the platform: authentication, role-based access, payroll computation, compliance reminders, audit workflows and PDF generation.',
      'To communicate: transactional email, SMS and WhatsApp messages about audits, payslips, account credentials and expiring documents, plus responses to enquiries.',
      'To meet legal obligations: statutory registers and records that our customers are required to maintain and produce on inspection.',
      'To keep the platform secure: detecting unauthorised access attempts, locking accounts after repeated failures and maintaining audit trails.',
    ],
  },
  {
    title: '4. Sharing',
    body: [
      'We share data only with the processors needed to run the service — cloud hosting, email, SMS and WhatsApp delivery providers — under contractual confidentiality obligations.',
      'We disclose data to a customer\u2019s own users according to the roles and permissions that customer administers, and to statutory authorities where we are legally required to do so or where the customer instructs us to file a return.',
      'We do not sell personal data and we do not use customer employee data for our own marketing.',
    ],
  },
  {
    title: '5. Security',
    body: [
      'Passwords are stored using bcrypt hashing. Session cookies are HttpOnly and signed; mutating requests require a CSRF token. Integration credentials (SMTP, SMS and WhatsApp keys) are encrypted at rest with AES-256-GCM.',
      'Access to production data is restricted and audited. Uploaded files are validated by type and stored with checksums so that tampering is detectable.',
      'All database access uses parameterised queries, and uploaded content is escaped before rendering, protecting against SQL injection and cross-site scripting.',
    ],
  },
  {
    title: '6. Retention',
    body: [
      'Employer, employee, payroll and compliance records are retained for the period configured for your account (seven years by default), consistent with statutory record-keeping expectations. Activity logs and audit trails are retained for the same period. Contact-form enquiries are retained for 24 months.',
      'On termination, data is exported to you on request and then deleted or anonymised after the agreed export window.',
    ],
  },
  {
    title: '7. Your rights',
    body: [
      'Individuals whose data is processed by a customer should first contact that employer, who is the data fiduciary for their employee records. We assist our customers in responding to access, correction and deletion requests.',
      'For data we control directly, you may request access, correction, deletion or a copy of your data by writing to the address below. We respond within 30 days.',
    ],
  },
  {
    title: '8. Cookies',
    body: [
      'We use a strictly necessary session cookie to keep you signed in and a CSRF token cookie to protect form submissions. We do not use advertising cookies or third-party trackers on this site.',
    ],
  },
  {
    title: '9. Changes and contact',
    body: [
      'We will update this policy when our practices change and will note the revision date at the top of the page. Material changes affecting customer data will be notified to administrators by email.',
      `Questions or requests may be sent to ${COMPANY_LEGAL.email} or by post to ${COMPANY_LEGAL.name}, ${COMPANY_LEGAL.address}.`,
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <section className="py-14">
      <div className="mx-auto max-w-3xl px-4 lg:px-8">
        <h1 className="text-4xl font-bold text-ink">Privacy Policy</h1>
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
          <h2 className="text-sm font-semibold text-ink">Data protection contact</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {COMPANY_LEGAL.name}, {COMPANY_LEGAL.address} · {COMPANY_LEGAL.email} · {COMPANY_LEGAL.phone}
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            See also our <Link href="/terms-conditions" className="link">Terms &amp; Conditions</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}
