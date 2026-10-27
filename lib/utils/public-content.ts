/**
 * Public-site content that is stable, legal/statutory in nature, and therefore
 * belongs in source rather than the CMS. Everything that marketing may want to
 * edit lives in the cms_pages table and is fetched from there.
 */

export interface ServiceEntry {
  slug: string;
  title: string;
  summary: string;
  points: string[];
  icon: string;
}

export const SERVICE_CATALOGUE: ServiceEntry[] = [
  {
    slug: 'statutory-compliance',
    title: 'Statutory Compliance Management',
    summary:
      'Every licence, registration and return your establishment needs, tracked with issue dates, expiry dates and owners.',
    points: ['Applicability mapping by industry and headcount', 'Expiry reminders at 90/60/30/15/7/1 days', 'Renewal ownership and status tracking'],
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  },
  {
    slug: 'safety-audits',
    title: 'Safety & Compliance Audits',
    summary:
      'Assign, execute, verify and publish audits with dynamic forms, scoring, findings registers and versioned reports.',
    points: ['Dynamic audit modules and forms', 'Draft, resume and submit from any device', 'Versioned reports with PDF output'],
    icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2',
  },
  {
    slug: 'hr-payroll',
    title: 'HR & Payroll',
    summary:
      'Employee master, personal file, attendance, leave ledgers, salary structures and monthly payroll with bilingual payslips.',
    points: ['14-step employee onboarding wizard', 'PF / ESI / PT / LWF / TDS statutory engine', 'Tamil & English payslip PDFs'],
    icon: 'M6 3h12M6 8h12M6 13h4a5 5 0 0 0 0-10M6 13l8 8',
  },
  {
    slug: 'contract-labour',
    title: 'Contractor & Work Permit Control',
    summary:
      'Contractor registration, work permits, gate-pass control and CLRA licence verification for every contractor on site.',
    points: ['Work permit issue and closure', 'Contractor licence expiry tracking', 'Wage and EPF compliance checks'],
    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  },
  {
    slug: 'document-control',
    title: 'Document Control',
    summary:
      'A controlled document library with versioning, access levels, checksums and download tracking for every file.',
    points: ['Version history with immutable older versions', 'Role-based access to sensitive documents', 'SHA-256 integrity checks'],
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6',
  },
  {
    slug: 'risk-assessment',
    title: 'Risk Assessment & Studies',
    summary:
      'Hazard identification, risk scoring with controls, plus HAZOP, safety, environmental and fire studies with findings.',
    points: ['Risk matrix with residual scoring', 'Corrective action tracking', 'Study reports with attachments'],
    icon: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  },
];

export const PLATFORM_MODULES = [
  { title: 'Admin Workspace', summary: 'Employers, employees, auditors, audit assignment, compliance register, payroll, CMS, settings and the full activity log.' },
  { title: 'Auditor Workspace', summary: 'Assigned audits, dynamic form completion, drafts, evidence uploads, submissions and generated reports.' },
  { title: 'Employer Portal', summary: 'Company profile, units, departments, employees, attendance, leave, salary structures, payroll runs and documents.' },
  { title: 'Employee Self-Service', summary: 'Profile and personal file, attendance, leave applications, payslip downloads, documents and calendar.' },
  { title: 'Verifier Workspace', summary: 'Verification queue, report review with versions, comments, and approve / reject / return decisions.' },
];

export const STATUTORY_COVERAGE = [
  { act: 'Factories Act, 1948', note: 'Registers, safety audits, hazardous process compliance, welfare and working-hour records.' },
  { act: 'Contract Labour (R&A) Act, 1970', note: 'Principal employer obligations, contractor licences, wage registers and returns.' },
  { act: 'Shops & Establishments Act', note: 'State-wise registration, opening and closing hours, leave and holiday records.' },
  { act: 'Employees’ Provident Funds Act, 1952', note: 'PF contribution at 12% on the statutory ceiling, ECR-ready wage data.' },
  { act: 'Employees’ State Insurance Act, 1948', note: 'ESI contribution for employees within the wage ceiling, dispensary and IP records.' },
  { act: 'Payment of Bonus Act, 1965', note: 'Statutory bonus computation, registers and settlement records.' },
  { act: 'Payment of Gratuity Act, 1972', note: 'Gratuity accrual and settlement on separation after five years of service.' },
  { act: 'Minimum Wages Act, 1948', note: 'Scheduled employment rates, revisions and wage slip evidence.' },
  { act: 'Maternity Benefit Act, 1961', note: '26-week maternity benefit, crèche and nursing-break records.' },
  { act: 'Employees’ Compensation Act, 1923', note: 'Accident reporting, compensation calculation and registers.' },
  { act: 'Ease of Compliance Rules, 2017', note: 'Consolidated registers replacing five separate statutory registers.' },
  { act: 'Tamil Nadu LWF & PT', note: 'State labour welfare fund and professional tax deductions with monthly remittance.' },
];

export const FAQS = [
  {
    question: 'Can we keep using our existing registers?',
    answer:
      'Yes. The platform produces the consolidated registers required under the Ease of Compliance Rules, 2017, and can also generate the earlier form-wise registers (Form A, B, C, D, E) if your inspectorate still asks for them.',
  },
  {
    question: 'How are audits assigned and tracked?',
    answer:
      'An administrator raises an audit assignment against an employer, picks the auditor and the audit module, sets the TAT and priority. The auditor and verifier are emailed immediately, the dates appear on both calendars, and reminders go out at 7, 3 and 1 days before the due date.',
  },
  {
    question: 'Are payslips available in Tamil?',
    answer:
      'Yes. Payslips are generated bilingual — Tamil and English headings side by side — with the employer header, statutory deduction breakdown and net pay in words.',
  },
  {
    question: 'How is access controlled?',
    answer:
      'Every role has an explicit permission set. Checks run at the API layer as well as the page layer, so pasting a URL for a page you are not entitled to returns a 403 rather than the data.',
  },
  {
    question: 'What happens to old audit reports?',
    answer:
      'Nothing is overwritten. Each submission freezes a version with its own PDF; verifier comments are stored against the exact version reviewed, so you can always show what was approved and when.',
  },
];
