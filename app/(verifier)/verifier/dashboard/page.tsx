import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getVerifierDashboardData } from '@/services/dashboard.service';
import { VerifierDashboard } from '@/components/dashboards/verifier-dashboard';

export const metadata: Metadata = { title: 'Verifier Dashboard' };
export const dynamic = 'force-dynamic';

export default async function VerifierDashboardPage() {
  const user = await requirePageUser();
  const data = await getVerifierDashboardData(user.id);
  return <VerifierDashboard data={data} userName={user.fullName} />;
}
