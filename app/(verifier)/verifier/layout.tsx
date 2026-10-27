import { requirePanel } from '@/lib/auth/permission-check';
import { getPanelContext, getVerifierCounts } from '@/lib/auth/panel-context';
import { VerifierLayout } from '@/components/layouts/verifier-layout';

export default async function VerifierPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePanel(['verifier']);
  const [context, counts] = await Promise.all([getPanelContext('verifier'), getVerifierCounts(user.id)]);

  return (
    <VerifierLayout
      user={context.topbar}
      notifications={context.notifications}
      unreadCount={context.unreadCount}
      counts={counts}
    >
      {children}
    </VerifierLayout>
  );
}
