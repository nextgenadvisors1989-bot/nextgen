import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { StatutoryRegisters } from '@/components/payroll/statutory-registers';

export const metadata: Metadata = { title: 'Statutory Registers' };
export const dynamic = 'force-dynamic';

export default async function StatutoryRegistersPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Statutory Registers</h1>
        <p className="mt-1 max-w-4xl text-sm text-ink-muted">
          The three obligations that sit beside monthly payroll: the annual statutory bonus under the Payment of Bonus Act, gratuity under the Payment of Gratuity Act, and the full and final settlement when an employee leaves. Each is computed from live data — the days paid, the last drawn basic and DA, the leave ledger — and stored as it was computed.
        </p>
      </header>
      <StatutoryRegisters />
    </div>
  );
}
