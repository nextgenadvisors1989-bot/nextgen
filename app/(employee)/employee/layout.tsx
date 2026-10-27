import { requirePanel } from '@/lib/auth/permission-check';
import { getPanelContext } from '@/lib/auth/panel-context';
import { EmployeeLayout } from '@/components/layouts/employee-layout';

export default async function EmployeePanelLayout({ children }: { children: React.ReactNode }) {
  await requirePanel(['employee']);
  const context = await getPanelContext('employee');

  return (
    <EmployeeLayout
      user={context.topbar}
      notifications={context.notifications}
      unreadCount={context.unreadCount}
    >
      {children}
    </EmployeeLayout>
  );
}
