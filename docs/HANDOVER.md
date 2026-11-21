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
| Other pages of the website (About, Services …), downloadable resources, media | CMS → Pages / Resources / Media Library |
| Enquiries sent through the website form | CMS → **Contact Enquiries** |
| Acts and Rules (chapters, sections, sub-sections, amendments) shown on the public site and to auditors | Compliance → **Acts & Rules** |
| Employers, employees, auditors, verifiers, users, what each role may do | Organisation, Audit Operations, Administration menus |
| What is still sample or missing before launch | Content & System → **Go-live Checklist** |
| The emission factors the carbon calculation uses | Compliance → Data Management → **Emission Factors** |

The **footer lists** of services and Acts follow the Home Page blocks (change them once, both places update).

### Photo of the principal
Home Page → "Principal — photo and message" → Edit → *Choose photo* → Save. JPG, PNG or WebP up to 5 MB, a portrait works best.
Until a photo is added the page shows a monogram (the first letter of the name). Designation and message are blank until
the client writes them; nothing about the person is invented by the platform.

### Factory data (Data Management)
* The employer enters the factory's daily data in **Factory Data → Data Management**: 22 registers (purchase, raw material, stock, production, finished goods and
  dispatch, transport, water, ETP/STP, electricity, fuel, waste, GHG, material balance, CAPA, statutory compliance, incidents), each with the client's formulas.
  Day, week, month and financial-year (April–March) totals, the KPI dashboard, the material / water / waste balances and the Scope 1, 2 and 3 carbon footprint are
  worked out from those records. The employer verifies records; every correction is in the audit trail.
* An employee may enter records when the employer switches it on (employee → Login Account tab). Auditors and the administrator see any company read-only.
* **Emission factors are never pre-filled.** The administrator enters the client's official factors (value, unit, source, year, validity) and approves them;
  an activity without an approved factor is shown as "factor missing" and adds nothing. The Go-live Checklist says when none is approved.

### Auditors
Every auditor sees every audit, assessment, study and permit form and every company; nothing is handed to an auditor by the administrator.
Audit Assignments remain for scheduling (they fill in the date and unit and appear under "Assigned Audits"). The Groundwater NOC register is still kept
by water auditors only.

## 2. What still needs a developer

* The **header menus** (About, Compliance, Acts & Compliance, Services, Resources …) and the **footer "Quick links"** are
  fixed in code (`components/public/site-header.tsx`, `site-footer.tsx`); the pages they open are CMS pages and are editable.
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
4. Scripts that call the app API (`install-aa-forms.py`, `import-act.py`, `import-acts-list.py`) run **after** the restart, with
   `LIVE_ADMIN_EMAIL` and `LIVE_ADMIN_PASSWORD` exported in the same terminal.

Checks: `python scripts/verify-*.py` (each suite is independent; set `VERIFY_ADMIN_EMAIL`, `VERIFY_ADMIN_PASSWORD`,
`VERIFY_ADMIN_ID`, `VERIFY_ADMIN_NAME` for your demo administrator). Never stop or rebuild the server while a suite is running:
`verify-settings.py` rewrites the settings table and puts it back at the end.

## 5. Open items

* Data Management: the client's official emission factors must be entered before any carbon figure appears; attachments are photos/PDFs only.
* Auditor self-registration with a referral code and administrator approval is not built.
* Brevo (or other) SMTP key to be entered under Email Settings; the live administrator password to be changed.
* Marketing claims in the client's own wording (for example "Statutory Clearances Guaranteed with Zero Closure Notice
  Liability", "15+ years of zero-penalty compliance") should be confirmed by the client; they are editable on the Home Page.
