import { requirePanel } from '@/lib/auth/permission-check';
import { getPanelContext, getAuditorCounts } from '@/lib/auth/panel-context';
import { AuditorLayout } from '@/components/layouts/auditor-layout';

export default async function AuditorPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePanel(['auditor']);
  const [context, counts] = await Promise.all([getPanelContext('auditor'), getAuditorCounts(user.auditorId)]);

  return (
    <AuditorLayout
      user={context.topbar}
      notifications={context.notifications}
      unreadCount={context.unreadCount}
      counts={counts}
    >
      {children}
    </AuditorLayout>
  );
}
