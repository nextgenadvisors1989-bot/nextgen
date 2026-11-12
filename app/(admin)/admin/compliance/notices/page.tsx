import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { NoticesTabs } from '@/components/compliance/notices-tabs';

export const metadata: Metadata = { title: 'Obligations & Notices' };
export const dynamic = 'force-dynamic';

const TABS = ['rules', 'regulations', 'notifications'] as const;

export default async function ComplianceNoticesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const { tab } = await searchParams;
  const can = (resource: string) => ({
    create: hasPermission(user.permissions, `${resource}.create`),
    update: hasPermission(user.permissions, `${resource}.update`),
    delete: hasPermission(user.permissions, `${resource}.delete`),
  });
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Obligations &amp; Notices</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The duties that come out of the Acts, the regulations issued under them and the Gazette notifications that change them. The Acts themselves, with their full text, are under Acts &amp; Rules.
        </p>
      </header>
      <NoticesTabs
        defaultTab={(TABS as readonly string[]).includes(tab ?? '') ? (tab as (typeof TABS)[number]) : 'rules'}
        permissions={{ rules: can('compliance_rule'), regulations: can('compliance_regulation'), notifications: can('compliance_notification') }}
      />
    </div>
  );
}
