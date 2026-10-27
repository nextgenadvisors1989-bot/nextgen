import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getEmployerDashboardData } from '@/services/dashboard.service';
import { EmployerDashboard } from '@/components/dashboards/employer-dashboard';

export const metadata: Metadata = { title: 'Employer Dashboard' };
export const dynamic = 'force-dynamic';

export default async function EmployerDashboardPage() {
  const user = await requirePageUser();
  const data = await getEmployerDashboardData(user.employerId ?? 0);
  return <EmployerDashboard data={data} companyName={data.companyName} />;
}
