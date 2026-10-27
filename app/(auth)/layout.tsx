import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_NAME } from '@/lib/utils/constants';

/** Centred split layout shared by every authentication screen. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-1/2 flex-col justify-between bg-sidebar p-12 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold">C</span>
          <span className="text-xl font-bold">{APP_NAME}</span>
        </Link>

        <div>
          <h1 className="text-3xl font-bold leading-tight">
            Compliance, audits, HR and payroll — one platform.
          </h1>
          <p className="mt-4 max-w-md text-slate-300">
            Run statutory compliance registers, schedule and verify safety audits, maintain employee records,
            and process payroll with bilingual payslips.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {[
              'Role-based panels for Admin, Auditor, Employer, Employee and Verifier',
              'Dynamic audit modules — HAZOP, HACCP, safety, risk and inspections',
              'Legal register with expiry reminders on email, SMS and WhatsApp',
              'PF, ESI, PT and gratuity aware payroll engine',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-[11px] text-brand-300">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500">© {new Date().getFullYear()} ComplianceOS Technologies Pvt Ltd</p>
      </aside>

      <main className="flex w-full items-center justify-center bg-surface-canvas px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
