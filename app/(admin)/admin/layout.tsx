import { requirePanel } from '@/lib/auth/permission-check';
import { getPanelContext, getAdminCounts } from '@/lib/auth/panel-context';
import { AdminLayout } from '@/components/layouts/admin-layout';

/**
 * Admin panel shell. `requirePanel` rejects any non-admin role on every
 * /admin/* route, including direct URL entry.
 */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  await requirePanel(['admin', 'super_admin']);
  const [context, counts] = await Promise.all([getPanelContext('admin'), getAdminCounts()]);

  return (
    <AdminLayout
      user={context.topbar}
      notifications={context.notifications}
      unreadCount={context.unreadCount}
      counts={counts}
    >
      {children}
    </AdminLayout>
  );
}
