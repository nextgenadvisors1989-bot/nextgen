import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getAdminDashboardData } from '@/services/dashboard.service';
import { AdminDashboard } from '@/components/dashboards/admin-dashboard';

export const metadata: Metadata = { title: 'Admin Dashboard' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [user, data] = await Promise.all([requirePageUser(), getAdminDashboardData()]);
  return <AdminDashboard data={data} userName={user.fullName} />;
}
