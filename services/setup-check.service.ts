/**
 * The go-live checklist of the administrator: what is still sample or missing before real clients use the platform.
 * Every line is computed from the live database each time the page opens (nothing is typed in by hand), says what is
 * wrong in plain words, and links to the exact screen where it is fixed. The same checks drive the banner on the
 * administrator's dashboard.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { verifyPassword } from '@/lib/auth/password';
import { GSTIN_PATTERN, isSampleValue } from '@/lib/utils/sample-values';
import { getHomeBlocks } from '@/services/site.service';

export type CheckStatus = 'ok' | 'todo' | 'warn';

export interface SetupCheck {
  id: string;
  group: 'Company' | 'Website' | 'Messages' | 'Security' | 'Data';
  title: string;
  status: CheckStatus;
  /** What was found, in plain words. */
  detail: string;
  /** Where to fix it. */
  href?: string;
  action?: string;
}

/** The sign-in password that is printed in the project's public README and test scripts. */
const PUBLIC_DEMO_ADMIN_PASSWORD = 'Admin@2026';
const WEAK_BY_HASH = new Map<string, boolean>();
/** Logins of the demo (the local seed data and scripts/seed-client-demo.py): the checklist asks for them to be switched off before real clients are given theirs. */
const DEMO_EMAIL_PATTERN = ['%@demo.complianceos.local', '%@complianceos.local', '%@emp.demo.complianceos.local', '%@complianceos.example',
  'demo.admin@nextgenseadvisors.com', 'team.auditor@nextgenseadvisors.com', 'employer@gmail.com', 'employee@gmail.com', 'auditor@gmail.com', 'verifier@gmail.com'];

async function settings(group: string, keys: string[]): Promise<Record<string, string>> {
  const rows = await query<RowDataPacket>(
    `SELECT setting_key, setting_value FROM settings WHERE setting_group = ? AND setting_key IN (${keys.map(() => '?').join(',')})`,
    [group, ...keys]
  ).catch(() => [] as RowDataPacket[]);
  return Object.fromEntries(rows.map((row) => [String(row.setting_key), String(row.setting_value ?? '').trim()]));
}

export async function getSetupChecks(): Promise<SetupCheck[]> {
  const checks: SetupCheck[] = [];
  const company = await settings('company', ['company_name', 'company_address', 'company_phone', 'company_email', 'company_gstin', 'company_state', 'bank_name', 'logo_path']);
  const missing = (key: string) => !company[key] || isSampleValue(company[key]);

  // ── Company ──
  const contactGaps = ['company_name', 'company_address', 'company_phone', 'company_email'].filter(missing);
  checks.push({
    id: 'company-contact', group: 'Company', title: 'Company name, address, phone and e-mail',
    status: contactGaps.length ? 'todo' : 'ok',
    detail: contactGaps.length
      ? `Not filled in with your real details yet (${contactGaps.map((key) => key.replace('company_', '')).join(', ')}). The website, invoices and e-mails use these.`
      : 'Filled in. They appear on the website, invoices and e-mails.',
    href: '/admin/settings/company-settings', action: 'Open company settings',
  });
  const gstin = (company.company_gstin ?? '').toUpperCase();
  checks.push({
    id: 'company-gstin', group: 'Company', title: 'GSTIN for invoices and quotations',
    status: !gstin || isSampleValue(gstin) ? 'todo' : GSTIN_PATTERN.test(gstin) ? 'ok' : 'warn',
    detail: !gstin || isSampleValue(gstin)
      ? 'Not entered (or still the sample number). Invoices and quotations are printed with it.'
      : GSTIN_PATTERN.test(gstin) ? 'Entered and in the right format.' : `“${gstin}” does not look like a GSTIN (15 characters). Please check it.`,
    href: '/admin/settings/company-settings', action: 'Open company settings',
  });
  checks.push({
    id: 'company-bank', group: 'Company', title: 'Bank details printed on invoices',
    status: company.bank_name ? 'ok' : 'warn',
    detail: company.bank_name ? 'Entered.' : 'Not entered. Invoices go out without payment details.',
    href: '/admin/settings/company-settings', action: 'Open company settings',
  });

  // ── Website ──
  const social = await settings('company', ['social_facebook', 'social_linkedin', 'social_twitter', 'social_instagram', 'social_youtube']);
  const genericSocial = Object.entries(social).filter(([, value]) => /^https?:\/\/(www\.)?(facebook|linkedin|x|twitter|instagram|youtube)\.com\/?$/i.test(value)).map(([key]) => key.replace('social_', ''));
  checks.push({
    id: 'site-social', group: 'Website', title: 'Social media links in the top bar',
    status: genericSocial.length ? 'warn' : 'ok',
    detail: genericSocial.length
      ? `${genericSocial.join(', ')} point to the social site's own home page, not to your page. Enter your page address, or clear the field to hide the icon.`
      : 'Each icon in the top bar opens your own page (blank ones are hidden).',
    href: '/admin/settings/company-settings', action: 'Open company settings',
  });
  const home = await getHomeBlocks();
  checks.push({
    id: 'site-photo', group: 'Website', title: 'Principal’s photo on the home page',
    status: home.spotlight.imageUrl ? 'ok' : 'todo',
    detail: home.spotlight.imageUrl ? 'Uploaded.' : 'No photo yet — the home page shows a letter in a box instead.',
    href: '/admin/cms/home', action: 'Open home page editor',
  });
  checks.push({
    id: 'site-home', group: 'Website', title: 'Home page wording',
    status: Object.values(home).some((block) => block.customised) ? 'ok' : 'warn',
    detail: Object.values(home).some((block) => block.customised) ? 'You have edited the home page.' : 'Still the wording the site was built with. Read it once and change what is not right.',
    href: '/admin/cms/home', action: 'Open home page editor',
  });

  // ── Messages ──
  const email = await settings('email', ['enabled', 'smtp_host', 'smtp_username', 'smtp_password', 'from_email']);
  const emailReady = email.enabled !== 'false' && Boolean(email.smtp_host && email.smtp_username && email.smtp_password) && !isSampleValue(email.from_email);
  checks.push({
    id: 'email', group: 'Messages', title: 'E-mail sending',
    status: emailReady ? 'ok' : 'todo',
    detail: emailReady
      ? 'Set up. Password resets, notices and reminders are e-mailed.'
      : 'Not set up. Nobody receives a password reset, an enquiry copy or a reminder by e-mail until the mail server details and a real “From” address are entered.',
    href: '/admin/settings/email-settings', action: 'Open e-mail settings',
  });

  // ── Security ──
  const demo = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL AND status = 'active' AND (${DEMO_EMAIL_PATTERN.map(() => 'email LIKE ?').join(' OR ')})`,
    DEMO_EMAIL_PATTERN
  ).catch(() => null);
  const demoCount = Number(demo?.n ?? 0);
  checks.push({
    id: 'demo-accounts', group: 'Security', title: 'Demo sign-ins',
    status: demoCount ? 'warn' : 'ok',
    detail: demoCount
      ? `${demoCount} sample account${demoCount === 1 ? ' is' : 's are'} still active (their passwords are in the project files). Switch them off before real clients are given access.`
      : 'No sample accounts are active.',
    href: '/admin/users', action: 'Open users',
  });
  const admins = await query<RowDataPacket>(
    `SELECT DISTINCT u.id, u.email, u.password_hash FROM users u
       JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
      WHERE r.slug IN ('admin', 'super_admin') AND u.deleted_at IS NULL AND u.status = 'active'`
  ).catch(() => [] as RowDataPacket[]);
  const weak: string[] = [];
  for (const admin of admins) {
    const hash = String(admin.password_hash);
    // bcrypt is slow on purpose: a hash always gives the same answer, so each one is checked once per server run.
    if (!WEAK_BY_HASH.has(hash)) WEAK_BY_HASH.set(hash, await verifyPassword(PUBLIC_DEMO_ADMIN_PASSWORD, hash));
    if (WEAK_BY_HASH.get(hash)) weak.push(String(admin.email));
  }
  checks.push({
    id: 'admin-password', group: 'Security', title: 'Administrator password',
    status: weak.length ? 'todo' : 'ok',
    detail: weak.length
      ? `${weak.join(', ')} still signs in with the password written in the project files. Anyone who reads them can sign in as administrator. Change it now.`
      : 'No administrator uses the published demo password.',
    href: '/admin/settings', action: 'Open settings',
  });
  const maintenance = await settings('system', ['maintenance_mode']);
  checks.push({
    id: 'maintenance', group: 'Security', title: 'Maintenance mode',
    status: maintenance.maintenance_mode === 'true' ? 'warn' : 'ok',
    detail: maintenance.maintenance_mode === 'true' ? 'Switched on: only administrators can sign in.' : 'Off. Everyone can sign in.',
    href: '/admin/settings', action: 'Open settings',
  });

  // ── Data ──
  const factorCount = await queryOne<RowDataPacket>("SELECT COUNT(*) AS n FROM dm_emission_factors WHERE deleted_at IS NULL AND status = 'approved'").catch(() => null);
  checks.push({
    id: 'emission-factors', group: 'Data', title: 'Emission factors for the carbon footprint',
    status: Number(factorCount?.n ?? 0) > 0 ? 'ok' : 'warn',
    detail: Number(factorCount?.n ?? 0) > 0 ? `${factorCount?.n} approved factor(s) in the register.` : 'No factor is approved yet, so the Data Management GHG figures stay empty. Enter the client’s official factors with their source.',
    href: '/admin/data-management/factors', action: 'Open emission factors',
  });
  const backup = await queryOne<RowDataPacket>("SELECT MAX(completed_at) AS last FROM backup_history WHERE status = 'completed'").catch(() => null);
  const last = backup?.last ? new Date(String(backup.last)) : null;
  const ageDays = last ? Math.floor((Date.now() - last.getTime()) / 86_400_000) : null;
  checks.push({
    id: 'backup', group: 'Data', title: 'Database backup',
    status: ageDays === null ? 'todo' : ageDays > 7 ? 'warn' : 'ok',
    detail: ageDays === null ? 'No backup has been taken yet.' : ageDays > 7 ? `The last backup is ${ageDays} days old.` : `Last backup ${ageDays === 0 ? 'today' : `${ageDays} day${ageDays === 1 ? '' : 's'} ago`}.`,
    href: '/admin/settings/backup-settings', action: 'Open backup settings',
  });
  const acts = await queryOne<RowDataPacket>('SELECT COUNT(*) AS n FROM compliance_acts WHERE deleted_at IS NULL').catch(() => null);
  checks.push({
    id: 'acts', group: 'Data', title: 'Acts library',
    status: Number(acts?.n ?? 0) > 0 ? 'ok' : 'warn',
    detail: Number(acts?.n ?? 0) > 0 ? `${acts?.n} Acts are in the library.` : 'No Acts yet. The public Acts page and the auditor library are empty.',
    href: '/admin/compliance/acts', action: 'Open Acts & Rules',
  });
  return checks;
}

export function summariseChecks(checks: SetupCheck[]) {
  return { total: checks.length, todo: checks.filter((c) => c.status === 'todo').length, warn: checks.filter((c) => c.status === 'warn').length, ok: checks.filter((c) => c.status === 'ok').length };
}
