# Handover guide

Who can change what on the platform without a developer, what still needs one, and how a release goes live.
No passwords or keys are written here (the repository is public).

## 1. Day-to-day changes the client's staff make themselves

Everything below is done by an administrator, from the screen. Each place has a one-line explanation at the top, and every
panel has **Help & Guide** (sidebar, and the round "?" menu in the top bar) with step-by-step tasks.

| I want to change… | Where (administrator) |
|---|---|
| Words, numbers, links, services, directory lists, enquiry heading on the **home page**; hide a part of it; the **principal's photo, name, designation and message** (Kannan) | Content & System → CMS → **Home Page** |
| Company name, address, phones, e-mail, working hours, social links, GSTIN, bank details printed on invoices | Administration → Settings → **Company Settings** |
| The mail server that sends password resets, notices and reminders | Settings → **Email Settings** (SMS / WhatsApp likewise) |
| Backups (schedule, run now, history) | Settings → **Backup Settings** |
| **About Us** (the client's own text, with the Compliance, Safety and Environment Wings), the four compliance pages (Payroll & IR, Social Security, Health & Safety, Environmental), Services and every other page | CMS → **Pages**; the body is a Word-style editor (headings, bold, lists, tables; pasting from Word keeps the structure) |
| Downloadable resources (only files that do not need a sign-in are listed on the public Resources page), media | CMS → Resources / Media Library |
| Enquiries sent through the website form | CMS → **Contact Enquiries** |
| Acts and Rules (chapters, sections, sub-sections, amendments) shown on the public site and to auditors | Compliance → **Acts & Rules** |
| Employers, employees, auditors, verifiers, users, what each role may do | Organisation, Audit Operations, Administration menus |
| What is still sample or missing before launch | Content & System → **Go-live Checklist** |
| The emission factors the carbon calculation uses | Compliance → Data Management → **Emission Factors** |

The **footer lists** of services and Acts follow the Home Page blocks (change them once, both places update).

### Photo of the principal
The portrait stands in the **top banner** of the home page (name and designation under it) and again, small, beside the message further down.
Home Page → "Principal — photo and message" → Edit → *Choose photo* → Save. JPG, PNG or WebP up to 5 MB, a portrait works best.
Kannan's portrait ships with the site (`public/brand/kannan.jpg`), so it shows from the first deploy; a photo uploaded here replaces it. Designation and message are blank until
the client writes them; nothing about the person is invented by the platform.

### Factory data (Data Management)
* The employer enters the factory's daily data in **Factory Data → Data Management**: 22 registers (purchase, raw material, stock, production, finished goods and
  dispatch, transport, water, ETP/STP, electricity, fuel, waste, GHG, material balance, CAPA, statutory compliance, incidents), each with the client's formulas.
  Day, week, month and financial-year (April–March) totals, the KPI dashboard, the material / water / waste balances and the Scope 1, 2 and 3 carbon footprint are
  worked out from those records. The employer verifies records; every correction is in the audit trail.
* An employee may enter records when the employer switches it on (employee → Login Account tab). Auditors and the administrator see any company read-only.
* **Emission factors are never pre-filled.** The administrator enters the client's official factors (value, unit, source, year, validity) and approves them;
  an activity without an approved factor is shown as "factor missing" and adds nothing. The Go-live Checklist says when none is approved.

### Forms, permits and signatures
* The seven **Permit to Work** forms (Cold Work, Confined Space to Entry, Electrical (Isolation), Excavation, Hot Work, Lifting Operation, Work at Height) are the client's PTW file word for
  word, including its misspellings (for example "Danger/Waning Sign", "Arial lift", "utlities"): the client asked for no change of content. Fix a spelling in Compliance → Audit and Assessment → the form.
* **Form 3** (records of hazardous and other wastes) and **Form 4** (annual return) of the Hazardous and Other Wastes Rules 2016 sit under the Environmental Audit. The sample data of the
  client's filled files is not carried over.
* Every audit, assessment, risk, study, inspection and permit form ends with **Signatures**: auditor and verifier (name, drawn signature, date), the other members of the audit team and
  their signed sheets. Signatures are drawn with a mouse, stylus or finger. They are optional so a form can be saved before it is signed.
* An auditor can also be a verifier: give the same user both roles (Administration → Users → Edit). The person then sees both workspaces and a link between them. In the auditor workspace
  they act as an auditor, in the verifier workspace as a verifier; nobody verifies their own submission.

### Auditors
Every auditor sees every audit, assessment, study and permit form and every company; nothing is handed to an auditor by the administrator.
Audit Assignments remain for scheduling (they fill in the date and unit and appear under "Assigned Audits"). The Groundwater NOC register is still kept
by water auditors only.

## 2. What still needs a developer

* The **header menus** (About, Compliance, Services, Tools …) and the **footer "Quick links"** are
  fixed in code (`components/public/site-header.tsx`, `site-footer.tsx`); the pages they open are CMS pages and are editable. Every entry opens its own page or its own heading on a page
  (the heading ids come from `lib/utils/anchors.ts`): if you rename a heading in the CMS, the menu entry that points at it needs the new name in `site-header.tsx`.
* The wording of **Privacy Policy** and **Terms & Conditions** (`app/(public)/privacy-policy`, `terms-conditions`) is in code.
  Their company details come from Company Settings. When the text is revised, update `LEGAL_TEXT_REVISED` in
  `lib/utils/constants.ts` (it is a fixed date on purpose; it no longer shows "today").
* New kinds of home-page blocks, new emission-factor / GHG features, new roles.

## 3. Before real clients are given logins

Open **Go-live Checklist** (administrator). It reads the live data and lists, with a button to the right screen:
company details still showing sample values, GSTIN, e-mail sending, sample/demo accounts that are still active,
an administrator that still uses the published demo password, backups, social links that only point at the social
sites' home pages, the principal's photo.

The first database seed contained **sample company details** (an `.example` e-mail, a made-up GSTIN and CIN, "ComplianceOS
Technologies Private Limited"). They are ignored on public pages and e-mails, but invoices and PDFs print whatever is in
Company Settings, so enter the real details there.

## 4. Releasing a change (the developer)

1. Local: `npm run db:migrate` (if the release has migrations), `npm run serve -- --rebuild`, run the checks below.
2. Commit, then `git push origin main:compliance-platform`.
3. VPS (`/opt/compliance-platform`, service `complianceos`):
   `git pull origin compliance-platform && npm ci --include=dev && npm run db:migrate && npm run build && systemctl restart complianceos`
   (if `package-lock.json` blocks the pull: `git checkout -- package-lock.json`; if the 2 GB build is killed, add swap and use
   `NODE_OPTIONS=--max-old-space-size=1200 npm run build`).
4. Scripts that call the app API (`install-aa-forms.py`, `install-ptw-forms.py`, `import-act.py`, `import-acts-list.py`) run **after** the restart, with
   `LIVE_ADMIN_EMAIL` and `LIVE_ADMIN_PASSWORD` exported in the same terminal. Migrations 054-057 (TSDF audit name, About Us page, compliance page text, signature blocks) run with `npm run db:migrate`.
   `install-ptw-forms.py` never rebuilds a permit that somebody has already filled in (it lists it at the end).

Checks: `python scripts/verify-*.py` (each suite is independent; set `VERIFY_ADMIN_EMAIL`, `VERIFY_ADMIN_PASSWORD`,
`VERIFY_ADMIN_ID`, `VERIFY_ADMIN_NAME` for your demo administrator). Never stop or rebuild the server while a suite is running:
`verify-settings.py` rewrites the settings table and puts it back at the end.

## 4b. The demo for the client (one connected story)

`scripts/seed-client-demo.py` builds one company, **Demo Industries Private Limited (DEMO-001)**, and everything the roles do with it, through the site's own API:
an HR manager and three employees (payroll run for last month with published payslips), two auditors on the company (one of them is also a verifier: one login, both
workspaces), a separate verifier, a signed audit report with four site photographs, a Permit to Work with six drawn signatures, Form 3, five days of factory data entered
and verified by the employer, and a CAPAR report from the findings to the closing signatures. Every PDF is fetched at the end and its size printed. Run it after the
installers, with `LIVE_ADMIN_EMAIL`, `LIVE_ADMIN_PASSWORD` and `DEMO_PASSWORD` exported (the password is typed on the server, never stored in the repository).
It is safe to run again. The demo logins are listed by the Go-live Checklist; deactivate them before real clients are given theirs.
The site photographs are in `scripts/fixtures/demo-photos` (made with a local image model; empty scenes, no people).

## 5. Open items

* **Form 5** of the Environmental Audit is named in the client's list but no file was sent; "Environmental Risk Assessment" is shown as the Environmental Aspects and Impacts Register and
  "Environmental Compliance Report" as the Environmental Compliance Audit until the client says otherwise.
* The Audit and Assessment forms and the Water Audit Report are filled form by form; one **compiled final report** that merges the forms of several auditors into one document is not built.
* Data Management: the client's official emission factors must be entered before any carbon figure appears; attachments are photos/PDFs only.
* Auditor self-registration with a referral code and administrator approval is not built.
* Brevo (or other) SMTP key to be entered under Email Settings; the live administrator password to be changed.
* Marketing claims in the client's own wording (for example "Statutory Clearances Guaranteed with Zero Closure Notice
  Liability", "15+ years of zero-penalty compliance") should be confirmed by the client; they are editable on the Home Page.
