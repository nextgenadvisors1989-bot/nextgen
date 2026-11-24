import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_NAME } from '@/lib/utils/constants';

/** Centred split layout shared by every authentication screen. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-1/2 flex-col justify-between bg-sidebar p-12 text-white lg:flex">
        <Link href="/" className="inline-flex w-fit items-center rounded-2xl bg-white px-5 py-3 shadow-lg" aria-label={`${APP_NAME} - home`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt={APP_NAME} className="h-14 w-auto max-w-[240px] object-contain" />
        </Link>

        <div>
          <p className="text-3xl font-bold leading-tight">
            All Compliance Under One Umbrella.
          </p>
          <p className="mt-4 max-w-md text-slate-300">
            Statutory compliance, industrial safety, occupational health, labour welfare, social compliance, environmental management, ESG and climate action,
            with every audit, report and record in one place.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {[
              'Role-based panels for Admin, Auditor, Employer, Employee and Verifier',
              'Audits, assessments, permits and reports signed and verified on the screen',
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

        <p className="text-xs text-slate-400">© {new Date().getFullYear()} NextGen Socio and Enviro Advisors</p>
      </aside>

      <main className="flex w-full items-center justify-center bg-surface-canvas px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          {children}
          <p className="mt-8 text-center text-xs text-ink-muted">
            By signing in you agree to our <Link href="/terms-conditions" className="font-semibold underline">Terms &amp; Conditions</Link> and{' '}
            <Link href="/privacy-policy" className="font-semibold underline">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
