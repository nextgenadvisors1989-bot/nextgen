import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { HolidaysRegister } from '@/components/calendar/holidays-register';

export const metadata: Metadata = { title: 'Holiday Master' };
export const dynamic = 'force-dynamic';

export default async function AdminHolidaysPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Holiday master</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          The establishment&apos;s holidays: the three national days that fall on the same date every year, the state and
          festival days, and the company days that belong to a single employer. Every panel&apos;s calendar reads this
          register, and the working-day count behind attendance and payroll is computed from it — so a holiday declared
          here is a day payroll does not pay against.
        </p>
      </header>
      <HolidaysRegister
        canCreate={hasPermission(user.permissions, 'holiday.create')}
        canEdit={hasPermission(user.permissions, 'holiday.update')}
        canDelete={hasPermission(user.permissions, 'holiday.delete')}
        canExport={hasPermission(user.permissions, 'holiday.export')}
      />
    </div>
  );
}
