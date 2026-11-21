import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/breadcrumb';
import { hasPermission, requirePanel } from '@/lib/auth/permission-check';
import { REGISTER_BY_CODE } from '@/lib/data-management/registers';
import { DataManagementHome } from './dm-home';
import { RegisterScreen } from './dm-register';
import type { DmContext } from './dm-common';

export type DmPanel = 'employer' | 'employee' | 'auditor' | 'admin';

const PANELS: Record<DmPanel, { guard: string[]; base: string; dashboard: string; needsCompany: boolean; blurb: string }> = {
  employer: { guard: ['employer'], base: '/employer/data-management', dashboard: '/employer/dashboard', needsCompany: false, blurb: 'Your factory\'s daily purchases, stock, production, transport, water, energy, waste and emissions in one place: enter them once, and the day, week, month and year totals, the balances, the KPIs and the carbon footprint are worked out for you.' },
  employee: { guard: ['employee'], base: '/employee/data-management', dashboard: '/employee/dashboard', needsCompany: false, blurb: 'Enter the records your employer has asked you to enter. You can correct your own records until the employer has verified them.' },
  auditor: { guard: ['auditor'], base: '/auditor/data-management', dashboard: '/auditor/dashboard', needsCompany: true, blurb: 'Any company\'s records, read-only: use them to check the figures of an audit. Choose the company first.' },
  admin: { guard: ['admin', 'super_admin'], base: '/admin/data-management', dashboard: '/admin/dashboard', needsCompany: true, blurb: 'Any company\'s records, read-only, with the emission-factor register that the carbon calculation uses. Choose the company first.' },
};

function parseEmployer(value: string | undefined): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function guard(panel: DmPanel) {
  const user = await requirePanel(PANELS[panel].guard);
  if (!hasPermission(user.permissions, 'data_management.read')) notFound();
  return user;
}

export async function DmHomePage({ panel, searchParams }: { panel: DmPanel; searchParams: Promise<{ employer_id?: string }> }) {
  await guard(panel);
  const { employer_id } = await searchParams;
  const cfg = PANELS[panel];
  const ctx: DmContext = { basePath: cfg.base, employerId: cfg.needsCompany ? parseEmployer(employer_id) : null, needsCompany: cfg.needsCompany };
  return (
    <div className="space-y-5">
      <PageHeader title="Data Management" description={cfg.blurb} breadcrumbs={[{ label: 'Dashboard', href: cfg.dashboard }, { label: 'Data Management' }]} />
      <DataManagementHome ctx={ctx} viewer={panel} />
    </div>
  );
}

export async function DmRegisterPage({ panel, code, searchParams }: { panel: DmPanel; code: string; searchParams: Promise<{ employer_id?: string }> }) {
  await guard(panel);
  const register = REGISTER_BY_CODE[code.toUpperCase()];
  if (!register) notFound();
  const { employer_id } = await searchParams;
  const cfg = PANELS[panel];
  const ctx: DmContext = { basePath: cfg.base, employerId: cfg.needsCompany ? parseEmployer(employer_id) : null, needsCompany: cfg.needsCompany };
  return (
    <div className="space-y-5">
      <PageHeader title={register.name} description={`${register.code} · ${register.frequency} · ${register.module}`} breadcrumbs={[{ label: 'Dashboard', href: cfg.dashboard }, { label: 'Data Management', href: cfg.base }, { label: register.code }]} />
      <RegisterScreen ctx={ctx} code={register.code} />
    </div>
  );
}
