'use client';

import { auditorMenu } from '@/components/navigation/sidebar-menus';
import { PanelShell } from './panel-shell';
import type { TopbarNotification, TopbarUser } from '@/components/navigation/topbar';
import type { ReactNode } from 'react';

export function AuditorLayout({ user, children, notifications, unreadCount, counts }: {
  user: TopbarUser;
  children: ReactNode;
  notifications?: TopbarNotification[];
  unreadCount?: number;
  counts?: { openAudits?: number; isWater?: boolean };
}) {
  return (
    <PanelShell
      user={user}
      sections={auditorMenu(counts)}
      panelLabel="Auditor Panel"
      notifications={notifications}
      unreadCount={unreadCount}
      title="Auditor Workspace"
    >
      {children}
    </PanelShell>
  );
}
