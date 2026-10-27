# Build progress against the specification

## Phase scoreboard

The specification's Part 7 defines **7 phases**. This is where each one stands right now.

| # | Phase | Scope in one line | Status | Complete |
|---|---|---|---|---|
| 1 | **Foundation** | DB + migrations + seeds, no-ORM data layer, auth, sessions, CSRF, RBAC, middleware, UI kit, navigation, 5 panel shells, layouts, notification/integration/reminder layers, scripts, public site, admin shell + employers module | Done and verified running | **100%** |
| 2 | **Core modules** | Admin employees / auditors / audit assignments / audit reports / compliance / files / users & roles / settings / CMS / calendar / payroll oversight, plus the auditor, verifier, employer and employee workspaces | **Done.** Every administrator module is live and verified, and the four non-admin workspaces are complete: the **employer self-service panel** (company profile with self-edit, units, departments, employees with hiring + credentials, audits, audit reports with the report screen and PDF, settings) and the **employee self-service panel** (my profile, personal details with self-edit, employment details, service record, documents with upload/withdraw, notifications, settings) — `npm run verify:selfservice` = 169 checks green, including cross-tenant 404s and the refused-field rules. The secondary **panel register pages** landed this round as well: every one of the 91 sidebar destinations across the five panels now resolves to a real screen, walked role by role by `scripts/smoke-panels.py` | **100%** |
| 3 | **Dynamic module engine** | Module & form builder (sections, fields, options, table fields), submissions with draft/resume/submit, per-module PDF layouts, role/user assignment | Done and verified end to end (builder + renderer + all panels) | **100%** |
| 4 | **HR & payroll depth** | Attendance, leave (types/ledger/applications), salary structures, payroll run engine (PF/ESI/PT/LWF/TDS), bilingual payslips, bonus, gratuity, full & final settlement | Done and verified end to end (admin oversight, employer payroll office and employee self-service) | **100%** |
| 5 | **Documents, CMS & reporting** | File manager with versioning, employee document vault, PDF engine (employee PDF, audit report, payslip, registers), CMS publishing to the public site, reports & charts, integration settings + test buttons | **Done.** The file manager/versioning ships with Phase 2, the **integration settings screens with working test buttons, delivery logs and real SMTP/Twilio/MSG91/Meta configuration** shipped with the settings module, the **CMS publishes to the public site** (pages and blocks at `/…`, reports at `/reports/…`, resources at `/resources`), the **employee document vault** ships on `/employee/documents` (category-wise uploads with the employer's verification state, self-service suite 169/169), and the **PDF engine prints everything the spec asks for**: the employee personal file (verified 4 pages / 23.6 kB / 221 ms, `npm run check:pdf`), the audit report PDF, the bilingual payslip (2 pages, Tamil head names embedded), the **three statutory payroll registers** — wage register for a run, attendance register for a month (P/A/L/HD/H/WO grid over two fortnight bands), leave register for a year — and the **compliance register** (`/api/pdf/compliance-register`, per-establishment or platform-wide, derived Valid/Expiring/Expired status), each with its scope refusals and activity-trail entry (samples in `docs/samples/`). **Reports & analytics is complete**: `/admin/reports` carries five charts — compliance score trend, findings by severity, payroll disbursement trend, workforce by department, compliance register status — all server-fed from live aggregates; `/employer/audit-reports` carries the establishment's own score trend, severity breakdown and the read-only report detail page | **100%** |
| 6 | **Advanced** | Calendar/meetings integration, risk assessment, safety/environmental studies, assessment reports, work permits & contractor compliance, notification centre + preferences, bulk import/export | **Done.** The calendar module carries event CRUD, module-owned events, the holiday master with national-year generation and working-day maths, and reminders (163 checks); assessments, risk registers, studies (HAZOP/HACCP), work permits and — new this round — **contractor compliance** run as the five named families of the dynamic module engine with their admin registers and auditor screens; every panel has its notifications centre with per-category channel preferences and the template manager; and the **employee CSV import** (template download, per-row wizard-grade validation, skipped-row reporting) completed the bulk-import side beside the month attendance sheet | **100%** |
| 7 | **Testing & deployment** | Full per-role acceptance walkthrough, responsive verification (1920/1366/768/375), performance targets (<3s page, <500ms API, <5s PDF), deployment guide, backups/cron | Nearly done — 16 verification suites (2,400+ checks, all five roles) run green against the production build; performance measured (pages 40–70 ms, APIs ~20 ms, registers <100 ms); `docs/DEPLOYMENT.md` ships the full prod recipe incl. swap-aware build, systemd, TLS, cron and rollback; backup + reminder runners verified. Only the responsive viewport pass remains — it needs a real browser | **~90%** |

**Overall: 6 of 7 phases complete — roughly 86% by phase count, closer to 95% weighted by module count. Only Phase 7 (testing & deployment) remains, and its verification half already runs: 16 suites, 2,400+ checks green against the production build.**

Phase 4 (HR & payroll) closed last round: the payroll suite runs **258 checks green** against the
production build, the bilingual payslip renders as a verified two-page document with the Tamil
head names embedded in the font, and the establishment now prints the **three registers an inspector
asks for** — wage, attendance and leave — straight from the data the payroll engine consumes.

This round closed **Phase 2**: the employer and employee self-service panels are built end to end and
verified by a suite (`npm run verify:selfservice`, **169 checks green**) that hires staff through
the real wizard, activates the credentials it issues, edits the company's own profile, drives the
personal-file registers, uploads and withdraws an employee document, files a report and has the
verifier decide it, and proves every cross-tenant read answers `404`. Every sidebar destination in all
five panels now renders — `scripts/smoke-panels.py` walks the admin, auditor, verifier and employer
menus (91 pages) and `scripts/smoke-employee-panel.py` hires a real employee, activates the login and
walks the employee menu (13 pages), sweeping its fixture afterwards.

### What "Phase 2 = 96%" actually means

Finished so far inside Phase 2:

* Admin **Employers** module - list, filters, sorting, pagination, CSV export, create/edit forms, detail page with 7 tabs (overview, units, departments, employees, audits, compliance, portal users), unit + department CRUD, portal-login provisioning with credential email, soft delete guarded by open audits, activity + audit-trail logging.
* **Five panel shells and dashboards** - admin, auditor, employer, employee and verifier, each running scoped SQL against real data.
* **Admin Employees** module - list with 9 filters, sorting, pagination and CSV export; the 14-step onboarding wizard (personal, contact, employment, wage, statutory, bank, nominee, qualifications, experience, dependents, references, interview, checklist, account); a 10-tab detail page with sub-record CRUD, the 16-item personal-file checklist, the document register and portal-login provisioning with a credential email; soft delete that also disables the login; employee numbers generated as `EMP/<year>/<serial>`; gross salary always derived from the wage heads; activity + audit-trail logging on every mutation.
* **Admin Auditors** module - register with 8 filters (type, specialisation, employer, state, availability, status, dates), sorting, pagination and CSV export; the auditor form covering identity, accreditation, address, banking, photograph and certificate uploads; auditor codes generated as `AUDT/<year>/<serial>`; an auditor-portal login provisioned at registration or later, with the credentials returned once and emailed with an activation link; a 5-tab detail page (overview, assignments, employers audited, documents, portal login) with live workload counters, rating capture, document vault attachments, soft delete (refused while open assignments exist) and restore.
* **Auditor Types register** - CRUD over the eight seeded categories plus new ones, each showing how many auditors are registered under it; archiving is refused while auditors still reference the type.
* **Document vault API** - `POST /api/files/upload`, `GET/PUT/DELETE /api/files/:id`, `GET /api/files/:id/download`: MIME + extension allow-list, 25 MB ceiling, server-generated stored names, SHA-256 checksums verified on read, immutable version chains (`file_versions`), download accounting, soft delete, and panel-aware access (admin/auditor/verifier see all, employers only their own entity, employees only their own record and payslips).
* **Admin Audit Assignments** module - the register that drives the whole audit workflow: 10 filters (status, type, priority, employer, auditor, verifier, due window, date range) with sorting, pagination, CSV export and six live stat cards; a create/edit form with the employer to unit to department cascade, auditor pickers annotated with live capacity, optional dynamic-module link and TAT-suggested due date, scope, instructions, fee and the notification switches; a five-tab detail page (overview, progress, documents, history, report) with reassign, cancel and delete actions, each requiring a reason that reaches the auditor; bulk assignment reusing one brief across several units. Creation allocates `AUD/<year>/<serial>`, writes the audit and closing-meeting rows into `calendar_events`, notifies the auditor (in-app + email + SMS + WhatsApp), the verifier, the employer's portal users and the administrators, and records activity log plus audit trail. `npm run verify:assignments` = 29/29.
* **PDF engine** - `lib/pdf` with the shared letterhead/section/table/checklist/signature layout kit, Noto Sans + Noto Sans Tamil fonts shipped with the repository, and the **Employee Personal File** template (Tamil title, masked Aadhaar and bank numbers, bilingual wage-head table, checklist completeness, report-number footer) served by `GET /api/pdf/employee/:id` with a verified 4-page output for a fully populated record (limit: 12).
* **Admin Audit Reports** module - the register and the complete report lifecycle. List with 7 filters (status, type, employer, auditor, verifier, score band, pending-verification), sorting, pagination, CSV export and ten live stat cards; a report form carrying the audit title, period, dates, executive summary, methodology, section-wise scorecard, structured findings register (severity, clause, evidence, recommendation, status), observations, recommendations and regulatory references; a 6-tab detail page (overview, findings, scorecard, versions, comments, verification) with the version chain, field-level version diff, PDF download/regeneration, verifier assignment and archive/delete/reopen; and the verifier review screen with structured correction requests. Submitting files a new revision *and* the PDF that belongs to it, moves the assignment to `Submitted` (progress 90%), queues the verifier and emails the auditor, verifier and administrators; a verifier decision files a decision revision, writes the `verifier_comments` row, closes or reopens the queue and moves the assignment to `Approved`/`Rejected`/`Changes Requested` (100%/75% progress).
* **Verifier workspace** - queue with five stat cards (pending, in review, completed, overdue, average turnaround), the read-only report bundle with ownership checks, and the review screen that approves, rejects or returns a report with structured corrections, notify switches and the suggested next-audit date. Versions and the comment thread are visible side by side with the document.
* **Auditor workspace** (`app/(auditor)/auditor/audits/**`) - the auditor's own end-to-end journey. The register (`/auditor/audits`) lists only the signed-in auditor's assignments with 6 stat cards (total, in progress, submitted, overdue, due this week, high priority), filters (status, priority, type, overdue, date window), CSV export and a one-click start; `/auditor/audits/[assignmentId]` is a single workspace with draft, preview and read-only modes - autosaved draft (3 s debounce plus a `beforeunload` flush, no revision written while drafting), period and date capture, executive summary, methodology, section-wise scorecard, structured findings editor (severity, clause, evidence, recommendation, status), observations, recommendations, references, evidence upload, the verifier's correction threads with tick-off, the version chain and the conversation thread, and a submission checklist that gates the submit button until every requirement is met. Submitting files revision 2, renders the audit-report PDF, moves the assignment to `Submitted` (90 %) and queues the verifier; `/preview` renders the printable audit document. `/auditor/reports` is the audit-report register with severity tallies, PDF download and CSV export. Every screen is ownership-scoped: another auditor gets `403` from the API and never sees the row.
* **Admin Compliance module** - all five registers of the legal side of the platform, each with list (filters, sorting, pagination, CSV export, live stat cards), create/edit forms, a detail page and activity history:
  * **Acts** - Central/State/International legislation with enactment and in-force dates, ministry and department, applicability thresholds, industry applicability and the official source link. State acts must name their state; Central acts may not.
  * **Obligations (rules)** - the duties inside an act with compliance type, frequency, the day of the month a recurring duty falls due (required for periodic frequencies, refused for one-time), responsible role, penalty exposure and the evidence an auditor will ask for.
  * **Regulations/instruments** - rules, schemes and orders issued under an act or obligation, with issuing authority, in-force dates, scope, obligations imposed, reporting authority/frequency and the penalty provision.
  * **Gazette notifications** - unique notification numbers with gazette reference, subject, body, effective date, applicability and the action employers must take.
  * **Employer documents** - the legal register itself: licences, certificates, permits, registrations and returns, each linked to an employer, unit, act and obligation, with the status **derived** from the expiry date against the reminder window (Valid / Expiring Soon / Expired), a validity-period shortcut that computes the expiry, duplicate-number refusal, verification stamping (who checked the original and when), a one-click **renewal** that recomputes the status and clears the reminder stamp so the next cycle notifies again, a **manual expiry reminder** that emails the employer's compliance contact from the `compliance.document_expiring` template and raises in-app notifications for the administrators, and a certificate attachment through the document vault.
  * **Employer panel** - `app/(employer)/employer/compliance-documents` with the same derived status, a "needs attention" panel for expired and lapsing documents, renewal recording and the employer's own register scoped to the session's company (another company's document answers `403`/`404`, and the employer id in a request body is ignored).
* **Real Indian labour legislation seeded** - `database/seeds/019_compliance_register.sql` (generated by `scripts/generate-compliance-seed.py`): 9 acts (Factories, EPF, ESI, Contract Labour, Gratuity, Maternity Benefit, TN Shops & Establishments, Employees' Compensation, Industrial Disputes), 22 obligations with frequencies and due days, 6 instruments and 4 gazette notifications - all idempotent (`WHERE NOT EXISTS` on the natural key) and rendered on the public `/acts-compliance` page.
* **Admin Document Vault** - `app/(admin)/admin/files` is the platform-wide library and `/admin/files/[fileId]` is the document record, over `GET/POST /api/admin/files` and `GET/PATCH/DELETE /api/admin/files/[fileId]` plus `POST /api/admin/files/[fileId]/versions`:
  * **One row per document** - the listing resolves each document's *current* revision (name, size, MIME type) while the root row keeps its identity, so re-uploads never duplicate the register; a **lifecycle** segment switches between active, archived and everything.
  * **Nine filters + facets** - free text, owning module, file kind, access level, category, lifecycle, uploader and an upload-date range, with clickable **by-module** and **by-file-type** facets showing counts and stored bytes, four stat cards (documents, added in 30 days, archived, expiring within 30 days) and CSV export.
  * **Metadata travels with the bytes** - the upload dialog sets module, record, category, access level, tags, description and validity date in the same multipart request (`file_access_logs`-backed), so the row is complete the moment it lands.
  * **Immutable revisions** - a new revision keeps the old bytes downloadable (proven byte-for-byte in the suite); every revision carries its own size, checksum, change note and uploader.
  * **Editing is chain-wide** - renaming or re-categorising a document writes the whole version chain; per-file **access levels** (`private`/`employer`/`auditor`/`verifier`/`public`/`restricted`) decide who may pull it back out.
  * **Archiving is the soft delete** - the document and all its revisions leave the active listing together, stay readable with their history, and one **restore** brings them back; each step is written to the activity trail.
  * **Download accounting** - `file_access_logs` now records every download (who, when, from which IP and user agent) for the document, which is what the detail page's download counter reads.
  * The generic `/api/files/**` endpoints stay in place for the attachment screens (employee documents, compliance certificates, audit evidence, submissions), and the audit-report/submission PDF routes keep streaming generated documents without polluting the vault's counters.
* **Logs & audit trails** - four screens over the four logs the platform writes, plus the error triage workflow:
  * **Activity Logs** (`/admin/activity-logs`) - every action in the platform with its actor, role, module, entity, outcome, severity, IP, request line and duration. Ten filters (search, module, action, actor, role, entity, result, severity, date range), a 14-day bar strip that shows failures inside each day's total, "where the activity is" leaderboards for modules and users, a detail dialog that renders the before/after payload, and CSV export.
  * **Audit Trails** (`/admin/audit-trails`) - the field-level history written by `writeAuditTrail` for compliance-critical tables: which column changed, from what value to what value, by whom and why. Trace a single column across the platform or reconstruct everything that happened to one record; filters by table, operation, field, editor, record id and depth.
  * **Login Attempts** (`/admin/login-attempts`) - authentication as a security view: every sign-in with its outcome and refusal reason, the client address and user agent, plus a highlighted list of addresses with repeated failures and the reason facet counts.
  * **Error Logs** (`/admin/error-logs` + `/admin/error-logs/[errorId]`) - the incident queue over `error_logs`: triage by severity and state, open a full trace page (message, stack, request body with secrets redacted at capture time, failing file/line, other occurrences of the same message) and **resolve or reopen** it with a note. Resolving is itself written to the activity log, so triage is auditable.
* **Admin Users, Roles & Permissions** module - the platform's access model, managed end to end. The register (`/admin/users`) carries six live stat tiles (logins, active, pending activation, locked, live sessions, archived) and filters for search, role, status (including the derived `locked` state), portal, lock state, activation state, created-date window and an archived view, with sorting, pagination, CSV export and per-row management. Creating a login issues a temporary password, a 72-hour activation link and the credential email (or takes an administrator-set password), optionally binding the account to an employer, auditor or employee record - the same binding the portal scoping reads. Per-account actions cover role assignment (with a reason that reaches the audit trail), activate/deactivate/suspend, unlocking a failed-sign-in lockout, emailing a 1-hour reset link, re-issuing activation credentials, revoking every live session, portal linking, archive and restore. Roles (`/admin/roles`) split system from custom, show members and grant counts, support create-with-clone, rename/redescribe and delete (refused while the role is still held, refused outright for system roles). The permission matrix (`/admin/permissions`) renders every permission (40 modules x 11 actions) against every role, with module/role bulk toggles, a platform-default reset, an unsaved-changes indicator and a bulk save that writes only the roles that actually changed; the Super Administrator column is fixed because the platform must always remain administrable. Every grant change revokes the sessions of the logins holding that role, so a revoked capability cannot survive on an open session. `npm run verify:users` = 146/146.

* **Admin Settings module** - `app/(admin)/admin/settings/**` over 20 admin endpoints, all gated on `settings.read` / `settings.update`. One catalogue (`lib/settings/definitions.ts`) describes all 60 settings across seven groups and gives every screen its typed field renderer, so a new setting appears in the UI the moment it is described there. **System** (identity, locale, currency, financial-year start, page size, session timeout, upload ceiling, maintenance switch, log retention), **Company** (legal entity, statutory registrations GSTIN/PAN/TAN/CIN/PF/ESI, letterhead signatory and a logo upload that lands in the document vault and is written back as `company.logo_path`), **Email / SMS / WhatsApp** (each with its own credentials, a live transport status panel, a **test send that really goes out**, and the channel's full delivery log with statistics, template breakdown and the provider's own error text) and **Audit defaults** (TAT, reminder offsets, the verification gate). Secrets are encrypted with AES-256-GCM before they are stored, are never returned — masked on read, omitted from the audit trail — and the editor distinguishes "leave it alone" (blank), "replace" (a value) and "remove" (the explicit clear). Saving an integration's credentials rebuilds its transport immediately, so the next message uses the new settings. The system screen also carries the **scheduled-job register** (pause, resume, cron override and a real "run now" for the reminder jobs) and the **backup screen** runs an actual `mysqldump`, records every run with its file size, duration and table list, verifies the dump is still on disk, copies the upload vault alongside it, prunes past the retention window and deletes dump files with their records. `npm run verify:settings` = 231/231.
* **Activity-log read API** - `GET /api/admin/activity-logs` with entity/module/action/user/date filters, used by every register detail page to show its own history ("the trail", "Triage history") and by the Activity Logs screen. Entity filtering tolerates the spelling variants different modules have written over time (`employer`/`employers`, `auditor`/`auditors`) and is case-insensitive.
* **Notifications API** (list, mark-read, create).



The employer and employee self-service panels (the last Phase 2 gap) are now built and verified — see
the section below. What is still missing is only the *secondary register pages for the advanced
modules* listed against Phase 6.

**Phase 3 (the dynamic module engine) is now finished and verified** — see the section below. It is the engine every custom audit / assessment / risk / study / work-permit form plugs into, so the remaining Phase 2 admin screens and the Phase 4 payroll depth follow on a complete foundation.

Groundwork already in place for later phases (tables migrated, libraries wired, UI patterns established) does **not** count as progress above. Example: the Phase 5 `cms_pages` tables are live and the public site already renders published CMS content into `/resources` and `/reports`, but the CMS authoring screens are still to be built.

<!-- ============================ DETAIL BELOW ============================ -->

Updated automatically as modules land. **Status is only marked done when the code is
written, type-checks, and has been exercised against the running database.**

Legend: ✅ complete and verified · 🟡 partially built · ⬜ not started

---

## Phase 1 — Foundation ✅

| Item | Status | Notes |
|---|---|---|
| Project config (Next 15 App Router, TS strict, Tailwind, PostCSS) | ✅ | `next.config.ts` sets security headers; `serverExternalPackages` for mysql2/pdfkit/nodemailer/bcryptjs |
| Design system tokens | ✅ | sidebar 260px `#1e293b`, active `#3b82f6`, topbar 64px, canvas `#f5f5f5`, 8px radius cards, 150–300ms animations |
| Database — 93 tables | ✅ | `database/migrations/001–026`, InnoDB, utf8mb4, FKs, soft-delete `deleted_at`, audit columns |
| Schema documentation | ✅ | `database/schema-documentation/SCHEMA.md`, regenerate with `scripts/generate-schema-docs.ts` |
| Seed data | ✅ | roles (6), permissions (451), role grants (785), auditor types (8), personal file checklist (16), payroll heads (25), leave types (8), settings (50+), super admin |
| Migration / seed runners | ✅ | statement-by-statement execution with file + index error context |
| DB layer (no ORM) | ✅ | `lib/db/` pool, query helpers, transactions, SQL-file runner |
| Auth — 6 endpoints + 5 screens | ✅ | login, logout, forgot-password, reset-password, change-password, activate-account |
| Sessions & CSRF | ✅ | HttpOnly JWT + `sessions` row (sha256 nonce), double-submit CSRF, lockout after 5 failures |
| RBAC | ✅ | 5 roles × module × action; page guard `requirePanel` **and** API guard `requireApiPanel` — a signed-in auditor gets `307 → /auditor/dashboard` on admin pages and `403` on `/api/admin/*` |
| Middleware | ✅ | edge session verify, CSRF, panel routing, public/auth path handling |
| UI primitives (28) | ✅ | button, input, select, textarea, checkbox, radio, switch, card, badge, table, pagination, filters, modal, drawer, tabs, toast, loader, empty-state, file-upload, multi-file-upload, date-picker, time-picker, calendar, rating, progress-bar, accordion, avatar, rich-text-editor, signature-pad, breadcrumb, search-input |
| Navigation | ✅ | sidebar with collapsible groups + badges, topbar with notifications/user menu/Ctrl-K search, mobile drawer, breadcrumbs |
| Panel layouts (5) + public layout | ✅ | shared `PanelShell` with toast provider |
| Notification layer | ✅ | 12 email + 6 SMS + 6 WhatsApp templates, notification service, email/SMS/WhatsApp providers with `*_logs`, AES-256-GCM secret storage |
| Reminder engine | ✅ | compliance expiry ladder 90/60/30/15/7/1, audit due 7/3/1, idempotent via `reminder_dispatches` |
| Scripts | ✅ | `db:migrate`, `db:seed`, `db:reset`, `create:admin`, `send:reminders`, `backup:db`, schema docs |
| Public site (9 pages) | ✅ | home, about, services, acts & compliance (live DB), resources, reports, contact (writes `contact_enquiries` + emails), terms, privacy |
| Admin dashboard | ✅ | live figures: employers, employees, audits by status, pending verification, expiring documents, payroll, activity feed, top auditors |
| Auditor / Employer / Employee / Verifier dashboards | ✅ | each queries its own scoped data |
| Employer module (admin) | ✅ | list with filters/sort/pagination/CSV, create + edit forms, detail page with 7 tabs (overview, units, departments, employees, audits, compliance, portal users), unit + department CRUD, optional employer-portal login provisioning with credentials email, soft delete guarded by open audits, activity + audit-trail logging |
| Notifications API | ✅ | list, mark-read, create |

---

## Phase 2 — Core modules

| Module | Status | Remaining work |
|---|---|---|
| Admin • Employees | ✅ | `app/(admin)/admin/employees` — list + 9 filters + CSV, 14-step create wizard, 10-tab detail page with sub-record CRUD, 16-item personal file checklist, document register wired to the vault, portal login provisioning, soft delete + login deactivation, employee PDF (≤12 pages, verified 4) |
| Admin • Auditors | ✅ | `app/(admin)/admin/auditors` — register + 8 filters + CSV, computed workload (open/overdue/approved/turnaround), rating, vault documents, portal-login provisioning; `/admin/auditor-types` CRUD over the 8 seeded categories |
| Admin • Audit assignments | ✅ | `app/(admin)/admin/audit-assignments` — register with 10 filters + CSV, stat cards, create/edit form (employer→unit→department cascade, auditor capacity, module TAT, scope/instructions, fee, notification switches), 5-tab detail (overview, progress, documents, history, report), reassign + cancel + delete modals, bulk assignment across units, `AUD/<year>/<serial>` numbering, calendar entries for the audit and its closing meeting, auditor email/SMS/WhatsApp + verifier + employer + admin notifications, activity log and audit trail |
| Admin • Audit reports | ✅ | `app/(admin)/admin/audit-reports` — register with 7 filters + CSV + 10 stat cards, create/edit form (scorecard, findings, observations, recommendations, references), 6-tab detail page (overview, findings, scorecard, versions with diff, comments, verification), submit → revision + PDF + assignment progress + verifier queue + 3-way email, verifier review (approve/reject/return with structured corrections), PDF download/regeneration with file versioning, archive/delete/restore, the analytics screen (`/admin/reports`) with its **score-trend and findings-breakdown charts** beside the month-by-month table. `npm run verify:reports` = 70/70 |
| Admin • Compliance | ✅ | `app/(admin)/admin/compliance/{acts,rules,regulations,notifications,documents}` - every register with list filters + CSV + stat cards, create/edit forms, detail pages with tabs and activity history, duplicate guards, dependency-aware deletion (an act holding rules/regulations/notifications/documents is refused with the counts in the message), the derived expiry engine, renewal, verification and manual expiry reminders; the employer panel has its own scoped `compliance-documents` screens. `npm run verify:compliance` = 129/129 |
| Admin • Files | ✅ | The document vault: `app/(admin)/admin/files` (library) + `/admin/files/[fileId]` (document record) over three admin endpoints — list with nine filters and facets, multipart upload that carries its metadata, metadata editing that writes the whole version chain, new-revision upload, archive/restore and download accounting (`file_access_logs`). Attached-file rendering across the employee, compliance, audit and submission screens keeps using the same vault. `npm run verify:files` = 106/106 |
| Admin • Activity logs / audit trails / error logs / login attempts | ✅ | Four screens over the four logs the platform writes — `app/(admin)/admin/activity-logs`, `/admin/audit-trails`, `/admin/login-attempts`, `/admin/error-logs` (+ `/admin/error-logs/[errorId]`), over four admin endpoints. Activity logs filter by module/action/actor/role/entity/outcome/severity with a 14-day trend and leaderboards; audit trails trace single columns (`who changed `city`, from what to what`); login attempts surface refusals and repeat-failure addresses; error logs are a triage queue with stack traces, repeat-occurrence context and a resolve/reopen workflow that is itself audited. `npm run verify:logs` = 139/139 |
| Admin • Users & roles | ✅ | `app/(admin)/admin/users` (+ `/create`, `/[userId]`, `/[userId]/edit`), `/admin/roles` (+ `/create`, `/[roleId]`, `/[roleId]/edit`) and `/admin/permissions` over 15 admin endpoints. Register with six stat tiles, ten filters (search, role, status, portal, locked, activation, created window, archived view), sorting, pagination, CSV export and a per-account management panel (roles with reason, status, unlock, reset link, re-sent activation, session revocation, portal linking, archive/restore). Provisioning generates a temporary password, stores a 72-hour activation token and emails credentials. Role CRUD with clone-from, member/grant counts, delete guard rails, and the permission matrix with module/role bulk toggles, platform-default reset and a bulk save restricted to changed roles. Every grant change revokes the sessions of that role's holders. `npm run verify:users` = 146/146 |
| Admin • Settings | ✅ | `app/(admin)/admin/settings` (+ `company-settings`, `email-settings`, `sms-settings`, `whatsapp-settings`, `backup-settings`, `audit-settings`) over 20 admin endpoints. One catalogue drives all seven groups and its typed field renderer; secrets are AES-256-GCM encrypted, masked on read and never audited; real test sends for email/SMS/WhatsApp with the delivery log beside the credentials; the scheduled-job register with pause/resume/cron override/run-now; database backups through a real `mysqldump` with history, detail, storage measurements, vault copying, retention pruning and file-deleting removal. `npm run verify:settings` = 231/231 |
| Admin • CMS | ✅ | `app/(admin)/admin/cms` (+ `pages`, `pages/create`, `pages/[pageId]`, `pages/[pageId]/preview`, `media`, `resources`, `resources/create`, `resources/[resourceId]`) over 15 admin endpoints. The page register publishes in bulk with per-page outcomes; the editor carries content, block builder (18 block types with repeatable items), menu placement, metadata, preview and the publishing state machine (draft → published → scheduled → archived → restore); the media library uploads through the vault and refuses to let a page's asset disappear from under it; resources publish as external links or vault files with download counting. The public site renders what the editors build — any published page at `/<slug>`, reports at `/reports/<slug>`, resources at `/resources` and `/resources/<slug>` with a streamed, counted download. `npm run verify:cms` = 203/203 |
| Admin • Calendar & holidays | ✅ | `app/(admin)/admin/calendar` (+ `/admin/calendar/holidays`) over 12 admin endpoints plus the auditor, employer and employee calendar reads. The month grid, the three views (month/week/day), the register with six filters, sorting, pagination, CSV export and a run-the-reminders-now action; the merged agenda stitches five registers into one day-by-day list — hand-made events, audit dates and closing meetings written by the assignment module, compliance expiries, payroll period ends, approved leave and the holiday master — each row carrying the colour of its source and a link to the screen that owns it. Events cover 13 types (5 of them authorable, the rest owned by their module), priorities, visibility, attendees, meeting links and a per-event reminder lead time; moving or re-running an event re-arms its reminder. The holiday master carries the national/state/festival/company/optional types, paid flags, employer scoping, one-click declaration of the three national days, duplicate refusal, and the working-day table (calendar days − weekly offs − holidays) that attendance and payroll both count against. `npm run verify:calendar` = 163/163 |
| Admin • Payroll oversight | ✅ | `app/(admin)/admin/payroll-monitoring` (every employer's monthly runs, run lifecycle calculate → approve → lock → pay → publish, head-wise statutory card, PDF generation, bank file, skipped-employee report), `/admin/payroll-register` (the month's payslips, bulk payment updates, CSV register, one-click PDF), `/admin/salary-structures`, `/admin/attendance-monitoring` (day mark + bulk month sheet), `/admin/leave-monitoring` (applications, decision, ledger accrual, leave types) and `/admin/statutory-registers` (bonus, gratuity, full & final settlement) over 28 admin endpoints — plus the **three statutory registers as PDFs**: the wage register from any run (`/api/pdf/payroll/wage-register/:runId` — both halves of every employee's wage and the month's totals to reconcile against the bank statement), the attendance register for a month (`/api/pdf/payroll/attendance-register?employer_id&month&year` — the P/A/L/HD/H/WO/OD grid over two fortnight bands with the month's man-days, hours and overtime) and the leave register for a year (`/api/pdf/payroll/leave-register?employer_id&year` — opening balance, accrual, availed, encashed, lapsed and the closing balance per person). `npm run verify:payroll` = 258/258 |
| Employer • Payroll & HR | ✅ | `app/(employer)/employer/payroll` (+ `run`, `history`, `[runId]`, `payslips`, `downloads`), `attendance` (+ `upload`), `leave-ledger` and `salary-structure` over the employer payroll/attendance/leave/structure families — scoped in SQL by `employer_users`, with cross-tenant reads answering 404 and cross-tenant writes refused. The employer raises the run, calculates it, reviews the statutory position, approves, locks, marks the salary upload paid, publishes the payslips and downloads the bank file. Covered by the payroll suite |
| Employee • Payroll & HR | ✅ | `app/(employee)/employee/payslips`, `/employee/attendance` and `/employee/leave` (+ `/leave/history`) over the employee-scoped endpoints — published payslips only, the bilingual PDF download (which stamps `employee_viewed_at`), the month's attendance with its tallies, the leave balance, the apply form that checks the ledger, and the withdrawal of a pending application. Covered by the payroll suite |

**Payroll rules worth knowing.** A run is created for one company (optionally one unit or department) and one month; the schema's unique key makes "one run per scope per month" a database fact, and recalculating rebuilds the payslips in a single transaction rather than appending. The engine prorates a monthly wage over the days of the calendar month less loss-of-pay days, counts a half day as half, pays overtime at twice the ordinary rate (basic + DA ÷ 26 ÷ 8), applies PF at 12% on the ₹15,000 ceiling for both sides, ESI at 0.75%/3.25% only inside the ₹21,000 ceiling, the state's professional-tax slab and the labour-welfare-fund instalment in the months the State collects it. A locked or paid run cannot be recalculated, cannot be reopened as a draft, and can only be withdrawn with an explicit `confirm`, which soft-deletes the run *and every payslip it produced* so the register and the employees' own screens never show money from a run that is gone. Wages above the bonus eligibility ceiling are recorded as not payable rather than silently dropped, and the eligibility/calculation ceilings are read from `STATUTORY_RATES` so a change in the law is a one-line edit.

**Calendar rules worth knowing.** An auditor's diary is scoped to their own `auditors` row: an account with no auditor profile is refused outright (403) rather than served the platform calendar, an event filed by an auditor is pinned to them, and an audit date in their diary can be completed but not deleted — that row belongs to the assignment register. Only the five manual event types (meeting, training, inspection, reminder, other) can be created by hand; the rest — audit dates, closing meetings, compliance expiries, payroll runs, leave — are written by the module that owns them, and an existing module-owned event can have its details edited but never re-typed. Moving or re-arming an event clears `reminder_sent`, so the reminder fires again for the new time; the dispatch ledger keys on event + recipient + lead time, which is why the fifteen-minute cron can run as often as it likes without sending anything twice. The working-day count merges the weekly off and the holiday calendar, so a holiday that falls on the off day does not cost the establishment a second day.

| Auditor workspace | ✅ | `app/(auditor)/auditor` — assignment register with stats/filters/CSV and one-click start, the draft/preview audit workspace (autosave, scorecard, findings, evidence, corrections, versions, conversation, submission checklist), submit → revision + PDF + verifier queue, and the report register. Ownership enforced on every route. Dynamic-module forms inside the workspace land with Phase 3. `npm run verify:auditor-workspace` = 56/56 |
| Verifier workspace | ✅ | `app/(verifier)/verifier` — dashboard, queue with workload stats, read-only report bundle (ownership-checked), review screen with approve/reject/return, structured corrections, version compare and comments |
| Employer portal | ✅ | `app/(employer)/employer` — company profile (read + self-edit of everything except the identifiers the platform controls, with `/employer/profile/edit` opening the form directly), a standalone units register and a departments register with their own filters/CSV/modals, the staff register reusing the admin table and the full 14-step wizard pinned to the session's company (hiring with generated portal credentials), employee detail and edit, attendance + bulk upload, leave ledger, salary structures, the payroll office (`/payroll`, `/run`, `/history`, `/payslips`, `/payslips/[id]`), compliance documents, audits + the audit detail with its shared files and trail, audit reports + the company's own copy of a report (summary, scorecard, findings, next audit due and the verifier's decision — the working conversation stays between the auditor and the verifier) with the PDF, its own **compliance-score trend and findings charts** on the reports screen (computed against the session's employer id, so a company sees its own figures and no other's), calendar, downloads, notifications and settings. `npm run verify:selfservice` = 169 checks green |
| Employee self-service | ✅ | `app/(employee)/employee` — my profile (identity, service, wage structure, statutory numbers, personal-file completeness), personal details with self-edit of contact/address/personal/bank (employment facts and statutory identifiers refused by name), employment details, service record with qualifications and earlier employers, my documents (upload into the vault, download again, withdraw while unchecked), attendance, leave apply/status, payslips + bilingual PDF download, calendar, notifications and settings (account, password, notification preferences) |

---

## Phase 3 — Dynamic module engine

| Item | Status | What shipped |
|---|---|---|
| Module builder (modules, forms, sections, fields, options) | ✅ | Register + create/publish/clone/archive/delete, module settings, per-role and per-user assignment matrix; the form builder (`components/dynamic-builder/**`) edits sections, 29 field types, dropdown values with per-option scores, conditional logic, formulas, tables and columns, with a live readiness panel and a preview tab |
| Table fields (tables, columns, rows) | ✅ | `dynamic_tables` / `dynamic_table_columns` / `dynamic_table_rows` end to end: column CRUD with types, totals, per-row scoring, select options, row numbers, min/max rows, and a grid widget with computed totals |
| Submissions (values, table rows, drafts) | ✅ | start (resumes an open draft) → 3-second autosave → submit; server-side re-validation of every rule, uniqueness checks, conditional logic, formulas, scoring (option scores, `max_score`, column scoring), submission numbering `PREFIX/YYYY/000001`, versioning, soft delete |
| PDF layouts per module | ✅ | `lib/pdf/submission-pdf.ts` renders the submission from its own structure — letterhead, module/form header, section blocks, answer tables, signature image, score summary, review decision, report-number footer — and files it as a versioned `files` row (`GET /api/pdf/submission/:id`) |
| Role/user module assignment | ✅ | Admin module editor assigns roles with their own CRUD/approve rights plus named users; the auditor menu and catalogue read that assignment and never show unpublished or unassigned modules |
| Panels | ✅ | Admin: `/admin/dynamic-modules` (+ `[moduleId]`, `[moduleId]/forms/[formId]` builder, `/admin/dynamic-submissions` + record with the review panel). Auditor: `/auditor/modules`, `/auditor/submissions` (+ record, autosave/submit, PDF), `/auditor/forms/[formId]` deep link. Verifier: `/verifier/submissions` queue + review screen |
| Verified | ✅ | `npm run verify:dynamic-modules` — **60/60 checks pass** (see the evidence table below) |

---

## Phase 4 — HR & payroll depth

| Item | Status | Remaining work |
|---|---|---|
| Attendance (manual + import) | ⬜ | Register, bulk entry, month view, lock |
| Leave (types, ledger, applications, approvals) | ⬜ | Apply/approve flows with ledger updates |
| Salary structures & heads | ⬜ | Structure builder per employee, revisions |
| Payroll run engine | ⬜ | Draft → calculate → approve → lock → pay, statutory PF/ESI/PT/LWF/TDS |
| Payslips | ⬜ | Bilingual Tamil/English PDF, publish, employee download, email/SMS |
| Bonus, gratuity, full & final settlement | ⬜ | Computation screens + records |

---

## Phase 5 — Documents, CMS, reporting

| Item | Status | Remaining work |
|---|---|---|
| File manager + versioning | ✅ | Delivered as the Phase 2 document vault: admin library + document record, versioned uploads, archival/restore, access levels, per-file access logs and download counters (`npm run verify:files` = 106/106) |
| Employee document vault | ✅ | The employee's own vault (`/employee/documents`, `MyDocuments`): category-wise uploads against the platform's 15-type document taxonomy, what the employer has verified and what is pending, download, and withdrawal — with a verified document protected from withdrawal (409). Verified in the self-service suite §9 (`npm run verify:selfservice` = 169/169) |
| PDF engine | ✅ | `lib/pdf` layout kit + embedded Latin/Tamil fonts; the employee personal file (4 pages / 23.6 kB / 221 ms, `npm run check:pdf`), the audit report (company header + report-number footer), the bilingual payslip (Tamil head names), the three statutory payroll registers — wage register for a run, attendance register for a month (P/A/L/HD/H/WO grid over two fortnight bands), leave register for a year (opening/accrued/availed/encashed/lapsed/balance) — and the compliance register (`/api/pdf/compliance-register`, per-establishment or platform-wide, derived Valid/Expiring Soon/Expired), all live at `/api/pdf/…` with their scope refusals and activity-trail entries. Samples in `docs/samples/` |
| CMS → public site | ✅ | Delivered as the Phase 2 CMS module: page/section/media/resource CRUD, the publishing state machine with scheduling and a job that promotes due pages, the block renderer shared by the admin preview and the public site, and the public read paths (`/<slug>`, `/reports/<slug>`, `/resources`, `/resources/<slug>`, `/api/public/resources/<slug>/file`). Verified by `npm run verify:cms` (203/203) |
| Reports & analytics | ✅ | Five charts on `/admin/reports`, all server-rendered from live aggregates: the audit score trend + findings-by-severity breakdown (`reportCharts()`, `components/charts/report-charts.tsx`), the payroll disbursement trend, workforce-by-department spread and compliance register status mix (`platformCharts()`, `components/charts/platform-charts.tsx`), plus the month-by-month static table. `/employer/audit-reports` carries the establishment's own score trend and severity breakdown and links each row to the read-only report detail (`EmployerReportView`) |
| Integrations settings + test buttons | ✅ | Providers, settings screens, test sends and the delivery log all shipped (settings module, 231 checks) |

---

## Phase 6 — Advanced

| Item | Status | Remaining work |
|---|---|---|
| Calendar integration (audit dates, meetings, holidays) | ✅ | Shipped as the calendar module: event CRUD with module-owned types, the holiday master with one-click national years and working-day maths, reminders with one dispatch per recipient, month/agenda reads and panel scoping across all five panels (`npm run verify:calendar` = 163/163) |
| Risk assessment, safety/environmental studies, assessment reports, work permits | ✅ | Delivered on the dynamic module engine as named families — Assessments, Risk Registers, Studies (HAZOP/HACCP) and Work Permits — each with its admin register and auditor screen, builder-defined forms, submissions with draft/resume/submit and per-module PDFs (`npm run verify:dynamic-modules` = 60/60) |
| Work permit / contractor compliance | ✅ | Work permits ship with the family above; contractor compliance landed as the fifth module family (`/admin/contractors`, `/auditor/contractors`, `CONTRACTOR` in the module/assignment/report type lists) — contractors on site with their licences, insurance and certifications |
| Notifications centre + preferences | ✅ | Notifications screens in all five panels (`AllNotifications`), mark-read, per-category channel preferences (`/api/notifications/preferences`) and the template manager under `/admin/notifications/templates` |
| Bulk import/export (CSV/XLSX) | ✅ | CSV export on every register; bulk imports shipped — the month attendance sheet and, latest, the **employee CSV import** (`/api/admin/employees/import` + template route + the Import CSV control on `/admin/employees`: wizard-grade validation per row, bad rows skipped and reported, never fatal) |

---

## Phase 7 — Testing & deployment

| Item | Status | Remaining work |
|---|---|---|
| Type-check clean (`npm run typecheck`) | ✅ | Verified with zero errors |
| Migrations + seeds run against live MariaDB | ✅ | 93 tables, 462 permissions, 848 role grants, 25 payroll heads, 8 leave types |
| Auth flows exercised over HTTP | ✅ | login → redirect, panel guard, CSRF rejection verified |
| Employer module exercised end to end over HTTP | ✅ | create → units → departments → detail → logs |
| Reminder + backup runners exercised | ✅ | `send:reminders`, `backup:db` (93 tables recorded) |
| Full per-role acceptance walkthrough | ✅ | Covered by the verification suites now that every module exists: super admin, auditor, verifier, employer and employee flows all exercised over HTTP (16 suites, 2,400+ checks, 0 failed) |
| Responsive verification at 1920/1366/768/375 | ⬜ | Needs a real browser viewport pass — the only item that cannot be done headlessly in this sandbox |
| Performance verification (<3s page, <500ms API, <5s PDF) | ✅ | Measured on the production build: pages 40–70 ms, list APIs ~20 ms, largest statutory register PDF 67 ms — all within targets by 30–75× |
| Deployment guide | ✅ | `docs/DEPLOYMENT.md` — database, env, swap-aware build, systemd, TLS, cron (reminders + backups), post-deploy verification, rollback |

---

## Verification log

Latest run against the production build (`npm run build` → `npm start`):

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean — 0 errors |
| `npm run build` | Succeeds; 450 app-router entries compiled (175 pages + 275 API routes) — on this 2 GB box with a 3 GB swap file and `NODE_OPTIONS=--max-old-space-size=1200` (~2 min), one worker (`experimental.cpus: 1`) |
| Public pages (`/`, about, services, acts-compliance, resources, reports, contact, terms, privacy) | all `200` |
| `/api/health` | `healthy`, MariaDB 11.8.6, latency 1–2 ms |
| Admin sign-in → `/admin/dashboard` | `200` |
| **Payroll & HR suite (`npm run verify:payroll`)** | **258 passed, 0 failed** — engine arithmetic (₹31,900 proration, PF ₹1,800, ESI ₹128/₹553), run lifecycle, pay register CSV, three bank-file formats, publication + delivery logs, bonus/gratuity/settlement, bilingual payslip PDF (2 pages, 19.5 kB, Tamil font embedded, 63 ms), the three statutory register PDFs (wage register for a run, attendance register for a month, leave register for a year) with their cross-tenant refusals, every payroll screen for every role, cross-tenant refusals against a real second company |
| **PDF layout check (`npm run check:pdf`)** | Employee file 3 pages / 21.9 kB / 216 ms (limit 12); payslip 2 pages / 19.5 kB / 63 ms with 3 embedded font subsets |
| **Self-service suite (`npm run verify:selfservice`)** | **169 passed, 0 failed** — anonymous/wrong-panel refusals on both new panels, the employer's own profile (self-edit allowed, `employer_code`/`status` refused field by field), units and departments with `409 HAS_EMPLOYEES` and cross-tenant `404`s, hiring with working credentials, the child registers, the employee's own profile with its refused fields, document upload/download/withdraw with the verified-document guard, the service record, the company's audits and reports, every new page for its own role, the activity trail and clean-up |
| **Analytics charts** | The score-trend and findings-breakdown charts render into `/admin/reports` and `/employer/audit-reports` server-side (asserted in the reports and self-service suites), drawn from the same aggregates as the tables beneath them |
| **Wage register PDF** | `/api/pdf/payroll/wage-register/:runId` — verified in the payroll suite: both halves of the register, the month's totals, the company reading its own, another company's `404`, an auditor and an employee `403`, an unknown run `404`, and the download written to the activity trail |
| **Attendance & leave registers** | `/api/pdf/payroll/attendance-register` and `/api/pdf/payroll/leave-register` — verified in the payroll suite: the month's day grid with its codes and totals, the year's leave accounts with the year's totals, a bad month refused `422`, a company reading its own (the establishment in the URL is ignored in favour of the session), an auditor and a verifier `403`, and both downloads written to the activity trail |
| Admin employer module (`/admin/employers`, `/create`, `/:id`, `/:id/edit`) | all `200` |
| Employer created over the API | `201`, units + departments created, counts synced |
| Activity logging | `created` rows for employer, unit, department + `login` rows |
| Auditor sign-in (`auditor.test@complianceos.local`) | redirects to `/auditor/dashboard` |
| Auditor → admin pages | `307` to `/auditor/dashboard` (no leak) |
| Auditor → `/api/admin/employers` | `403 This endpoint belongs to another workspace` |
| Unauthenticated `/api/admin/employers` | `401` |
| Mutating call without CSRF token | `403` |
| `npm run send:reminders` | Runs; 0 candidates (no compliance/audit data yet) |
| `npm run backup:db` | 287 KB dump, 93 tables recorded in `backup_history` |
| `scripts/generate-schema-docs.ts` | Wrote 93-table `SCHEMA.md` |
| `bash scripts/verify-employees.sh` | All 14 steps pass — see the table below |
| `bash scripts/verify-auditors.sh` | All 16 steps pass — see the table below |
| `npx tsx scripts/check-pdf.ts` | Employee personal file: 4 pages, 23.4 kB, 261 ms (limit 12) |
| `bash scripts/verify-reports.sh` | **70/70 checks pass** — see the table below |
| `npm run verify:auditor-workspace` | **56/56 checks pass** — see the table below |
| `npm run verify:dynamic-modules` | **60/60 checks pass** — see the table below (module lifecycle → builder → auditor submit → verifier approve → panels) |
| `npm run verify:assignments` | 29/29 checks pass (re-run on the compliance build) |
| `npm run verify:compliance` | **129/129 checks pass** - see the table below (seeded register, validation and duplicate refusals, document lifecycle with renewal/verification/reminders, employer scoping, panel pages, public page) |
| `bash scripts/verify-employees.sh` (harness) | Now bootstraps its own employer/unit/department context through `scripts/fixture-employee-context.py`, so it stays green on a freshly seeded database instead of failing on missing reference ids |
| `npm run verify:files` | **106/106 checks pass** - see the table below (upload with metadata, download accounting, immutable revisions, metadata edits across the chain, archive/restore, facets, every sort key, panel pages) |
| `npm run verify:logs` | **139/139 checks pass** - see the table below (four logs, real fixtures for each, filter/sort/facet coverage, the error triage workflow and its own audit entries) |
| `npm run verify:users` | **146/146 checks pass** - see the table below (register filters, provisioning with credentials + activation, the full account lifecycle, portal binding, RBAC refusals by URL, role guard rails, the matrix and its bulk save, nine panel pages) |
| `npm run verify:settings` | **231/231 checks pass** - see the table below (panel-by-panel refusals, catalogue integrity, updates + validation, encrypted secrets and their keep/clear rules, the audit trail, real channel test sends into `*_logs`, delivery-log filters, the job register, real backups and the logo upload) |
| `npm run verify:cms` | **203/203 checks pass** - see the table below (access control by URL and by role, overview + slug catalogue, page creation and slug collisions, the block builder, the publishing state machine, scheduled promotion, bulk actions with refusals, the media library, resources and their downloads, the public surface as a visitor sees it, the activity trail, every screen, and clean-up) |
| `npm run verify:calendar` | **163/163 checks pass** - see the table below (access control by URL and by role, the event form pickers, the month overview and the merged agenda, event creation with its validation refusals, module-owned types, editing/no-op/status moves, the holiday register with duplicate refusal and filters, one-click national holidays, the working-day maths including a holiday that falls on the weekly off, reminders dispatched once and only once, auditor scoping with a real registered auditor, the employer and employee reads, the activity trail, every screen and clean-up) |
| `bash scripts/verify-employees.sh` | 15 steps pass (now ends with a restore + PDF re-render) |
| `bash scripts/verify-auditors.sh` | 16 steps pass (re-run on the reports build) |
| Audit-report PDF text (decoded through the embedded Noto subsets) | employer letterhead, report number, period, score summary, severity cards, observations, references, signature block; `Report RPT/... · vN` + employer + `Page N of M` footer on **every** page |

### Logs & audit trails run (`scripts/verify-logs.sh`)

Each of the four logs gets a real fixture rather than a stub: the suite creates and edits an
employer to generate activity and trail entries, performs a successful sign-in plus three
refusals for the authentication log, and inserts one incident to drive the triage workflow
(the platform deliberately has no endpoint that raises a 500 on demand). Everything is swept
afterwards.

| # | Check group | What it proves | Result |
|---|---|---|---|
| 1 | Access control | all four endpoints answer `401` anonymously and `403` for the employer panel; the employer cannot resolve errors; unknown ids answer `404` | ✅ 12 checks |
| 2 | Activity logs | a real employer creation is logged with actor, role, entity, request metadata and description; filters by module, action, user, role, entity id (both the camelCase spelling record pages use and snake_case) and date; searches that match nothing return nothing; ascending and descending time sorts are verified; facets list the modules/actions/actors/entities that were written; statistics, the day-by-day trend and the leaderboards carry the fixture work | ✅ 38 checks |
| 3 | Audit trails | an edit that the platform trails produces field-level rows: the field name, the old value, the new value, the editor's name and id; filters by table, operation, field, editor, record and depth (field changes only vs record-level entries); date filters; searching change *values*; facets and statistics | ✅ 19 checks |
| 4 | Login attempts | three refusals are recorded with their reason, address and client, and the successful sign-in with its account; filters by outcome, reason and date; the reason facet counts them; the repeat-failure address list surfaces them; statistics split successes from refusals | ✅ 14 checks |
| 5 | Error logs | the incident appears in the open queue with its severity/type/route filters and facets; the detail carries message, stack trace, request body and failing file/line with similar occurrences; resolving without a note is refused `422` (a blank note too); resolving stores the resolver, the timestamp and the note; resolving twice is refused `409`; reopening works and reopening an open incident is refused `409`; both actions appear in the activity trail with the note | ✅ 30 checks |
| 6 | Panel pages | the four screens render `200` with their content and the trace page shows the stack; an unknown error id reaches the 404 page | ✅ 11 checks |
| 7 | Clean-up | the fixture incident, sign-ins and employer are swept; all four endpoints still answer afterwards | ✅ 8 checks |

**Result: 139 passed, 0 failed** — reproducible (green on consecutive runs).

### Users, roles & permissions run (`scripts/verify-users.sh`)

Everything the access model claims is proved against a running server: the suite provisions
its own logins and roles through the real admin API, asks the API to sign them in, and then
reads the database to confirm that what the API said happened actually happened. Fixtures are
stamped per run, swept first and last, and the one role the matrix run touches (auditor) is
restored to its platform defaults before the suite exits.

| # | Check group | What it proves | Result |
|---|---|---|---|
| 1 | Access control | the register, the role register and the matrix answer `401` anonymously; an employer session is refused all three (`403`), including the create endpoint | ✅ 6 checks |
| 2 | Register | statistics, the role breakdown, the activation queue and live sessions ride with the listing; rows expose the derived portal, role slugs, effective permission count, lock state and session count; pagination reports limits and totals; sorting by any allowed column works; search matches name/email/username/mobile; the role, portal, status, locked and activation filters each narrow correctly; a non-numeric page is refused `422` | ✅ 22 checks |
| 3 | Provisioning | creating a login generates a username and temporary password, stores the account as first-login, attaches the roles, issues a 72-hour activation token and logs the `welcome.credentials` email; duplicate email `409`; missing roles `422`; unknown role refused; a policy-breaking password `422`; the new login signs in with its temporary password and is routed to `/change-password` | ✅ 15 checks |
| 4 | Account lifecycle | detail returns roles, effective permissions, sessions, links, the activity summary and the link candidates; unknown id `404`; an edit writes field-level audit rows and an activity entry; invalid status `422`; taking an existing email `409`; an empty edit `409 NO_CHANGE`; self-archive `409`; unlock clears the lock and its counter and a second unlock `409`; sessions list, revoke, and the revoked session can no longer read (`401`); reset link emails and stores a token; re-sent activation invalidates the old password and works; archive is a soft delete that blocks sign-in, hides from the live register and shows in the archive view; restore brings the login back | ✅ 36 checks |
| 5 | Portal binding | a login is bound to an employer record, the `employer_users` row is written and the link appears on the account detail; a link without a target is refused `422` | ✅ 4 checks |
| 6 | RBAC enforcement | a custom role carrying only `dashboard.read` signs in and is refused the register, the create endpoint, the matrix and the grant endpoint by URL (`403`), and cannot widen its own grants (the database still shows exactly one) | ✅ 8 checks |
| 7 | Roles | list, statistics, matrix column data, system/custom split and search; duplicate slug `409`; unknown permission `422`; unknown clone source refused; clone carries the source grant count; role detail returns grants, catalogue and members; unknown role `404`; rename `200` and an unchanged rename `409`; system roles cannot be renamed or deleted; re-saving an identical grant set `409`; replacing a grant set writes the new rows, revokes the holders' sessions (the old session `401`s) and a permission grant never opens another panel (`403 FORBIDDEN`); deleting a held role is refused `409 IN_USE` and succeeds once released; deletion is a soft delete | ✅ 29 checks |
| 8 | Permission matrix | the matrix returns every role, 40+ modules, 451 grants and the platform defaults; the Super Administrator's grants are protected (`409`); a bulk save writes the requested set, reports per-role outcomes and revokes the rest; a no-change save is refused `409`; an unknown role is reported as a per-role error instead of failing the batch; the auditor role is restored to its defaults | ✅ 14 checks |
| 9 | Screens | the register, create, account detail, account edit, role register, create role, role detail and the matrix all render `200`; an unknown role id reaches the 404 page | ✅ 10 checks |
| 10 | Clean-up | fixture logins, roles, tokens, sessions and the fixture employer are removed | ✅ 2 checks |

**Result: 146 passed, 0 failed** — reproducible (green on consecutive runs).

### Settings module run (`scripts/verify-settings.sh`)

The suite treats the settings screens as both the control room and the crown jewels: it signs in
as each of the five roles and tries to read and write them, then walks the whole module — catalogue,
validation, encryption, audit trail, live channel sends, jobs and backups — reading the database
after every claim. It also provisions a throwaway employee portal login to prove the employee role
is refused, and restores every settings row it touches from a snapshot taken before the run.

| # | Check group | What it proves | Result |
|---|---|---|---|
| 1 | Access control | an anonymous caller gets `401`; the auditor, verifier, employer and a freshly provisioned employee login are each refused the overview, a group, a write and a backup run (`403`) — the employee dimension is proved with a real portal login, not an assumption | ✅ 19 checks |
| 2 | Overview & catalogue | the seven catalogued groups and their seven screens are served; screen links point at real pages; masked values ride with the overview; statistics report the platform's real size and secret count; no stored group is uncatalogued; the integration status and template inventory cover all three channels | ✅ 11 checks |
| 3 | Group reads | all seven groups read `200` with their sections, labelled fields and complete value maps; the delivery channels carry statistics and live transport status while the audit group does not; an unknown group is a `404` | ✅ 32 checks |
| 4 | Updates | a change persists to the database, records the editor, reads back through the API and moves the overview; an identical save is refused `409 NO_CHANGE`; multi-field saves report every field; booleans and numbers are coerced exactly as an HTML form would send them; a system save does not request a transport reconnect; the API's change summary never echoes old or new values | ✅ 18 checks |
| 5 | Validation | an uncatalogued key is refused `422` **and names the offending field**; choices outside the catalogue, numbers below/above their bounds, non-numbers, malformed emails and scheme-less URLs are all refused; an empty payload is `409`; a non-map payload is `422`; malformed JSON is `400 INVALID_JSON`; an SMTP port without a host is refused | ✅ 12 checks |
| 6 | Secrets | a secret is written AES-256-GCM encrypted (the stored value is not the plaintext), never appears in the group response **or the overview response**, is reported as set, survives an empty write (`409 NO_CHANGE`) and is removed by an explicit null — with the encryption flag reset | ✅ 12 checks |
| 7 | Audit trail | a settings change writes an `updated` row against the settings entity carrying the previous and the new value; the trail never records a secret's value | ✅ 5 checks |
| 8 | Channel tests | test email/SMS/WhatsApp sends are accepted and written to `email_logs` / `sms_logs` / `whatsapp_logs` with provider, status and segment counts (they report `simulated` truthfully while no credentials are configured); an unusable mobile number, a missing number and an unknown channel are all refused | ✅ 12 checks |
| 9 | Delivery log | all three channels paginate, report statistics, their template breakdown and recent failures; search, status and date filters narrow correctly; an unknown channel is refused `400` | ✅ 23 checks |
| 10 | Scheduled jobs | every seeded job is registered with its schedule, type and state (the four settings jobs plus the CMS's `cms_scheduled_publish`, which migration 024 added); a job pauses (persisted) and a paused job refuses to run `409`; a reminder job runs on demand and reports its dispatch summary; a non-reminder job refuses; unknown job `404`; an empty update `422` | ✅ 15 checks |
| 11 | Backups | a real `mysqldump` runs (schema type), records name, size, table count and duration, writes a file that is verified on disk; the history paginates, filters by status and reports storage; the detail lists the tables **in the dump** and measures the file; the storage report measures vault + backup directory; the upload vault copies into the backup directory; unknown ids and types are refused | ✅ 26 checks |
| 12 | Logo upload | a PNG upload lands in the document vault as a versioned file, the `company.logo_path` setting follows it, and the stored logo downloads with the right bytes; a text file is refused `422`; a request with no file is refused `400` | ✅ 8 checks |
| 13 | Screens | all seven settings pages render `200` with their own titles and no server error; the delivery log, test-send panel, backup history, manual-run button, job register and integration transports are all present in the HTML; an employer is **redirected away** (verified without following the redirect) and refused the backup API | ✅ 26 checks |
| 14 | Clean-up | every settings row touched is restored from the pre-run snapshot, and the backup record + dump, the uploaded logo + file rows, the log fixtures and the throwaway employee login are removed | ✅ 6 checks |

**Result: 231 passed, 0 failed** — reproducible (green on consecutive runs).

**The settings bugs this suite found and the fixes that followed:** field-level validation errors were
being swallowed (the service attaches them under `details.issues`, which the route error mapper did not
read, so the screens could not highlight the offending field); an explicit `null` could not actually
clear a stored secret — the payload was normalised to an empty string, which the service treats as
"keep", making "remove the stored value" impossible from the UI until the editor was given the
distinction and the service a real clear path; and a backup's table list came back empty on MariaDB,
which reports its `JSON` columns as `longtext` and lets the driver hand the array back already decoded,
so `JSON.parse(String(...))` always threw. All three are fixed in this build.

### CMS module run (`scripts/verify-cms.sh`)

The CMS is the surface the whole world sees, so the suite attacks it from three sides at once: as an
editor building a page, as a visitor reading it, and as somebody who should not be there. Every claim
it makes is checked against the database afterwards, and every fixture it creates — pages, blocks,
media, vault files, resources, a throwaway portal login — is removed at the end.

| # | Check group | What it proves | Result |
|---|---|---|---|
| 1 | Access control | anonymous callers get `401` (a write is refused by the CSRF gate first); the auditor, verifier, employer and a freshly provisioned employee login are each refused the register, the overview, a page creation and a media edit (`403`); page guards push non-admins off `/admin/cms/**` | ✅ 23 checks |
| 2 | Overview | the module landing read serves the page/media/resource statistics, the recently edited pages and the pages waiting to publish themselves — with the counts moving as the suite creates rows | ✅ 6 checks |
| 3 | Slug catalogue | existing page and resource slugs are served, the platform's own routes (`/login`, `/admin`, `/resources`…) are declared reserved, and a page can exclude its own slug while editing | ✅ 5 checks |
| 4 | Page creation | the derived slug is `slugify`d, a title too short to be a page is refused, an explicit slug that another page already holds is refused `409 DUPLICATE` (a derived one is made unique instead), a reserved route cannot be taken over, a placeholder page with no content cannot be published, an edit that changes nothing is `409 NO_CHANGE`, and the detail reads back with its block list | ✅ 17 checks |
| 5 | Block builder | list and prose blocks are added with their items stored in `content_json`, an empty block and a malformed hex colour are refused, blocks reorder (and the database agrees), a foreign block cannot be slipped into the order, a partial order is refused, and a block can be edited and switched off | ✅ 14 checks |
| 6 | Publishing | publish stamps `published_at`; publishing twice, unpublishing a draft, scheduling without a moment or in the past, and publishing an archived page are all refused with the right codes; unpublishing keeps the publication history; archiving is a state change (not a delete) and a restored page returns as a draft | ✅ 19 checks |
| 7 | Promotion | a page created straight into `scheduled` is invisible publicly, and once its moment passes the publishing job promotes it — the public site then serves it and counts the view | ✅ 8 checks |
| 8 | Bulk actions | a bulk publish across a draft and a published page reports `succeeded = 1, failed = 1` with the refusal's reason; an empty selection and an unknown action are refused `422` | ✅ 7 checks |
| 9 | Media library | an image uploads through the vault (checksummed, versioned, `public_url` ready), lands in its folder and is catalogued as an image; a document lands as a document; an empty body is `400`, a `.php` payload is refused and leaves nothing behind; details edit and a no-op edit is `409`; an asset a live page uses cannot be deleted (`409 IN_USE`) and can be released | ✅ 23 checks |
| 10 | Resources | external and file-backed resources publish with a stamp; a resource with neither a file nor an address is refused; a no-op edit is `409`; clearing both sources is refused `422`; the register finds them by search and carries the library statistics | ✅ 10 checks |
| 11 | The public surface | the published page reads at its own address with its active blocks (and **not** its switched-off one); the platform's fixed routes are untouched; unpublishing takes it to `404`; a `report` page reads at `/reports/<slug>` and an unknown report is `404`; `/resources` lists the published resource; the gated one asks for a sign-in; the file-backed one **streams its own bytes** with an attachment disposition and increments the download count; a link-only resource answers `409`; drafting a resource takes it off the site and archiving is a soft delete | ✅ 31 checks |
| 12 | Register rules | child pages nest and record their parent; a page cannot be its own parent or sit under its own child; a parent with live children cannot be archived; a page carrying blocks asks for confirmation; the homepage flag is a single slot that transfers (and the previous holder is restored at the end of the run) | ✅ 11 checks |
| 13 | Activity trail | creating, editing, publishing, uploading and archiving each leave their row in `activity_logs`, and a page edit records the before and after values | ✅ 7 checks |
| 14 | Screens | all nine CMS screens render `200` for an admin (register, create, editor, preview, media, resources, resource detail, overview), an unknown page id is a `404` screen, and an auditor is **redirected away** from every one of them (verified without following the redirect) | ✅ 15 checks |
| 15 | Clean-up | the pages, blocks, media, vault files, resources, activity rows, uploads and the throwaway login are all gone, and no fixture page is left answering on the public site | ✅ 7 checks |

**Result: 203 passed, 0 failed.**

**Two deliberate omissions, so they are not read as gaps.** There is no
`/api/admin/cms/media/[mediaId]/download` route: every media asset is a `files` row served by the
vault's own `/api/files/:id/download` (and `?inline=true`), so a second download path would only be a
second way to serve the same bytes under the same rules — the library links straight at the vault URL
it already stores. And there is no server-side CMS CSV export route: every register in this platform
exports from the loaded page with `downloadCsv()`, which keeps the export consistent with the filters
the user is looking at, and `verify:files` / `verify:logs` already hold that convention. Both would be
one-line additions if a future requirement asks for a streamed export instead.

**The CMS bugs this suite found and the fixes that followed:** an archived page could be published
straight back to live (the state machine only refused a page that was already published) and, in the
same area, `PATCH` restore could not bring a *status*-archived page back — only a soft-deleted one,
because the two archives shared no restore path; a partial media update silently **blanked every field
it did not mention**, because the optional-string transform mapped an absent key to `NULL` instead of
leaving it absent; an explicitly typed slug that was already taken was quietly suffixed (`-2`) rather
than refused, so an editor asking for a specific address got a different one; and a refused upload
answered `500` — both a body that was not readable multipart and a blocked file type — because the
vault's own error codes (`INVALID_FILE_TYPE`, `EMPTY_FILE`, `NO_FILES`, `FILE_TOO_LARGE`) were never
mapped to HTTP statuses, so a refusal read as a server crash. All five are fixed in this build, and
`verify:files` was re-run afterwards to prove the upload route still behaves for the vault itself.

### Calendar & holiday master run (`scripts/verify-calendar.sh`)

The calendar is the platform's timing surface, so the suite treats it as one: it drives the admin
register, reads the merged agenda the five other modules feed, verifies the working-day maths that
payroll will count against, registers a **real auditor through the admin API** to prove the diary is
scoped to an actual `auditors` row, and confirms the seeded auditor login — which has no profile
behind it — is refused rather than served the platform calendar. It also signs in as a real employee
to prove the employee panel sees the holiday master and their own leave and nothing else. Every fixture, including the
auditor's portal login, is removed at the end and the database is checked clean.

| # | Check group | What it proves | Result |
|---|---|---|---|
| 1 | Access control | anonymous callers are refused every read (`401`) and every write; an employer is refused the admin register, the holiday master and an event creation (`403`); a verifier is refused the register; the panel guards push non-admins off the screens | ✅ 12 checks |
| 2 | Form options | the event form's four pickers (employers, units, auditors, open audits) all answer | ✅ 5 checks |
| 3 | Overview & agenda | the month read carries the grid counts, the merged agenda, the register counters and the per-feed sizes; the agenda answers a month, an explicit window and refuses an impossible month (`422`) | ✅ 11 checks |
| 4 | Event creation | an event is created and stored with its type, priority, visibility, lead time and normalised attendee records; a short title, a malformed start, an end before the start and a bare meeting link are all refused (`422`); **an audit date or payroll period cannot be created by hand** (`422`) — the module that owns the row writes it | ✅ 16 checks |
| 5 | Event editing | the detail reads back with its type label and attendee records; an unchanged save is `409 NO_CHANGE`; an edit reports the fields it changed and **re-arms the reminder**; complete → complete again is `409 INVALID_STATE`; an unknown status is `404`; rescheduling returns it to scheduled | ✅ 11 checks |
| 6 | Module-owned events | a row written by another module refuses deletion without confirmation (`409 IN_USE`) and is only soft-deleted with it; unknown ids are `404` on read, edit and delete; **an auditor account with no auditor profile is refused every diary endpoint (`403`)**; a registered auditor can file their own meeting but not a module-owned type; their register holds only their events, and another auditor's event is `404` by URL, refused to edit and refused to delete — while an audit date in their own diary can be completed but **not deleted** | ✅ 26 checks |
| 7 | Holidays | declared, stored with its derived year, type and paid flag; a duplicate on the same date and scope is `409 DUPLICATE`; a missing date is `422`; the detail, the edit and the year-follows-date rule hold; the register filters by year, type and paid status and carries the counters; a nonsense year is `422`; removal is a soft delete and re-removing is `404` | ✅ 20 checks |
| 8 | National holidays | the three national days are declared for a year in one call, are written as `National`, and a second press adds nothing and reports three skips; a year that is not a year is refused | ✅ 4 checks |
| 9 | Working days | twelve months are reported; January counts 31 calendar days and deducts Republic Day; the weekly off changes the count and is echoed back; an out-of-range year is `422`; **a holiday that falls on the weekly off costs no second day** | ✅ 9 checks |
| 10 | Reminders | an event inside its reminder window is selected; the job run reports its dispatch; the event is flagged, the dispatch is written to the ledger and the reminder lands in-app; a second run sends **nothing twice** and the notification count does not move | ✅ 10 checks |
| 11 | Panel scoping | the employer reads its own month window (an account with no company still gets the window, empty) and its calendar is read-only (`405/403`); the registered auditor's month and pickers read, they can open and remove their own event | ✅ 7 checks |
| 11a | Scoping | an auditor account with **no `auditors` row** behind it has no diary: the register, the month overview, the options and a single event are all refused `403 FORBIDDEN`, and filing an event is refused too — with nothing written. The seeded `auditor.test@` login is not that account (it carries the platform's own `AUD-TEST-0001` record), so the suite creates an unlinked auditor login of its own and sweeps it | ✅ 6 checks |
| 11b | The employee panel | a real employee login (record, portal account and role, swept afterwards) reads the holiday master and **sees no company event, no compliance expiry, no payroll period and nobody else's leave** — a briefing the admin filed in the same month is absent from their agenda; the admin and employer calendars are `403`; the employee screen renders | ✅ 11 checks |
| 12 | Activity trail | creating an event, editing it and declaring a holiday are all in the trail, with the actor recorded and no mutation unlogged | ✅ 5 checks |
| 13 | Screens | the calendar, holiday master and settings screens render for an admin; the auditor's month reads without a window and their screen renders; the employer's screen renders; an employer and an anonymous visitor are redirected off `/admin/calendar` | ✅ 8 checks |
| 14 | Clean-up | no event or holiday fixture is left live or at all, the activity-log and notification fixtures are gone, and the auditor fixture with its portal login is deleted | ✅ 8 checks |

**Total: 163 checks, 0 failures.**

### Document vault run (`scripts/verify-files.sh`)

The suite drives the vault over HTTP as the admin library does, then reads the database to
confirm what the API claims. Fixtures are stamped per run and swept first and last, so it is
safe to re-run.

| # | Check group | What it proves | Result |
|---|---|---|---|
| 1 | Access control | the vault listing, its statistics and its option lists answer for an administrator; an employer is refused the admin endpoint **and** the admin upload (`403`); unknown document ids answer `404` | ✅ 13 checks |
| 2 | Upload with metadata | two files in one multipart request → `201`; category, tags, description, access level and validity date persist exactly as sent; the stored byte count matches; a SHA-256 checksum is recorded; the document starts at version 1 with an `Initial upload` history entry; unknown entity types and access levels are refused `422`; an upload with no file is refused `400` | ✅ 14 checks |
| 3 | Download and accounting | the current revision and the spreadsheet download byte-for-byte; the download lands in `file_access_logs` and increments the counter the detail page shows; vault totals move with the uploads | ✅ 6 checks |
| 4 | Immutable revisions | a new revision becomes v2 of the same document; the old revision still downloads the **old bytes** (proven, not assumed); the history lists both newest-first with change notes and uploaders; the listing shows one row per document at its latest revision and links to the current revision id | ✅ 10 checks |
| 5 | Metadata edits | every field persists; a rename applies to the whole version chain (both rows renamed in SQL); an empty edit is refused `409 NO_CHANGE`; an invalid access level is refused `422` | ✅ 5 checks |
| 6 | Listing, filters, sorting | search by name; filters for module, access level, kind (pdf/sheet/image), category and upload date range; `limit`/pagination reporting; a bogus sort column falls back instead of failing (and the table is still there afterwards); size sorting ascending **and** descending is verified against the returned rows; all ten sort keys answer `200` | ✅ 22 checks |
| 7 | Archive, restore, trail | archiving hides the document from the active listing while the archived filter still finds it; an archived document stays readable with its version history; restoring returns it to the active listing; the activity trail records upload, revision, archive and restore with the acting user | ✅ 13 checks |
| 8 | Panel pages | the library and the document record render `200` with their content; an unknown id reaches the 404 page | ✅ 5 checks |
| 9 | Clean-up | the fixtures (documents, revisions, access logs) are swept; no fixture categories linger; the vault still answers afterwards | ✅ 4 checks |

**Result: 106 passed, 0 failed** — reproducible (green on three consecutive runs).

### Compliance register run (`scripts/verify-compliance.sh`)

The suite drives the five registers over HTTP against the running build: it reads the
seeded legislation, exercises the validation and duplicate refusals, takes a document
through its whole life (create → derive status → verify → renew → remind → delete),
proves the employer panel cannot see another company's register, and smoke-loads every
panel page. Re-running it is safe — the fixture is swept first and every row carries a
run-scoped stamp.

| # | Check group | What it proves | Result |
|---|---|---|---|
| 1 | Seeded register | 9 acts / 22 obligations / 6 instruments / 4 gazette notifications readable with stats; state acts carry their state and Central acts do not; an act detail carries its obligations with their text, its instruments, its notifications and its applicability criteria | ✅ 17 checks |
| 2 | Acts | duplicate name+year refused `409`; state act without a state and Central act claiming one refused `422`; create → `201` with the new id; update persists; missing act `404`; an act holding dependants refuses deletion `409` and the message names rules, regulations, notifications and documents | ✅ 12 checks |
| 3 | Obligations | rule under a missing act `422`; periodic obligation without its due day `422`; one-time obligation carrying a due day `422`; valid create `201`; detail read back; unreferenced deletion `200`; deletion refused `409` while a regulation references it | ✅ 9 checks |
| 4 | Instruments & gazette | regulation under a missing rule `422`; rule belonging to another act `422`; create/read/update/delete; duplicate gazette number `409`; notification read back with its action text | ✅ 10 checks |
| 5 | Documents | status derived from the dates (`Valid` / `Expiring Soon` / `Expired`); validity period becomes the expiry date; duplicate document number `409`; document for a missing employer `422`; search, `compliance_status` and `expiringWithin` filters; list joins the employer and the act; stats count expired and expiring rows | ✅ 20 checks |
| 6 | Lifecycle | verify → `200` with user + timestamp, withdraw, re-verify; renewal without new dates `422`; renewal moves the expiry, recomputes the status to `Valid` and clears the reminder stamp; manual reminder `200` with days-to-expiry, an in-app notification for the administrators and an `email_logs` row on `compliance.document_expiring`; `npm run send:reminders` completes against the register | ✅ 16 checks |
| 7 | Activity trail | `created`, `updated`, `deleted`, `renewed`, `verified`, `reminded` rows on `compliance_*` entities, each carrying the acting user and a description | ✅ 8 checks |
| 8 | Employer scoping | every row belongs to the session's company; the body's `employer_id` is ignored; another company's document is neither readable nor deletable; the employer cannot read the admin register or create through the admin API (`403`); the employer renews and removes **their own** filing | ✅ 12 checks |
| 9 | Public site | `/acts-compliance` renders the seeded legislation and filters by jurisdiction | ✅ 4 checks |
| 10 | Panel pages | all 13 admin/employer compliance pages render `200` with their content, and the activity-trail endpoint answers for a record | ✅ 14 checks |
| 11 | Clean-up | deletions are soft, the seeded register survives the run | ✅ 5 checks |

**Result: 129 passed, 0 failed** — reproducible (green three runs in a row).

### Dynamic module engine run (`scripts/verify-dynamic-modules.sh`)

Every run builds its own module, form, submission and decision over HTTP — nothing
is seeded, so the whole engine is exercised the way a customer's first audit would
be. Fixture for the run recorded here: module 18, form 41, submission 16
(`FSA/2026/000018`).

| Step | Evidence |
|---|---|
| Admin / auditor / verifier sessions | `200`, `redirectTo` per role |
| Module register | lists modules with pagination |
| Module created with its starter form | `201` `{moduleId, formId, slug: fire-safety-compliance-audit-…}` |
| Module settings updated | name, category, TAT, verification flag persisted |
| Second form created | `201` `{formId, slug, sectionCount}` |
| Structure saved in one request | 4 sections · 9 fields · 1 table (select/radio/number/date/formula/signature/checkbox, per-option scores, `max_score`, a total column) |
| Publish guard | a form whose section has no answerable field is refused `422` — *Add at least one field the user can answer* |
| Form published | `v2`, 9 fields, 4 sections, 1 table |
| Module published | `v1.1`; the unfinished form is reported in `skipped[]` and left as a draft instead of blocking the module (`liveForms` 1/2) |
| Access matrix | auditor (CRUD) + verifier (read/approve) recorded on `dynamic_module_role_assignments` |
| Clone / archive / delete | clone keeps forms and assignments; archive then delete; deleted module answers `404` |
| Auditor catalogue | the published module and its published forms appear; unpublished ones never do |
| Start a submission | `201` `FSA/2026/000018`, `resumed: false` |
| Start again | same draft id, `resumed: true` — no duplicate submissions |
| Autosave a draft | `17/30 = 56.67 %`, `filled: 8`, `requiredMissing: 0` |
| Formula evaluated server-side | `risk_score = 15` (10 + 6 − 1) |
| Table totals | `extinguisher_register.capacity_kg = 13.5` |
| Incomplete submit | `422` with field-level `errors[]` (signature + declaration listed) — the envelope now carries the offending fields |
| Signature upload | `POST /api/files/upload` → `files` row on the submission |
| Submit | re-validates the *stored* answers, scores, numbers, renders the PDF, sets `under_review` |
| Locked afterwards | edit → `409`, permissions `{canEdit:false, canSubmit:false}` |
| Submission PDF | `200 application/pdf`, 2 pages, 15.5 kB; text decoded from the embedded fonts contains the submission number, the answers and the table rows |
| Form with submissions | delete → `409` *This form has 1 submission(s) and cannot be deleted — archive it instead* |
| Verifier queue | contains the submission, `stats.underReview` counted |
| Verifier read | read-only (`canEdit:false, canReview:true`), uploads visible |
| Approve | `{status: approved, reviewAction: approved, scorePercentage: 90}` |
| Second decision | `409` — *This submission is already approved* |
| Submitter view | decision, reviewer and score visible; no edit rights |
| PDF after the decision | regenerated as a new file version (15,554 B → 15,961 B) |
| Activity log | `created`, `updated`, `submitted`, `reviewed` on `dynamic_submission` |
| Emails | `submission.submitted` → verifier + admin, `submission.approved` → submitter (attachments included) |
| Admin pages | `/admin/dynamic-modules`, module detail, form builder, `/admin/dynamic-submissions`, record — all `200` |
| Verifier pages | `/verifier/submissions`, review screen — `200` |
| Auditor pages | `/auditor/modules`, `/auditor/submissions`, record — `200`; `/auditor/forms/[formId]` → `307` into the new submission |
| Cross-panel | auditor → `/admin/dynamic-modules` and `/verifier/submissions` → `307` to `/auditor/dashboard` |

Four engine fixes came out of this run and are worth remembering:

1. **A service's field-level issues now travel with the envelope.** `Object.assign(new Error(msg), { code: 'VALIDATION_FAILED', issues })` reaches the client as `errors[]`;
   `handleRouteError` used to drop the `issues`, so a refused submit said *"correct the highlighted answers"* without saying which. The renderer highlights exactly those fields.
2. **An absent `values` / `table_rows` key keeps the stored answers** instead of clearing them. `submissionSaveSchema` no longer defaults them to `{}`, so a submit that only
   carries `send_to_reviewer` — or any partial save — validates what the person actually filled in.
3. **Publishing a module no longer fails because one form inside it is unfinished.** Unfinished forms are left as drafts and returned in `skipped[]` (with the reason), while
   `liveForms` reports how many went live; the admin UI toasts exactly which form still needs work.
4. **The renderer derives the flat `fields`/`tables` lists from `sections`** when the caller (workspace payload or builder preview) supplies the nested shape — one renderer for
   every caller, and the rule engine always has the flat lists it expects.

The four `submission.*` email templates (`submitted`, `approved`, `returned`, `rejected`) were added for the dynamic-form lifecycle; the ten templates the specification
enumerates are unchanged, and the in-app + email + SMS + WhatsApp channels reuse them through the same notification layer as the audit reports.

### Auditor workspace run (`scripts/verify-auditor-workspace.sh`)

A single fresh fixture (employer + portal login, unit, department, two auditors with portal logins, one assignment) is driven through the whole journey over HTTP:

| Step | Evidence |
|---|---|
| Fixture | employer `201`, unit `201`, two auditors with portal logins `201`, assignment `201` |
| First-login gate | both fresh logins change their password (`200`) before any panel page opens |
| Scoping | the auditor's register returns exactly their own assignment; options/stats load; the second auditor gets `403` on the audit, on `/start` and on `/draft`; the auditor gets `403` from `/api/admin/audit-reports` |
| Start | report `RPT/2026/…` created, assignment `In Progress`, employer portal user notified, `start` idempotent (`resumed: true`, still one report) |
| Draft / autosave | `PUT /draft` saves the body with **no** revision and **no** PDF, refreshes score + severity counts, stores the period, advances progress and logs `draft_saved` |
| Resume | the saved body comes back (`findings 2`, `scorecard 3`), draft timestamp present, checklist state persisted, submit gated while corrections are open |
| Submit | revision 2 frozen from the draft, assignment `Submitted`, verifier queued, `audit_report.submitted` email to auditor/verifier/admins |
| Preview / PDF | preview page `200` and the rendered PDF carries the report number, body and version footer |
| Locked while submitted | the composer refuses edits (`409 INVALID_STATE`) while the verifier holds it |
| Return | verifier returns it → `Changes Requested`, three open correction threads, auditor emailed, assignment back to `Changes Requested` |
| Corrections | each thread ticked off by the auditor (with evidence in the draft), "every correction cleared" verified in SQL |
| Resubmit | `Submitted` again, revision **4** frozen, correction text present in the frozen revision |
| Approve | `Approved`, assignment `Approved/100`, next audit date stored, composer `409` afterwards |
| Register | `/api/auditor/reports` scoped to the auditor, approved counted, status filter works |
| Pages | `/auditor/audits`, `/auditor/audits/:id`, `/preview`, `/auditor/reports`, `/auditor/dashboard` all `200`; `/start` `307` once submitted; unknown assignment `404` |

### Audit reports + verifier workflow run (`scripts/verify-reports.sh`)

18 stages, 65 assertions, all on a freshly created employer → unit → auditor → assignment fixture.

| Step | Result |
|---|---|
| Fixtures (employer `KPC…`, unit, auditor, assignment with a verifier) | `201` × 4 |
| Options (`/options`, `?lookups=true`) | 7 statuses, 6 report types, 4 severities, employer/auditor/verifier/assignment lookups |
| Create draft with scorecard + 3 findings + 2 observations | `201`, `RPT/2026/000006`, version 1, score 74, critical 1 / major 1 / minor 1 / observations 2, status `Draft` |
| Second report on the same assignment | `409` with the sentence pointing at the existing report |
| Backwards audit period + a 5-character finding | `422` — `audit_period_to`, `body.findings.0.description` |
| Submit | `200`, revision 2 + PDF (file v2), assignment `Submitted` (90%), verifier queued, activity log, verifier email with the PDF attached |
| PDF content (decoded text) | 3 pages; letterhead, `REPORT NO. RPT/2026/000006`, score summary, severity cards, signature block; footer with report number on all 3 pages, `Page 1 of 3` |
| Verifier queue → start review | 1 row, workload `{pending 1, completed 2, overdue 0}`, then `Under Review` |
| Return for correction (2 structured corrections + summary note) | `200`, 3 `correction_request` rows open, `verifier_comments.returned`, assignment `Changes Requested` (75%), decision revision 3, auditor emailed |
| Resolve correction, edit the body, resubmit | correction `is_resolved=1`, revision 4 on edit, resubmit `200` → revision 5, verifier re-queued, second submission email |
| Approve | `200`, `Approved`, `approved_by` stamped, `next_audit_due` 2027-09-05, assignment `Approved` at 100% with `completed_at`, queue closed, approval logged, auditor emailed |
| List, filters, sorting, pagination, stats | filters by search/status/employer/auditor/score band/critical-only and `pendingVerification` all return the expected rows; stats average score, approvals and critical counts |
| Detail bundle + version diff | 6 versions, 4 comments, verification history, 2 decisions; `versions/compare?against=2&with=5` returns field-level changes |
| PDF regeneration | `200`, the report's PDF file gains version 3 (no duplicate-key error) |
| Archive → delete → reopen | `Archived`; delete soft-deletes (hidden from listings) then `restore` brings it back as `Draft` |
| RBAC | auditor on admin API `403`, auditor on admin page `307`, unauthenticated `401`, admin `200` |
| Pages | `/admin/audit-reports`, `/create`, `/:id`, `/:id/review`, `/:id/edit`, `/verifier/reports`, `/:id`, `/:id/review` all `200`; missing report `404` |

`scripts/pdf-text.py` was written for this run: the PDFs embed Noto Sans subsets, so the content
streams carry glyph ids rather than ASCII. The helper reads each font's `/ToUnicode` CMap
(including the `[<…> …]` bfrange form and ligature entries) and prints the text a human would
read, which is what lets the suite assert on headers, footers and page numbers instead of only
`%PDF-` and a byte count.

Five defects surfaced and were fixed by this run:

1. **A join can only reference tables declared above it.** `LEFT JOIN departments d ON d.id = aa.department_id` sat above `LEFT JOIN audit_assignments aa`, so MariaDB raised `Unknown column 'aa.department_id' in 'ON'` — which surfaced as a `500` on submit and on the PDF route while listing stayed fine.
2. **`addVersion()` counted versions from the root row**, which keeps `version = 1` forever, so a regeneration tried to insert `(file, 2)` twice and hit `uq_fv`. It now takes `MAX(version) + 1` from `file_versions`.
3. **`uq_va` is `(report_id, verifier_id)`**, so a resubmission to the same verifier collided on insert. `reassignVerifierAssignments()` now reopens that verifier's existing row (pending, fresh due date) and only marks *other* holders as reassigned.
4. **Restore could not see a soft-deleted report.** `findReportById`/`updateReport` now take `includeDeleted`, so `POST …/restore` clears `deleted_at` and reopens the report as a `Draft`.
5. **The audit-report footer stamped a `Page x of y` placeholder and drew the real numbers on top of it.** Both strings were in the PDF. `stampFooters` now receives the finished page count, so the real text is drawn once.

### Employee module + document vault + PDF run (`scripts/verify-employees.sh`)

| Step | Result |
|---|---|
| Register an employee through the 14-step payload (portal login, dependents, interview, checklist, Tamil name) | `201`, `EMP/2026/000010`, gross derived 12,500, credentials returned, no warnings |
| Detail read (`GET /api/admin/employees/:id`) | `200` — 16 checklist rows seeded, portal login linked |
| Partial update (designation + one wage head) | `200`, gross recalculated to 14,000 |
| Qualification add → edit → delete | `201` / `200` / `200`; an over-long grade returns a `422` field error instead of a 500 |
| Service record + dependent add | `201` / `201` (the service record inherits the employee's employer) |
| Checklist tick → un-tick → re-tick → clear by row id | `200` × 4, and the register stays at 16 rows |
| List with filters (`employerId`, `departmentId`, `category`, `state`), sort, pagination | `200`, envelope `{ success, data, pagination }` |
| Vault upload → metadata → new revision → download → archive | `201`, versions `[2, 1]`, byte-identical download, `404` after archive |
| Employee document row linked to a vault file | `201`, file id and MIME joined through |
| Personal file PDF | `200 application/pdf`, 4 pages for a fully populated record (< 12), masked Aadhaar/bank |
| Admin pages `/admin/employees`, `/create`, `/:id`, `/:id/edit` | all `200` |
| Soft delete | `200` (login deactivated), detail + page + PDF all `404` afterwards |
| Restore (`POST /api/admin/employees/:id/restore`) | `200` — record and self-service login come back, detail and PDF `200` again |

### Auditors module run (`scripts/verify-auditors.sh`)

| Step | Result |
|---|---|
| Lookups (`?lookups=true`) | `200` — 8 seeded auditor types + employers |
| Register auditor with a portal login | `201`, `AUDT/2026/000001`, credentials returned, no warnings |
| Duplicate email | `409` with the specific sentence *"An auditor with the email … already exists"* |
| Detail + statistics | `200` — workload, reports filed, average turnaround, login, clients, documents |
| Profile update (role, experience, capacity, city) | `200`, written to `audit_trails` |
| Bad PAN / IFSC / pincode | `422` with per-field messages |
| Rating `4.5` then `7` | `200` then `422` (out of range) |
| List, 6 filters, sorting, pagination | all `200`; search by name, type, specialisation, state, availability |
| Options endpoint (with capacity) | `200` — open/max shown per auditor for assignment planning |
| Auditor types: list, create, update, archive, archive-in-use | `200`/`201`/`200`/`200`/`409` |
| Vault upload against the auditor + download | `201`, appears in the documents tab, byte-identical download |
| Admin pages (`/admin/auditors`, `/create`, `/:id`, `/:id/edit`, `/admin/auditor-types`) | all `200` |
| Auditor portal login → admin API / admin page | `403` / `307` (no leak), first-login routed to `/change-password` |
| Archive → detail `404` → restore → detail `200` → re-archive | as expected |

Two fixes came out of this run and are worth remembering:

1. **`#` in an unquoted `.env` value is a comment.** `DB_PASSWORD=LocalDev#2026` resolved to
   `LocalDev` in Next.js and produced `ER_ACCESS_DENIED_ERROR`. Values containing `#`, `$` or
   spaces must be quoted; `lib/utils/env.ts` now applies the same rule so CLI scripts and the
   app can never disagree.
2. **A `NULL` written into a `NOT NULL ... DEFAULT x` column is rejected by MySQL** — the server
   only applies the default when the column is left out of the statement. `lib/db/column-defaults.ts`
   now resolves those nulls to the column default (cached per table) for every employee insert and
   update, which is what let an optional `probation_months` be omitted without a 500.
3. **pdfkit paginates on the current `document.y`, not on the coordinates you pass.** Stamping a
   footer below the text frame therefore spawned a fresh page per stamp and inflated a 3-page
   document to 17. `stampFooters()` now drops the page's bottom margin while it draws.
4. **`parseSearchParams()` returns a `URLSearchParams`, not a plain object** — read it with
   `params.get('key')`. Object-style access silently type-errors on every new route.
5. **Friendly duplicate messages:** services raise `ER_DUP_ENTRY` with their own sentence; the
   global handler now returns that sentence instead of the generic "A record with this value
   already exists", falling back to the driver message parse only for raw MySQL errors.
6. **Server-only code must not reach a client bundle.** `validatePasswordStrength` lived in
   `lib/auth/password.ts` next to the bcrypt import, which broke `next build` with
   `UnhandledSchemeError: node:crypto`. The pure policy now lives in
   `lib/validations/password-policy.ts` and the bcrypt layer re-exports it for server use.

> Sandbox note: `next dev` is periodically reaped in this environment, so the workspace runs the
> **production build** (`npm run build && npm start`). Re-run `npm run build` after pulling
> changes; `npm run dev` is unaffected on a normal machine.

---

### Payroll & HR run (`scripts/verify-payroll.sh`)

The payroll suite is the one that has to be believed: it raises a real company through the
employers API, gives it a portal login, hires three employees through the wizard payload (wages
above the ESI ceiling, wages inside it, and one with no structure at all), sets and revises their
salary structures, marks a whole month of attendance in one pass plus a correction and an overtime
day, adds two leave types, accrues the ledger, applies for leave and has it approved, refused and
withdrawn — and then runs the payroll: create, calculate, approve, lock, pay, publish, PDF, bank
file, bonus, gratuity and a full and final settlement.

What it asserts is the money as much as the plumbing:

* proration over the calendar month's days (`₹33,000 × 29/30 = ₹31,900`), half a day as half a day,
  overtime at twice the ordinary rate, `net = gross − deductions`, and the net written out in words;
* PF at ₹1,800 on the ceiling for both sides, ESI at ₹128/₹553 inside the ceiling and nil above it,
  the State's professional tax, and the run's totals being exactly the sum of its payslips;
* the pay register's CSV (one line per payslip plus a TOTAL line) and the three bank-file formats;
* the bilingual payslip PDF streaming back as a real PDF with the Tamil head names;
* access control the way an intruder would try it — anonymous callers, an employer reaching for the
  platform-wide registers, an auditor, a verifier, an employee reading a colleague's payslip (404),
  and a second company created purely so every cross-tenant read and write is refused for real;
* the paper trail: activity logs for payroll, payslip and leave, the three delivery logs, and the
  month-reminder dispatch guard;
* clean-up, then the same checks over the withdrawn run — a paid run needs `confirm: true` to be
  withdrawn, and its payslips must vanish from the register with it.

```bash
bash scripts/verify-payroll.sh              # 258 checks
VERIFY_PAYROLL_KEEP=1 bash scripts/verify-payroll.sh   # leaves a live payslip behind
npm run check:pdf                           # renders the employee PDF and the payslip
```

`VERIFY_PAYROLL_KEEP=1` exists for `npm run check:pdf`, which renders the newest live payslip —
the keep run leaves its fixtures (company, employees, paid run and published payslips) in place, and
the next ordinary run sweeps them. The render check reports page count, size, timing and the number
of embedded font subsets, and passes at two pages with the Tamil font embedded.

### Employer & employee self-service run (`scripts/verify-selfservice.sh`)

The last Phase 2 gap. The suite drives both new panels the way their real users would — and the way
an intruder would try not to:

* **the company's own file** — the employer signs in with the credentials the platform issued,
  completes the forced first-password change, then reads its own profile, corrects its address
  (the correction is read back from the database) and is **refused, field by field**, the three
  things only the platform may set: `employer_code`, `status` and creating a portal login for itself;
* **units and departments** — adding, correcting and removing its own; a unit that still carries
  employees is refused `409 HAS_EMPLOYEES` (so payroll and attendance can never point at a unit that
  no longer exists), a department attached to **another company's unit** is refused `422`, and both
  of company B's rows answer `404` to company A's session on read, edit and delete;
* **staff** — the register holds only its own people, the employer's picker is deliberately empty in
  this panel, hiring goes through the real 14-step payload (the company id in the body is ignored,
  a foreign id is refused `422`), and the **credentials the employer issues actually sign in** — the
  suite activates that login and uses it;
* **the personal file** — the employer ticks a checklist item, adds/corrects/removes a qualification
  (soft delete verified in SQL), and another company's child register answers `404`;
* **the employee's own record** — the employee reads their profile, employer and wage structure, edits
  their own mobile, address and bank account (read back from the database), and is refused
  `employee_number`, `gross_salary`, `employer_id` and `designation` by name with `422`;
* **documents** — the employee uploads a real PDF into the vault (filed against their own record),
  sees it in the register, downloads it back as `%PDF` served `attachment`, is refused withdrawal
  `409` once the employer has verified it, and successfully withdraws it while it is pending — after
  which a second attempt is `404`;
* **audits and reports** — with real assignments created for both companies, the employer lists its
  own audit, opens it (`assignment`, `history`, `files`), is refused company B's assignment `404`, and
  reads the report register with its pagination; a foreign or unknown report id is `404`;
* **the screens** — all 11 employer pages and all 6 employee pages render `200` for their own role,
  each panel redirects the other panel's user (`30x`) and an anonymous visitor is pushed off the admin
  panel;
* **the trail** — the unit, department, employee and document mutations are all in `activity_logs`
  against the right company;
* **clean-up** — fixtures (both companies, their staff, their logins, the auditor and its assignments)
  are swept, and the sweep itself is asserted.

```bash
npm run verify:selfservice        # 169 checks
```

`employee_documents` has no `verification_status` column — the flag is `is_verified` with
`verified_at`. The withdraw guard and the employee's document register both read those columns, which
is the difference between "awaiting check" and "verified" in the panel.

---

## Operating the stack

```bash
npx tsc --noEmit                 # type-check everything
npm run db:migrate               # apply new migrations (never edit an applied one)
npm run db:seed                  # re-sync reference data (rebuilds role grants)
npm run send:reminders           # compliance + audit reminders
npx tsx scripts/generate-schema-docs.ts   # refresh SCHEMA.md
bash scripts/verify-employees.sh          # employee + vault + PDF acceptance run
bash scripts/verify-auditors.sh           # auditor module acceptance run
bash scripts/verify-reports.sh            # audit report + verifier lifecycle run (70 checks)
bash scripts/verify-assignments.sh        # audit assignment acceptance run (29 checks)
bash scripts/verify-auditor-workspace.sh  # auditor panel end-to-end run (56 checks)
npm run verify:dynamic-modules            # dynamic module engine run (60 checks)
npm run verify:compliance                 # compliance register run (129 checks)
npm run verify:files                      # document vault run (106 checks)
npm run verify:logs                       # logs & audit trails run (139 checks)
npm run verify:settings                   # settings module run (231 checks)
npm run verify:cms                        # CMS module run (203 checks)
npm run verify:calendar                   # calendar & holiday master run (163 checks)
npm run verify:payroll                    # payroll & HR module run (258 checks)
npm run fixture:phase3                    # rebuild the demo module/form/submission

python3 scripts/smoke-panels.py          # every sidebar destination in admin/auth, auditor, verifier, employer (91 pages)
python3 scripts/smoke-links.py           # crawls the links those pages actually render (90 destinations)
python3 scripts/smoke-employee-panel.py  # hires a real employee, walks the employee menu (13 pages), sweeps the fixture

bash scripts/enable-swap.sh              # recreate the 3 GB build swapfile a sandbox restart wipes
bash scripts/bootstrap-sandbox.sh        # MariaDB + deps + migrations + seeds + panel logins + swap (idempotent)

npx tsx scripts/check-pdf.ts [employeeId] [payslipId]   # PDF layout check (pages, timing, embedded fonts)
python3 scripts/pdf-text.py file.pdf      # read the text a generated PDF renders
```

Seeded administrator: **admin@complianceos.local / Admin@2026** (change at first sign-in).
