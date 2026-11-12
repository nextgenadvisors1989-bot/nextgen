'use client';

/**
 * Obligations, Regulations and Gazette notifications of the compliance register on one page, one tab each (they were three separate menu items). Each tab is the same
 * list as before; the address keeps ?tab= so a tab can be bookmarked, and the old addresses (/admin/compliance/rules, /regulations, /notifications) lead here.
 */
import { Tabs } from '@/components/ui/tabs';
import { RulesTable } from '@/components/compliance/rules-table';
import { RegulationsTable } from '@/components/compliance/regulations-table';
import { NotificationsTable } from '@/components/compliance/notifications-table';

export interface NoticePermissions {
  rules: { create: boolean; update: boolean; delete: boolean };
  regulations: { create: boolean; update: boolean; delete: boolean };
  notifications: { create: boolean; update: boolean; delete: boolean };
}

export function NoticesTabs({ defaultTab, permissions }: { defaultTab: 'rules' | 'regulations' | 'notifications'; permissions: NoticePermissions }) {
  const { rules, regulations, notifications } = permissions;
  return (
    <Tabs
      defaultTab={defaultTab}
      onChange={(key) => { try { window.history.replaceState(null, '', `?tab=${key}`); } catch { /* the address bar is a convenience only */ } }}
      items={[
        {
          key: 'rules', label: 'Obligations',
          content: (
            <div className="space-y-3 pt-4">
              <p className="text-sm text-ink-muted">What an establishment has to do under an Act: how often it falls due, who owns it, the evidence an auditor asks for and the penalty for missing it.</p>
              <RulesTable canCreate={rules.create} canUpdate={rules.update} canDelete={rules.delete} />
            </div>
          ),
        },
        {
          key: 'regulations', label: 'Regulations',
          content: (
            <div className="space-y-3 pt-4">
              <p className="text-sm text-ink-muted">The rules, schemes and orders issued under each Act, with the authority they report to and how often that reporting falls due.</p>
              <RegulationsTable canCreate={regulations.create} canUpdate={regulations.update} canDelete={regulations.delete} />
            </div>
          ),
        },
        {
          key: 'notifications', label: 'Gazette notifications',
          content: (
            <div className="space-y-3 pt-4">
              <p className="text-sm text-ink-muted">Notifications that change what establishments must do (wage ceilings, leave entitlements, registration duties) with the action each one requires.</p>
              <NotificationsTable canCreate={notifications.create} canUpdate={notifications.update} canDelete={notifications.delete} />
            </div>
          ),
        },
      ]}
    />
  );
}
