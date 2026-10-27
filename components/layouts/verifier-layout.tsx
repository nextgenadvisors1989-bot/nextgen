'use client';

import { verifierMenu } from '@/components/navigation/sidebar-menus';
import { PanelShell } from './panel-shell';
import type { TopbarNotification, TopbarUser } from '@/components/navigation/topbar';
import type { ReactNode } from 'react';

export function VerifierLayout({ user, children, notifications, unreadCount, counts }: {
  user: TopbarUser;
  children: ReactNode;
  notifications?: TopbarNotification[];
  unreadCount?: number;
  counts?: { pending?: number };
}) {
  return (
    <PanelShell
      user={user}
      sections={verifierMenu(counts)}
      panelLabel="Verifier Panel"
      notifications={notifications}
      unreadCount={unreadCount}
      title="Verification Workspace"
    >
      {children}
    </PanelShell>
  );
}
