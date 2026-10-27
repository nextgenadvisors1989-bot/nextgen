import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getAuditorDashboardData } from '@/services/dashboard.service';
import { AuditorDashboard } from '@/components/dashboards/auditor-dashboard';

export const metadata: Metadata = { title: 'Auditor Dashboard' };
export const dynamic = 'force-dynamic';

export default async function AuditorDashboardPage() {
  const user = await requirePageUser();
  const data = await getAuditorDashboardData(user.auditorId ?? 0);
  return <AuditorDashboard data={data} userName={user.fullName} />;
}
