import { requirePanel } from '@/lib/auth/permission-check';
import { getPanelContext, getEmployerCounts } from '@/lib/auth/panel-context';
import { EmployerLayout } from '@/components/layouts/employer-layout';

export default async function EmployerPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePanel(['employer']);
  const [context, counts] = await Promise.all([getPanelContext('employer'), getEmployerCounts(user.employerId)]);

  return (
    <EmployerLayout
      user={context.topbar}
      notifications={context.notifications}
      unreadCount={context.unreadCount}
      counts={counts}
    >
      {children}
    </EmployerLayout>
  );
}
