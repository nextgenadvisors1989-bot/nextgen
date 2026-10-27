'use client';

import { employerMenu } from '@/components/navigation/sidebar-menus';
import { PanelShell } from './panel-shell';
import type { TopbarNotification, TopbarUser } from '@/components/navigation/topbar';
import type { ReactNode } from 'react';

export function EmployerLayout({ user, children, notifications, unreadCount, counts }: {
  user: TopbarUser;
  children: ReactNode;
  notifications?: TopbarNotification[];
  unreadCount?: number;
  counts?: { employees?: number; upcomingAudits?: number; expiringDocuments?: number };
}) {
  return (
    <PanelShell
      user={user}
      sections={employerMenu(counts)}
      panelLabel="Employer Panel"
      notifications={notifications}
      unreadCount={unreadCount}
      title="Employer Workspace"
    >
      {children}
    </PanelShell>
  );
}
