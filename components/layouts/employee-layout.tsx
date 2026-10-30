'use client';

import { employeeMenu } from '@/components/navigation/sidebar-menus';
import { PanelShell } from './panel-shell';
import type { TopbarNotification, TopbarUser } from '@/components/navigation/topbar';
import type { ReactNode } from 'react';

export function EmployeeLayout({ user, children, notifications, unreadCount }: {
  user: TopbarUser;
  children: ReactNode;
  notifications?: TopbarNotification[];
  unreadCount?: number;
}) {
  return (
    <PanelShell
      user={user}
      sections={employeeMenu()}
      panelLabel="Employee"
      notifications={notifications}
      unreadCount={unreadCount}
      title="My Workspace"
    >
      {children}
    </PanelShell>
  );
}
