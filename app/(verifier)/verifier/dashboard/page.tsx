import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getVerifierDashboardData } from '@/services/dashboard.service';
import { VerifierDashboard } from '@/components/dashboards/verifier-dashboard';
import { StartHere } from '@/components/help/start-here';

export const metadata: Metadata = { title: 'Verifier Dashboard' };
export const dynamic = 'force-dynamic';

export default async function VerifierDashboardPage() {
  const user = await requirePageUser();
  const data = await getVerifierDashboardData(user.id);
  return (
    <div className="space-y-6">
      <StartHere role="verifier" />
      <VerifierDashboard data={data} userName={user.fullName} />
    </div>
  );
}
