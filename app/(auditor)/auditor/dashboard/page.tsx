import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getAuditorDashboardData } from '@/services/dashboard.service';
import { AuditorDashboard } from '@/components/dashboards/auditor-dashboard';
import { StartHere } from '@/components/help/start-here';

export const metadata: Metadata = { title: 'Auditor Dashboard' };
export const dynamic = 'force-dynamic';

export default async function AuditorDashboardPage() {
  const user = await requirePageUser();
  const data = await getAuditorDashboardData(user.auditorId ?? 0);
  return (
    <div className="space-y-6">
      <StartHere role="auditor" />
      <AuditorDashboard data={data} userName={user.fullName} />
    </div>
  );
}
