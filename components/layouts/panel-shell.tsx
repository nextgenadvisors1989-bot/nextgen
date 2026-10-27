'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar, MobileSidebar, type MenuSection } from '@/components/navigation/sidebar';
import { Topbar, type TopbarNotification, type TopbarUser } from '@/components/navigation/topbar';
import { ToastProvider } from '@/components/ui/toast';

export interface PanelShellProps {
  user: TopbarUser;
  sections: MenuSection[];
  panelLabel: string;
  notifications?: TopbarNotification[];
  unreadCount?: number;
  title?: string;
  children: ReactNode;
  sidebarFooter?: ReactNode;
  /** Extra icon buttons for the top bar (before search and notifications). */
  topbarActions?: ReactNode;
}

/**
 * Shared chrome for all five panels: fixed sidebar on desktop, off-canvas on
 * mobile, sticky 64px header, canvas background, and a toast provider.
 */
export function PanelShell({
  user, sections, panelLabel, notifications = [], unreadCount = 0, title, children, sidebarFooter, topbarActions,
}: PanelShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-surface-canvas">
        <div className="hidden lg:block">
          <div className="fixed inset-y-0 left-0 z-40">
            <Sidebar sections={sections} panelLabel={panelLabel} footer={sidebarFooter} />
          </div>
        </div>

        <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)}>
          <Sidebar sections={sections} panelLabel={panelLabel} onNavigate={() => setMobileOpen(false)} footer={sidebarFooter} />
        </MobileSidebar>

        <div className="flex min-w-0 flex-1 flex-col lg:pl-[260px]">
          <Topbar
            user={user}
            onMenuClick={() => setMobileOpen(true)}
            notifications={notifications}
            unreadCount={unreadCount}
            title={title}
            actions={topbarActions}
          />
          <main className="animate-fade-up flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
