'use client';

import { employeeMenu } from '@/components/navigation/sidebar-menus';
import { PanelShell } from './panel-shell';
import type { TopbarNotification, TopbarUser } from '@/components/navigation/topbar';
import type { ReactNode } from 'react';

export function EmployeeLayout({ user, children, notifications, unreadCount, dataManagement }: {
  user: TopbarUser;
  dataManagement?: boolean;
  children: ReactNode;
  notifications?: TopbarNotification[];
  unreadCount?: number;
}) {
  return (
    <PanelShell
      user={user}
      sections={employeeMenu({ dataManagement })}
      panelLabel="Employee"
      notifications={notifications}
      unreadCount={unreadCount}
      title="My Workspace"
    >
      {children}
    </PanelShell>
  );
}
