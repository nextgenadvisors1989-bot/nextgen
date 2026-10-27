'use client';

import { adminMenu } from '@/components/navigation/sidebar-menus';
import { PanelShell } from './panel-shell';
import { QuickQuotationButton } from '@/components/billing/quick-quotation';
import type { TopbarNotification, TopbarUser } from '@/components/navigation/topbar';
import type { ReactNode } from 'react';

export function AdminLayout({ user, children, notifications, unreadCount, counts }: {
  user: TopbarUser;
  children: ReactNode;
  notifications?: TopbarNotification[];
  unreadCount?: number;
  counts?: { employees?: number; employers?: number; pendingVerification?: number; openAudits?: number };
}) {
  return (
    <PanelShell
      user={user}
      sections={adminMenu(counts)}
      panelLabel="Admin Panel"
      notifications={notifications}
      unreadCount={unreadCount}
      title="Administration"
      topbarActions={<QuickQuotationButton />}
    >
      {children}
    </PanelShell>
  );
}
