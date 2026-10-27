import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { SettingsForm } from '@/components/settings/settings-form';
import { getAllSettings } from '@/services/setting.service';
import { sectionsFor } from '@/lib/settings/definitions';
import type { ResolvedSettingMap } from '@/components/settings/settings-form';

export const metadata: Metadata = { title: 'Audit Defaults' };
export const dynamic = 'force-dynamic';

export default async function AuditSettingsPage() {
  const user = await requirePanel(['admin', 'super_admin']);
  const all = await getAllSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Defaults"
        description="What a new audit assignment starts with, how far ahead the reminder job warns, and whether a submitted report must be verified before release."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Settings', href: '/admin/settings' },
          { label: 'Audit' },
        ]}
      />
      <SettingsForm
        group="audit"
        label="Audit"
        sections={sectionsFor('audit')}
        initial={all.audit as unknown as ResolvedSettingMap}
        canEdit={hasPermission(user.permissions, 'settings.update')}
        note="These defaults feed the assignment form, the reminder job and the verification gate on submitted reports."
      />
    </div>
  );
}
