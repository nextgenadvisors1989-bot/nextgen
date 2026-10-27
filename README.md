# ComplianceOS

Enterprise **Compliance, Audit, HR, Payroll, Document, CMS, Reporting and Workflow**
platform for Indian establishments — built with Next.js (App Router), TypeScript,
Tailwind CSS and **MySQL via raw SQL (`mysql2/promise`)**. No ORM is used anywhere.

The platform serves five workspaces behind one database:

| Workspace | Route prefix | Who uses it |
|---|---|---|
| Admin | `/admin` | Platform administrators — employers, employees, auditors, audit assignment, compliance register, payroll oversight, CMS, settings, logs |
| Auditor | `/auditor` | Empanelled auditors — assigned audits, dynamic audit forms, drafts, submissions, reports |
| Employer | `/employer` | Client HR teams — company profile, units, departments, employees, attendance, leave, salary structures, payroll runs/payslips/downloads, documents |
| Employee | `/employee` | Employees — profile, personal file, attendance, leave, payslips, documents |
| Verifier | `/verifier` | Independent verifiers — report review, versions, comments, approve / reject / return |

A public marketing site (home, about, services, acts & compliance, resources, reports,
contact, terms, privacy) is served from the same application.

---

## 1. Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create the database and a dedicated user (MySQL/MariaDB)
sudo mysql -e "CREATE DATABASE IF NOT EXISTS compliance_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER IF NOT EXISTS 'compliance_app'@'%' IDENTIFIED BY 'change-me#2026';"
sudo mysql -e "GRANT ALL PRIVILEGES ON compliance_platform.* TO 'compliance_app'@'%'; FLUSH PRIVILEGES;"

# 3. Configure the environment
cp .env.example .env      # then edit DB_* , SESSION_SECRET and ENCRYPTION_KEY
                          # quote any password containing # , e.g. DB_PASSWORD="change-me#2026"

# 4. Create the schema and seed reference data
npm run db:migrate        # applies database/migrations/001…026
npm run db:seed           # roles, permissions, settings, checklist items, payroll heads, leave types, admin user

# 5. Create your own administrator (or use the seeded one below)
npm run create:admin -- --email you@company.com --name "Your Name" --role super_admin

# 6. Run it (the fast production build; builds first when needed)
npm run serve             # http://localhost:3001
```

### Seeded administrator

`npm run db:seed` creates **admin@complianceos.local / Admin@2026** (username `superadmin`)
flagged for a mandatory password change at first sign-in.

> **Change or replace this account before exposing the application to any network you
> do not control.** Either sign in once and change the password, or delete the row after
> creating your own administrator with `npm run create:admin`.

### Demo data for flow testing

```bash
npm run db:migrate            # the database must be on the latest migration (the app expects 001...026)
npm run db:sync-permissions   # re-syncs roles/permissions from code WITHOUT touching reference data
npm run create:admin -- --email demo.admin@complianceos.local --name "Demo Super Admin" --password 'Admin@2026' --role super_admin
npm run db:demo               # fills every panel with realistic data through the real APIs (app must be running)
```

`scripts/seed-demo.py` is idempotent (records are looked up before they are created) and can run one stage at a
time: `python scripts/seed-demo.py people documents compliance audits modules payroll calendar cms`.
Point it at another port with `SEED_BASE=http://localhost:3001`.

| Role | Login | Password |
|---|---|---|
| Super admin (demo) | `demo.admin@complianceos.local` | `Admin@2026` |
| Admin | `operations.admin@demo.complianceos.local` | `Admin@2026` |
| Employer (Sri Balaji Textiles) | `balaji.hr@demo.complianceos.local` | `Employer@2026` |
| Employer (Kaveri Engineering) | `kaveri.hr@demo.complianceos.local` | `Employer@2026` |
| Employer (Greenfield Foods) | `greenfield.hr@demo.complianceos.local` | `Employer@2026` |
| Auditors | `priya.auditor@`, `karthik.auditor@`, `deepa.auditor@`, `anand.auditor@demo.complianceos.local` | `Auditor@2026` |
| Verifiers | `verifier.test@complianceos.local`, `senior.verifier@demo.complianceos.local` | `Verifier@2026` |
| Employees | `<firstname.lastname.NNN>@emp.demo.complianceos.local` (see Admin > Users) | `Employee@2026` |

The seed covers 4 employers with units and departments, ~30 employees with full personal files, uploaded PDFs,
compliance documents in every expiry state, 9 audits across the whole report lifecycle (draft, submitted, under review,
changes requested, approved) with verifier decisions and generated PDFs, five dynamic modules (audit, assessment, risk,
study, work permit) with submissions, salary structures, attendance, leave, payroll runs and payslips, bonus / gratuity /
settlement registers, holidays and calendar events, CMS pages / resources / media and contact enquiries.

### Auditor types and their audit forms

Each auditor type (Water, Environmental, Energy and GHG, Safety, Fire Safety, Statutory and Legal, Social Compliance, Labour and Payroll,
Textile Standards ...) owns its own set of audit forms. **Admin > Auditors > Auditor Types > "Audit forms"** ticks which form modules a type
works with; an auditor then sees only the forms of their own type (and a direct URL to another type's form is refused).

The forms themselves are ordinary dynamic modules, so an administrator builds and edits them in **Dynamic Modules** (titles, sections, field
types, options, formulas, tables, PDF output). `python scripts/seed-demo.py forms` loads 46 ready-made forms taken from the client documents
(water, ETP, GHG, safety, fire, legal registers, WRAP, payroll, F&F settlement, GOTS / GRS / OCS / RCS / RWS checklists, compliance calendars
and calculators) - definitions live in `scripts/forms_catalogue*.py`. `python scripts/seed-demo.py library` files the client PDFs and images
into **Admin > CMS > Resources / Media Library** with categories, so they can be re-titled, replaced, published or hidden.

### CAPAR reports (Corrective Action Plan Acknowledgement Report)

After auditing a facility, an auditor writes a CAPAR in **Auditor > CAPAR Reports**. The Act and Rule PDFs are uploaded once through the CMS
(Resources); the auditor reads them and types the Act / Rule a finding falls under, so nothing is auto-filled from a rule library.

| Step | Who | What happens |
|---|---|---|
| Start | Auditor | Pick the company (and unit, optional audit assignment, verifier). Facility, representative and firm are prefilled and editable. |
| Findings | Auditor | One row per finding under a category: Act / Rule, minimum requirement, local-law clause, what was found, non-compliance photo, root cause, action plan, timeline, status, evidence. A row can also be "No Violation". |
| Submit | Auditor | Needs a verifier, an audit date and a description on every violation. The report then locks. |
| Verify | Verifier | Marks every row Eligible or Not Eligible (a reason is required for Not Eligible), then approves, or returns it with comments. A returned report unlocks; edited rows go back to "not verified". |
| Final | Everyone | An approved report is final. The employer sees it (without Not Eligible rows) in **Employer > CAPAR Reports**; an administrator can reopen it. |

* **Categories** (Business Practices, Fire Safety, Chemical Management ...) are edited in **Admin > CAPAR Reports > Categories**: add, rename, reorder, switch off.
  A heading that findings already use is switched off instead of deleted, so approved reports keep their wording.
* **PDF** (`/api/pdf/capar/<id>`) follows the third-party layout: letterhead, facility grid, a "No Violation / n violations" summary per category,
  the findings with photos, the closing statement and signature blocks. An approved report prints only Eligible rows; anything earlier prints all rows,
  tagged, with "NOT FINAL" in the header.
* **Letterhead and logo**: upload them once in **Admin > Settings > Company Settings** (the logo, and a letterhead banner); an auditor can override either
  on a single report. Without a letterhead the PDF prints the logo and company name.
* Access is scoped by role in the API: auditors see their own reports, verifiers the ones assigned to them, employers approved reports about their company.
* `python scripts/seed-demo.py capar` creates five demo reports (approved, under review, submitted, returned, draft); `python scripts/verify-capar.py`
  runs the full lifecycle against the running server (96 checks, including role isolation and the PDF).

### Groundwater NOC and the water meter log

A groundwater NOC is the permission a company holds to draw a stated quantity of water a day (for example 100,000 litres, domestic use) on
conditions such as a sealed flow meter, monthly drawal statements and renewal every three years. **Auditor (Water type) > Groundwater NOC**,
**Admin > Acts & Compliance > Groundwater NOC** and **Employer > Groundwater NOC** (read-only):

* **Who**: only auditors of the *Water* auditor type and administrators can record or change anything; a non-water auditor is refused by the API. An
  employer reads its own company's NOC, conditions, usage and PDF, and nobody else's.
* **NOC details**: number, authority, issue / expiry, approved quantity in litres a day (split domestic / gardening / other), well and pump details,
  and the NOC letter. Every NOC is mirrored into **Legal Register** as an *Approval* document, so its expiry is reminded like any other licence; the
  register also gained a *Form* document type.
* **Conditions**: "Add the 18 standard conditions" copies the usual Water Resources Department conditions (`lib/water/noc-conditions.ts`); the auditor
  ticks each one Compliant / Non-Compliant / Not Applicable with a remark on every visit, and can add, edit or remove conditions.
* **Meters and readings**: add the borewell meter (it counts toward the NOC limit) and the uses of that water (RO feed, canteen, toilets ...). A reading is
  the cumulative figure on the meter; it may not be lower than the previous one unless "Meter reset" is ticked, nor dated in the future.
* **Usage vs limit** (`lib/water/usage.ts`, unit-tested by `npx tsx scripts/test-water-usage.ts`): the water between two readings is spread evenly over
  the days between them; the system shows kilolitres a day for the last 30 days, the whole record and every month against the approved quantity
  (Within limit / Near limit from 90 percent / Over limit above it). Several source meters are added day by day. There is no automatic meter link.
* **PDF** (`/api/pdf/water-noc/<id>`): the NOC, the usage table, the conditions with status and remarks, and the meters.
* `python scripts/seed-demo.py water` creates two demo NOCs with about 20 weeks of readings; `python scripts/verify-water-noc.py` runs 80+ checks
  (access, validation, usage maths through the API, legal-register mirror, file access, PDF).

### Step 3 forms: more audit types, assessments, risk, study and permit forms

`python scripts/seed-demo.py forms` (re-runnable) adds, from the client's lists, these form modules (all editable in the form builder) and maps each to its
auditor types: STP and CETP functionality assessments, Environmental Compliance Audit, TSDF Audit, Environmental Statement (Form V), Energy Audit, GHG Inventory
Verification, Food Safety Audit, HACCP Study, Water / Waste / Energy Risk Assessments, and six work permits (Work at Height, Lifting Operation, Cold Work, Confined
Space Entry, Electrical Isolation (LOTO), Excavation). Two new auditor types, **Food Safety (FOOD)** and **Electrical Safety (ELEC)**, each with a demo login.
The HAZOP worksheet is now a *Study*.

* **ETP Functionality Assessment** now follows the H&M layout: design (1.1), process control (2.1-2.2) and competence (3.1-3.5) questions with observations,
  and a findings / corrective action plan table. The grade is calculated: **Red** if the design does not suit the load or the ETP is not operated, **Green** if
  at least 6 of the 7 operation and competence points are met, otherwise **Yellow**. A calculated field can carry options, so the number prints as its word
  (on screen and in the PDF).
* `python scripts/verify-step3-forms.py` runs 111 checks (modules, types, auditor visibility, fill / submit / PDF for every form, the five grade cases).

### Step 4: payslips, wage register, personal file, employee workday

* **PDF fonts (fixed).** The bundled Noto fonts used to be stubs (no rupee sign, no Tamil letters), so every "bilingual" PDF printed boxes for Tamil. `lib/pdf/fonts/`
  now holds the real Noto Sans and Noto Sans Tamil (SIL OFL, see `lib/pdf/fonts/README.txt`). Every PDF in the app benefits.
* **Two payslip formats.** The default is the client's **Service Card cum Payslip** (Form 25 B, 15, 12, VI, Tamil Nadu Minimum Wages Rule 27(2)): one A4 page,
  every caption in English and Tamil, earnings / deductions / attendance side by side, CL and EL leave table, "Salary to pay" and the signature strip
  (`lib/pdf/payslip-service-card.ts`). Heads the payroll does not track print 0.00, as on the paper original. Add `?format=standard` to any payslip PDF
  URL for the detailed multi-section statement; the payslip pop-up has both buttons.
* **Wage register Rule 11(5).** `/api/pdf/payroll/wage-register/<runId>` is now the client's landscape register (wage details, worked days / hours, earnings,
  PF and ESI wages, deductions, net wages, page totals and signatures). `?format=detailed` gives the older two-table layout. Rates per shift are the month's
  head divided by paid days; PF and ESI wages are recovered from the contribution (12 % and 0.75 %). Button on the payroll run page.
* **Personal file documents** (Employee > Personal File tab, admin and employer): checklist cover sheet, appointment order, confirmation letter, service record,
  Gratuity Form F, EPF Form 2, EPF Form 11, wage acceptance through bank, salary and wages revision letter and the Tamil affirmative statement, each filled from the
  employee record (`/api/pdf/employee-document/<id>?type=...`). The 16-item checklist now carries the client's own cover-sheet contents (migration 030).
  Real personal data was not imported from the sample photos; the layouts are filled from demo data.
* **Full and final settlement PDF** (`/api/pdf/full-final/<id>`): amounts payable, recoveries, net in words, acknowledgement; a draft prints as "NOT YET APPROVED".
  The employee can download their own once it is Approved or Paid.
* **Employee workday** (Employee > My Profile, migration 031): Active / Long leave / Exit, State local / Migrant and Permanent / Temporary / Contract
  (set on the employee form), wage today / this week / this month, working days and hours, check in / check out with work duration, a short **permission** request
  (up to 4 hours) that the employer approves under *Attendance > Permission Requests*, benefits, the month's deductions, PF / UAN / ESI, salary slip download
  and share (phone share sheet: WhatsApp or e-mail), and the full and final download. "Long leave" means an approved leave of 15 days or more covering today.
* **CTC chart** (Employer > Payroll > CTC Chart): shift wage plus PF 13 %, ESI 3.25 %, bonus 8.33 %, ex gratia 3.33 %, leave salary 5 %, gratuity 4.81 %
  (the headings of the client's sheet, all editable), cost of 8.5 to 10 hour days and the overtime rate. Nothing is saved.
* `python scripts/seed-demo.py workday` fills the new particulars and files two permission requests; `python scripts/verify-step4.py` runs the checks.

### Billing: quotations, GST tax invoices and receipts

**Admin > Billing > Quotations & Invoices** (and **Employer > Billing**, read-only for the client). The three documents come from the client's samples:
the *Service Price Quotation*, the *Tax Invoice* with its HSN / SAC summary, and the *Payment Acknowledgement / Receipt* (PDFs under `/api/pdf/billing/<quotation|invoice|receipt>/<id>`).

* **Service catalogue**: the ten service lines of the sample quotation, editable. A quotation copies the text and fee, so editing the catalogue never changes a document already sent.
* **Quotation**: Draft, Sent, then Accepted / Rejected / Expired. Editable until accepted. Totals (sub-total, GST, total) are worked out as you type. **Create invoice** turns an
  accepted quotation into a draft invoice (one line per service, buyer details copied).
* **Tax invoice**: a Draft has no number and can be edited or deleted. **Issue** gives it its `INV/<year>/<n>` number (allocated at issue, so the series has no gaps) and locks it. After
  that it is corrected by cancelling it (only while nothing is paid) and raising a new one. GST is **CGST + SGST** when the buyer's state is your own state code
  (Settings > Company > Billing, default 33) and **IGST** otherwise; the GSTIN, state code and PAN are validated. `lib/billing/gst.ts` holds the maths (`npx tsx scripts/test-gst.ts`).
* **Payments**: each payment recorded against an issued invoice makes a receipt (`RCT/...`) and moves the invoice to Part paid or Paid; it cannot exceed the balance, be future-dated or
  pre-date the invoice. The summary strip shows open quotations, outstanding, overdue and received this month.
* **Before you use it for real**: fill in *Settings > Company*: GSTIN, PAN, state, **bank name, account number and IFSC** (the demo values are placeholders), invoice terms and the
  default SAC code (998311, management consulting, is a suggestion: confirm the right code with your accountant). Invoice numbers are per calendar year, not per financial year.
* `python scripts/seed-demo.py billing` creates the client's sample (ABC Manufacturing, ten lines, total 64,900.00 through to Paid), a quotation waiting for an answer, an overdue invoice, an
  inter-state IGST invoice and two drafts. `python scripts/verify-billing.py` runs 84 checks.

### Public site menu (client's navigation sketch)

* **Menu order** follows the sketch: Home, About Us, Payroll / Compliance & IR, Social Security, Health & Safety, Environmental, Acts & Compliance, Compliance Calendar,
  Audit Structure, Service & Global Certification, Resources, Reports, Training & Capacity Building, Contact Us. On a phone the drawer lists exactly that; on a desktop the four
  management areas sit under one **Compliance** menu (with the sub-items from the sketch), and Audit Structure sits beside the calendar in the Acts & Compliance menu.
  The menu and footer link lists are still defined in `components/public/site-header.tsx` and `site-footer.tsx` (not editable in the CMS).
* **Seven new pages** (`/payroll-compliance-ir`, `/social-security-compliance`, `/health-safety-compliance`, `/environmental-compliance`, `/service-global-certification`,
  `/training-capacity-building`, `/audit-structure`) are ordinary CMS pages: edit the wording under *CMS > Pages*. `python scripts/seed-demo.py site` creates them (existing slugs are left alone).
  The text describes scope and what the platform does; it makes no claims about clients, results or accreditations, so review it before publishing widely.
* **Three tools**, one click from every page (top bar and drawer):
  * **Safety & Environmental Calculation** (`/calculators`): injury frequency, severity and incidence rates, risk score, emissions, effluent load, water balance, and EPF, ESI, gratuity, bonus
    and overtime. Statutory ceilings and emission factors are editable inputs (the factors shown are examples). Everything runs in the browser; nothing is stored. `npx tsx scripts/test-calculators.ts`.
  * **Quotation Generation** (`/quotation`): a visitor ticks services from the billing catalogue and describes the plant; the request lands in *Contact Enquiries* (type "sales"). **Fees are not shown
    publicly**: the priced quotation is prepared in Admin > Billing. If you want public self-service pricing, that is a business decision to make first.
  * **Bill Generation** (`/bill-generation`): explains quotation > invoice > receipt and sends clients to *Billing* in their portal.
* `node scripts/verify-site.mjs` checks the pages, the header at six widths, every menu link, the drawer order, the calculators and the quotation request (needs the Playwright variables used by the other browser scripts).

### Checking the whole app

| Command | What it checks |
|---|---|
| `python scripts/check-links.py` | Every internal link, redirect and notification `actionUrl` resolves to a real page |
| `python scripts/smoke-api.py` | Calls every parameter-free GET endpoint as its own role and flags any 5xx (missing column, SQL error) |
| `python scripts/smoke-panels.py` | Opens every sidebar destination of every panel |
| `npm run audit:responsive` | Headless Chrome walks every page at phone / tablet / laptop width and reports sideways spill |
| `npm run verify:*` | The per-module acceptance suites. Set `VERIFY_ADMIN_EMAIL` / `VERIFY_ADMIN_PASSWORD` if your administrator is not the seeded one |

### Speed

`npm run dev` compiles every route on first visit (tens of seconds each on a small machine), which makes navigation feel slow. For
daily use run `npm run serve`: it builds the production version when the source has changed and then starts it (about 0.3 s a page).
Use `npm run dev` only while editing code, and never against the same `.next` folder as a production build. The signed-in identity is cached for ten seconds per session
(`lib/auth/auth-cache.ts`) and dropped immediately by any write that touches users, roles, permissions or sessions.

### Added in phase 7

- **Quotation**: the document icon in the admin header opens a quick generator; the PDF is the premium layout (`lib/pdf/quotation-premium.ts`). Branding, default inclusions, notes and payment terms are Settings > Billing.
- **Designation Master**: `/admin/designations` (shared master) and `/employer/designations` (own rows); the employee form uses the picker.
- **Factory Profile**: `/employer/factory-profile`, and `/admin/employers/<id>/factory-profile` for administrators.

### Added in phase 8 (CAPAR)

- **Act library**: Compliance > Acts > an Act > "Chapters & sections" (`act_provisions`, `act_provision_amendments`). The CAPAR row searches it (`/api/capar/lookups?type=provisions`).
- **CAPAR item form**: item status, compliance, recommendation, assessment and the auditor sign-off (migration 037).
- **Audit Documents**: `/employer/audit-documents` (fill and submit), `/auditor/audit-documents` (download the pack), `/admin/audit-documents` (checklist and which sections each auditor gets), `/admin/employers/<id>/audit-documents`. API `/api/evidence/**`, PDF `/api/pdf/evidence-pack/<submissionId>`. An auditor must download the latest pack before starting a CAPAR for that company.

---

## 2. npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server on `0.0.0.0:3001` |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:seed-designations` | Loads the Designation Master (about 1,000 designations) from `scripts/fixtures/designations.json`; safe to re-run. `npm run parse:designations` rebuilds that file from the client document |
| `npm run db:seed-evidence` | Loads the Audit Documents checklist from `scripts/fixtures/evidence-checklist.json` and gives every auditor every section; safe to re-run. `npm run parse:evidence "<docx>"` rebuilds that file |
| `npm run typecheck` | `tsc --noEmit` across the whole codebase |
| `npm run db:migrate` | Applies every file in `database/migrations` in order, recording each in `schema_migrations` |
| `npm run db:seed` | Applies every file in `database/seeds`; idempotent and re-runnable |
| `npm run db:reset -- --yes` | **Destructive.** Drops all tables and rebuilds from migrations + seeds (guarded by name patterns; `--force` to override) |
| `npm run create:admin -- --email … --name … [--role …]` | Creates or resets an administrator; generates a strong temporary password when `--password` is omitted |
| `npm run send:reminders` | Runs the compliance-expiry and audit-due reminder jobs (cron-friendly) |
| `npm run backup:db [-- --keep 30 --output ./storage/backups]` | `mysqldump` backup with retention pruning, recorded in `backup_history` |
| `npm run verify:employees` | End-to-end HTTP acceptance run for the employee module, the document vault and the personal-file PDF (requires the server on :3001) |
| `npm run check:pdf [-- 12]` | Renders an employee personal file in-process and asserts the ≤12 page layout limit |
| `npm run verify:assignments` | End-to-end HTTP acceptance run for audit assignments — numbering, calendar entries, notifications, filters, reassign, cancel, delete guard, RBAC and pages (requires the server on :3001) |
| `npm run verify:auditors` | End-to-end HTTP acceptance run for the auditor register and auditor types (requires the server on :3001) |
| `npm run verify:users` | End-to-end HTTP acceptance run for the access model — register filters, provisioning with credentials + activation, the account lifecycle, RBAC refusals by URL, role CRUD guard rails, the permission matrix and its bulk save, and the nine administration screens (146 checks) |
| `npm run verify:settings` | End-to-end HTTP acceptance run for the settings module — per-panel refusals (including a freshly provisioned employee login), catalogue integrity, validation refusals, AES-256-GCM secrets with keep/clear semantics, the audit trail, real test sends into the three `*_logs` tables, the delivery-log filters, the scheduled-job register, real `mysqldump` backups with history/detail/removal and the logo upload (231 checks) |
| `npm run verify:reports` | End-to-end HTTP acceptance run for the whole audit-report lifecycle: draft → submit (revision + PDF + verifier queue) → return for correction → resubmit → approve → archive/delete/reopen, plus filters, version diff, PDF text and the admin analytics screen with its charts, the verifier pages, and its own fixtures swept (70 checks) |
| `npm run verify:cms` | End-to-end HTTP acceptance run for the CMS — access control by URL and by role, the slug catalogue, page creation and slug collisions, the block builder, the publishing state machine (publish/unpublish/schedule/archive/restore), scheduled promotion, bulk actions with their refusals, the media library through the vault, resources with counted downloads, the public site as an anonymous visitor sees it, the activity trail and every screen (203 checks) |
| `npm run verify:payroll` | End-to-end HTTP acceptance run for the payroll & HR module — access control by URL and by role, a company and its employees created through the real APIs, salary structures with their revision chain and cross-tenant refusals, a month of attendance marked in bulk and corrected, leave types, accrual, application, approval/refusal/withdrawal and the ledger maths, the payroll engine's arithmetic (proration, half days, overtime, PF/ESI/PT/LWF/TDS, net in words), the run lifecycle with its state refusals, the pay register with its CSV and the three bank-file formats, bulk payment marking, publication with the three delivery logs, the bonus/gratuity/settlement registers, the bilingual payslip PDF, the three statutory registers as PDFs — the wage register for a run, the attendance register for a month and the leave register for a year, each with its scope refusals (a company reads its own and gets a 404 for anyone else's) — every payroll screen for every role, the activity trail and clean-up (258 checks) |
| `npm run verify:selfservice` | End-to-end HTTP acceptance run for the employer and employee self-service panels — anonymous and wrong-panel refusals, the company reading and self-editing its own profile with the platform-controlled fields refused by name, its units and departments with `409 HAS_EMPLOYEES` and cross-tenant `404`s, hiring staff through the real wizard and activating the credentials it issues, the personal-file child registers, the employee's own profile with its refused fields, document upload/download/withdraw with the verified-document guard, the service record, the company's audits and reports, every new page for its own role, the company's own report screen with the verifier's decision on it, the activity trail and clean-up (169 checks) |
| `npm run verify:calendar` | End-to-end HTTP acceptance run for the calendar & holiday master — access control by URL and by role, the event form pickers, the month overview and the five-register merged agenda, event creation with its validation refusals and module-owned type guards, editing with the no-op refusal and reminder re-arm, the holiday register with duplicate refusal and filters, one-click national holidays, the working-day maths (including a holiday that lands on the weekly off), reminders dispatched exactly once, auditor scoping proven against a real registered auditor, the employer and employee reads, the activity trail, every screen and clean-up (163 checks) |
| `python3 scripts/pdf-text.py <file.pdf>` | Prints the text a generated PDF actually renders (resolves the embedded Noto Sans subsets through their `/ToUnicode` maps) — used by the acceptance scripts to assert on headers/footers |

Cron example:

```cron
0 8 * * *  cd /srv/compliance-platform && npm run send:reminders >> logs/reminders.log 2>&1
30 2 * * * cd /srv/compliance-platform && npm run backup:db    >> logs/backup.log    2>&1
```

---

## 3. Architecture

```
app/
  (public)/            marketing site (Home, About, Services, Acts, Resources, Reports, Contact, Terms, Privacy)
                       + the CMS read paths: any published page at /[slug], /reports/[slug], /resources, /resources/[slug]
  (auth)/              login, forgot-password, reset-password, change-password, activate-account
  (admin)/admin/       admin panel (24 modules)
  (auditor)/auditor/   auditor panel
  (employer)/employer/ employer panel
  (employee)/employee/ employee self-service
  (verifier)/verifier/ verifier panel
  api/                 REST API (auth, admin, auditor, employer, employee, verifier, files, notifications, pdf, integrations)
components/            ui primitives, navigation, layouts, dashboards, feature components
lib/
  db/                  mysql2 pool, query helpers, transactions, SQL-file runner
  auth/                password hashing, sessions (JWT + DB), RBAC, permission checks, panel context
  notifications/       templates (email/SMS/WhatsApp), notification service, reminder jobs
  integrations/        SMTP/SendGrid email, Twilio/MSG91 SMS, Meta/Twilio WhatsApp, AES-256-GCM secret storage
  validations/         Zod schemas per module
  utils/               dates, formatting, pagination, filters, export, API response/error envelopes
repositories/          parameterised SQL, one file per aggregate
services/              business rules, transactions, logging, notifications
lib/settings/          the settings catalogue: every group, key, type and screen in one place
lib/validations/cms.validation.ts  the CMS catalogue: page types, templates, the 18 block types and their item fields, reserved slugs
lib/validations/calendar.validation.ts  the calendar catalogue: the 13 event types (and which of them are hand-authorable), their colours, statuses, priorities, visibilities, the holiday types, the national holidays and the reminder lead times
types/                 domain types shared by server and client
database/
  migrations/          numbered DDL (001…026)
  seeds/               reference data
  schema-documentation/ generated schema notes
scripts/               migration, seed, admin, reminder, backup and reset runners
middleware.ts          edge route guard: session verification, CSRF, panel routing
```

### Request lifecycle

1. **middleware.ts** verifies the signed session cookie at the edge, enforces the CSRF
   double-submit token on every mutating `/api/*` call, bounces signed-in users away
   from the auth pages, and redirects unauthenticated panel requests to
   `/login?next=…`.
2. **Route handler** calls `requireAllPermissions([...])`, validates input with Zod, and
   delegates to a service.
3. **Service** applies business rules and writes activity-log and audit-trail rows.
4. **Repository** executes parameterised SQL through the shared connection pool.
5. **Response** is normalised by `lib/utils/api-response.ts` — Zod errors become
   `422` with per-field messages, duplicates become `409`, FK violations `400`,
   authorisation failures `403`.

---

## 4. Security

* **No ORM, no string-interpolated SQL** — every value is bound through `mysql2` parameters;
  dynamic identifiers (sort columns, limits) are validated against allow-lists.
* **Passwords** are hashed with bcrypt; policy is 8+ characters with upper, lower,
  digit and special character. Repeated failures lock the account for 15 minutes.
* **Sessions** are signed JWTs stored `HttpOnly`, backed by a `sessions` row holding a
  SHA-256 hash of the nonce, so a stolen cookie can be revoked server-side.
* **CSRF** is enforced by a double-submit token (`cos_csrf` cookie echoed in
  `X-CSRF-Token`) for every non-GET API request.
* **XSS** — user content is escaped (`escapeHtml`) or sanitised (`sanitizeRichText`)
  before it reaches HTML or a PDF.
* **Uploads** are validated for extension, MIME type and size, checksummed with
  SHA-256 and versioned rather than overwritten.
* **Integration secrets** (SMTP password, SMS/WhatsApp tokens) are encrypted at rest
  with AES-256-GCM using `ENCRYPTION_KEY`.
* **Auditability** — every create/update/delete/approval writes an `activity_logs` row,
  and field-level changes write `audit_trails` rows with old and new values.

---

## 5. Statutory configuration

`lib/utils/constants.ts` holds the defaults used by the payroll engine:
PF 12% of basic with a ₹15,000 ceiling, ESI 0.75% (employee) / 3.25% (employer) up to
₹21,000, statutory bonus 8.33% capped at ₹7,000, gratuity 15/26 days after five years,
overtime at twice the ordinary rate and 26 working days per month. These are
configurable per employer from the payroll settings screen; review them after every
statutory amendment.

Reminder ladders are configured in `settings` and default to
`90, 60, 30, 15, 7, 1` days before a compliance document expires and `7, 3, 1` days
before an audit falls due.

---

## 6. Panels

Five workspaces share one API and one permission model. Each panel's routes are guarded twice — at
the page (`requirePanel`) and at the API (`requireApiPanel`), so a capability cannot be reached by
typing a URL.

| Panel | URL | Who signs in | What it does |
|---|---|---|---|
| Admin | `/admin/**` (24 modules, ~110 pages) | platform administrators | employers, employees, auditors, audit assignments and reports, the dynamic module engine, payroll oversight, compliance registers, documents, CMS, users/roles/permissions, settings, the four log screens and the dashboard |
| Auditor | `/auditor/**` | auditors | own assignment register, the draft/preview/submit audit workspace with the report PDF, assigned dynamic forms, reports, assessments, risks, studies, work permits, calendar, notifications |
| Verifier | `/verifier/**` | verification officers | the review queue with workload statistics, read-only report bundles, approve/reject/return with structured corrections, version compare, comments |
| **Employer** | `/employer/**` | company portal users | own profile (self-editable), units, departments, staff (hire with generated credentials, full personal file, edit), attendance and bulk upload, leave ledger, salary structures, the payroll office (run → calculate → approve → lock → pay → publish), payslips and downloads, compliance documents, audits and their reports, calendar, notifications, settings |
| **Employee** | `/employee/**` | employee self-service logins | my profile, personal details (self-editable contact/address/bank), employment details, service record, my documents (upload, download, withdraw), attendance, leave apply/status, payslips with the bilingual PDF download, calendar, notifications, settings |

Every panel is scoped by the session, not by the request body: an employer can only ever see its own
company (`employee.employer_id` in a payload is ignored), an employee's routes take no employee id at
all — the record comes from `getScoping()` — and an auditor's diary and register are pinned to their
own `auditors` row. Cross-tenant reads answer `404`, and the panels refuse each other's users with a
`30x` redirect.

---

## 7. Documentation

| Document | Contents |
|---|---|
| `README.md` | This file — setup, scripts, architecture, security |
| `docs/PROGRESS.md` | Module-by-module build status against the specification |
| `database/schema-documentation/` | Table-by-table schema notes |

---

## 8. Support

ComplianceOS support — support@complianceos.example · +91 44 4000 0000
(Monday to Saturday, 9:30 am – 6:30 pm IST)
