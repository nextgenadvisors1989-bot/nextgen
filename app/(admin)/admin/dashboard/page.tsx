import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getAdminDashboardData } from '@/services/dashboard.service';
import { getSetupChecks, summariseChecks } from '@/services/setup-check.service';
import { AdminDashboard } from '@/components/dashboards/admin-dashboard';
import { StartHere } from '@/components/help/start-here';

export const metadata: Metadata = { title: 'Admin Dashboard' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [user, data, checks] = await Promise.all([requirePageUser(), getAdminDashboardData(), getSetupChecks().catch(() => [])]);
  const sum = summariseChecks(checks);
  return (
    <div className="space-y-6">
      {sum.todo > 0 && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            <strong>{sum.todo} thing{sum.todo === 1 ? '' : 's'} to finish before launch</strong> — {checks.filter((check) => check.status === 'todo').map((check) => check.title).slice(0, 3).join(', ')}
            {sum.todo > 3 ? ' and more' : ''}.
          </p>
          <Link href="/admin/setup" className="rounded-md bg-amber-900 px-3 py-1.5 font-medium text-white hover:bg-amber-800">Open the go-live checklist</Link>
        </div>
      )}
      <StartHere role="admin" />
      <AdminDashboard data={data} userName={user.fullName} />
    </div>
  );
}
