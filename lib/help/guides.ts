/**
 * "What do I want to do?" - the plain-language guide of every panel. Each task names the screen, says what to do there
 * in a few steps and links straight to it. The same catalogue feeds the "Start here" card on each dashboard and the full
 * Help & Guide page of the role (/admin/help, /employer/help, /employee/help, /auditor/help, /verifier/help), so the two
 * can never disagree. Tasks follow the sidebar: a link here is always a menu item of that role.
 */
export type GuideRole = 'admin' | 'employer' | 'employee' | 'auditor' | 'verifier';

export interface GuideTask {
  /** What the person wants to do, in their words. */
  title: string;
  /** Where it is, in the words of the menu. */
  where: string;
  href: string;
  steps: string[];
  /** Something worth knowing before starting. */
  tip?: string;
  /** Shown only to people who have this permission (a task that would open a page they cannot see is left out). */
  permission?: string;
}

export interface Guide {
  role: GuideRole;
  panel: string;
  intro: string;
  tasks: GuideTask[];
}

export const GUIDES: Record<GuideRole, Guide> = {
  admin: {
    role: 'admin',
    panel: 'Administrator',
    intro: 'You look after the whole platform: the companies and people who use it, the audits, the Acts library, the public website and the settings. Everything on the website can be changed from here; no developer is needed.',
    tasks: [
      { title: 'Change what visitors see on the website', where: 'Content & System → CMS → Home Page', href: '/admin/cms/home', steps: ['Open Home Page. Every part of the home page is listed in the order visitors read it.', 'Press Edit on a part, change the words, press Save.', 'Add the principal’s photo in “Principal — photo and message”.'], tip: 'Switch “Show on home page” off to hide a part. “Back to the standard text” undoes your changes to that part.' },
      { title: 'Check that the platform is ready for real clients', where: 'Content & System → Go-live Checklist', href: '/admin/setup', steps: ['Open the checklist. It reads your live data and shows what is still sample or missing.', 'Press the button beside each “To do” line; it opens the screen where that is fixed.'] },
      { title: 'Register a company (employer)', where: 'Organisation → Employers → Create Employer', href: '/admin/employers/create', steps: ['Fill in the company and contact details.', 'Create the login for the company’s contact person from Users → Create User, with the Employer role.'] },
      { title: 'Give an audit to an auditor', where: 'Audit Operations → Audit Assignments → Create Assignment', href: '/admin/audit-assignments/create', steps: ['Choose the company, the audit and the auditor, and a verifier.', 'Save. The auditor sees it under My Audits; the company sees it under Audits.'] },
      { title: 'See reports waiting for checking', where: 'Audit Operations → Audit Reports → Verifier Queue', href: '/admin/verifier-queue', steps: ['Open a report to see what the auditor wrote.', 'The assigned verifier approves it or sends it back with comments.'] },
      { title: 'Add or correct an Act', where: 'Compliance → Acts & Rules', href: '/admin/compliance/acts', steps: ['Open an Act, then “Chapters & sections”.', 'Add chapters, sections and sub-sections with the Word-style editor. The public site and every auditor see the change.'] },
      { title: 'Read enquiries from the website', where: 'Content & System → CMS → Contact Enquiries', href: '/admin/contact-enquiries', steps: ['Every form filled on the website arrives here.', 'Open one, write who is handling it and mark it done.'] },
      { title: 'Enter the emission factors for the carbon calculation', where: 'Compliance → Data Management → Emission Factors', href: '/admin/data-management/factors', steps: ['Add the client’s official factor for each fuel, electricity, transport and waste activity with its source and year.', 'Set the status to Approved. Nothing is pre-filled: an activity without an approved factor is shown as missing and adds nothing.'] },
      { title: 'Add a person or change what they may do', where: 'Administration → Users', href: '/admin/users/create', steps: ['Create the user, choose their role.', 'To change what a role may do, use Roles & Permissions → Permissions Matrix.'] },
      { title: 'Change company details, e-mail or backups', where: 'Administration → Settings', href: '/admin/settings/company-settings', steps: ['Company Settings holds the name, address, phones, GSTIN and bank details printed on invoices.', 'Email Settings holds the mail server that sends password resets and notices. Backup Settings holds the backup schedule.'] },
    ],
  },
  employer: {
    role: 'employer',
    panel: 'Employer',
    intro: 'This is your company’s workspace: your people, their attendance and pay, the audits done on your company and the compliance papers you must keep.',
    tasks: [
      { title: 'Complete my company and factory profile', where: 'Organisation → Company & Factory Profile', href: '/employer/profile', steps: ['Company & contact: check the company name, address, registration numbers and contact person.', 'Factory details: licences, people, working pattern, areas, welfare facilities, treatment plants and power.', 'Correct anything that is old. Auditors and invoices use these details.'] },
      { title: 'Add my employees', where: 'Organisation → Employees → Add Employee', href: '/employer/employees/create', steps: ['Enter the personal and job details.', 'Issue a self-service login on the spot so the person can see their own attendance, leave and payslips.'], tip: 'Set up Designations and Departments first; they appear as choices on the employee form.' },
      { title: 'Record attendance', where: 'HR & Payroll → Attendance → Attendance Register', href: '/employer/attendance', steps: ['Choose the month.', 'Mark each person’s days, or use Bulk Upload to load a sheet.'] },
      { title: 'Run payroll and give payslips', where: 'HR & Payroll → Payroll → Run Payroll', href: '/employer/payroll/run', steps: ['Check the Salary Structure of each person.', 'Run the month. Payslips appear under Payslips and in each employee’s own login.'] },
      { title: 'Keep licences and certificates up to date', where: 'Audits & Compliance → Compliance Documents', href: '/employer/compliance-documents', steps: ['Upload each licence, certificate or return with its expiry date.', 'The platform reminds you before it expires.'] },
      { title: 'See the audits done on my company', where: 'Audits & Compliance → Audits', href: '/employer/audits', steps: ['Open an audit to see its date, auditor and status.', 'Finished reports are under Audit Reports; actions you must take are under CAPAR Reports.'] },
      { title: 'Record my factory’s daily data (purchases, production, water, energy, waste, transport)', where: 'Factory Data → Data Management', href: '/employer/data-management', steps: ['Open Registers and choose the register (for example PRO-01 daily production, ENR-01 electricity, WAT-01 water, WST-01 waste).', 'Press Enter a record, fill the figures; calculated fields work themselves out. Attach the meter photo or weighbridge slip by opening the saved record.', 'Verify what your staff entered with Verify; Overview shows the KPIs, Balances the material, water and waste balances, GHG emissions the carbon footprint.'], tip: 'Switch data entry on for an employee on their page (Login Account tab) so they can enter records for you.' },
      { title: 'Read the corrective-action (CAPAR) reports about my company', where: 'Audits & Compliance → CAPAR Reports', href: '/employer/capar', steps: ['Open a report to read each finding with its action plan and timeline.', 'Use it as your to-do list for putting things right.'] },
      { title: 'Prepare the document pack for an audit', where: 'Organisation → Audit Documents', href: '/employer/audit-documents', steps: ['See the list of documents your auditor will ask for and attach the files.', 'Submit the pack; each submission is saved with its date and time.'] },
      { title: 'See my invoices and download files', where: 'Account → Billing, Downloads', href: '/employer/billing', steps: ['Billing lists the quotations and tax invoices sent to your company, with receipts for your payments.', 'Downloads holds the files made available to you.'] },
    ],
  },
  employee: {
    role: 'employee',
    panel: 'Employee',
    intro: 'This is your own space: your details, your attendance and leave, your payslips and the documents your employer keeps for you.',
    tasks: [
      { title: 'Check my details', where: 'My Information → Personal Details', href: '/employee/personal-details', steps: ['Read your name, address, bank and family details.', 'Update what you are allowed to; ask your employer to correct the rest.'] },
      { title: 'See my attendance', where: 'Attendance & Pay → Attendance', href: '/employee/attendance', steps: ['Choose the month to see each day.', 'If something is wrong, tell your employer before the payroll is run.'] },
      { title: 'Check my leave balance and history', where: 'Attendance & Pay → Leave', href: '/employee/leave', steps: ['Leave Balance shows what you have left.', 'Leave History shows what you took and when.'] },
      { title: 'Download my payslip', where: 'Attendance & Pay → Payslips', href: '/employee/payslips', steps: ['Open the month and download the PDF.'] },
      { title: 'See my documents', where: 'Attendance & Pay → Documents', href: '/employee/documents', steps: ['Upload your certificates and identity papers here.', 'Your employer sees the same file on your personal record.'] },
      { title: 'Enter factory data for my employer', where: 'Factory Data → Data Management (only if your employer switched it on)', href: '/employee/data-management', permission: 'data_management.read', steps: ['Open the register your employer asked you to fill and press Enter a record.', 'You can correct your own records until the employer verifies them.'] },
      { title: 'Choose how I am told about things', where: 'Account → Settings', href: '/employee/settings', steps: ['Change your password.', 'Choose in-app, e-mail, SMS or WhatsApp for each kind of message.'] },
    ],
  },
  auditor: {
    role: 'auditor',
    panel: 'Auditor',
    intro: 'You see the audits the administrator has given you, the forms to fill, the Acts to refer to and the reports to write.',
    tasks: [
      { title: 'See the audits given to me', where: 'My Work → My Audits → Assigned Audits', href: '/auditor/audits', steps: ['Each row shows the company, the date and the status.', 'Open one to see its details and start.'] },
      { title: 'Download the company’s documents before the audit', where: 'My Work → Audit Documents', href: '/auditor/audit-documents', steps: ['Choose the company and download its submitted document pack.'], tip: 'You need to download the pack once before a CAPAR can be started for that company.' },
      { title: 'Fill an audit or assessment form', where: 'My Work → Audit and Assessment', href: '/auditor/compliance', steps: ['Choose the audit, the form and the company or factory (every audit and every company is open to you); fill it and save, you can come back later.', 'Download a blank or filled copy as PDF or Word when needed.'] },
      { title: 'Write a CAPAR report', where: 'My Work → CAPAR Reports', href: '/auditor/capar', steps: ['Choose the company or factory you audited (every company is listed; a scheduled audit, if there is one, fills in the date and unit).', 'Add findings with photos, then submit to the verifier.'] },
      { title: 'Check a company’s daily data (read-only)', where: 'My Work → Data Management', href: '/auditor/data-management', steps: ['Choose the company (any company may be audited).', 'Overview shows its KPIs; Registers has every record, GHG emissions and Balances show how the figures add up. Nothing can be changed from here.'] },
      { title: 'Look up an Act or Rule', where: 'My Work → Act & Compliance', href: '/auditor/act-compliance', steps: ['Search the Act-wise table of forms, returns and statements.', 'Open the library to read the full text, chapter by chapter.'] },
      { title: 'Fill any audit, assessment, study or permit form', where: 'My Work → Forms & Modules → All Modules & Forms', href: '/auditor/modules', steps: ['Open a form, fill it and submit. Your submissions are under My Submissions.'] },
    ],
  },
  verifier: {
    role: 'verifier',
    panel: 'Verifier',
    intro: 'You check the work of auditors: you read each report, then approve it or send it back with your comments.',
    tasks: [
      { title: 'Check a report given to me', where: 'Verification → Assigned Reports', href: '/verifier/reports', steps: ['Open the report and read it.', 'Approve it, or reject it with a clear comment so the auditor knows what to fix.'] },
      { title: 'Check a CAPAR report', where: 'Verification → CAPAR Reports', href: '/verifier/capar', steps: ['Read the findings and photos.', 'Mark it Eligible or Not Eligible, or return it for correction.'] },
      { title: 'Check a form submission', where: 'Verification → Module Submissions', href: '/verifier/submissions', steps: ['Open the submission, review the answers and decide.'] },
      { title: 'Look back at what I decided', where: 'Verification → Approved / Rejected', href: '/verifier/approved', steps: ['Approved and Rejected list everything you have already decided.'] },
    ],
  },
};

/** The tasks a person may use. */
export function tasksFor(guide: Guide, permissions: readonly string[] | undefined): GuideTask[] {
  return guide.tasks.filter((task) => !task.permission || (permissions ?? []).includes(task.permission) || (permissions ?? []).includes('*'));
}

export function guideForPath(pathname: string): Guide | null {
  const match = pathname.match(/^\/(admin|employer|employee|auditor|verifier)(\/|$)/);
  return match ? GUIDES[match[1] as GuideRole] : null;
}
