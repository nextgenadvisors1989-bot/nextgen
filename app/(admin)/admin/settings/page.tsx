import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { SettingsOverview, type SettingsOverviewProps } from '@/components/settings/settings-overview';
import { JobsPanel, type ScheduledJob } from '@/components/settings/jobs-panel';
import { SettingsForm, type ResolvedSettingMap } from '@/components/settings/settings-form';
import { getAllSettings, getSettingsOverview, integrationStatus } from '@/services/setting.service';
import { SETTINGS_SCREENS, sectionsFor } from '@/lib/settings/definitions';
import { JOB_TYPE_LABELS } from '@/lib/validations/setting.validation';

export const metadata: Metadata = { title: 'System Settings' };
export const dynamic = 'force-dynamic';

export default async function SystemSettingsPage() {
  const user = await requirePanel(['admin', 'super_admin']);

  const [overview, all, integrations] = await Promise.all([
    getSettingsOverview(),
    getAllSettings(),
    integrationStatus(),
  ]);

  const canEdit = hasPermission(user.permissions, 'settings.update');

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings"
        description="The platform's own configuration — identity, locale, interface defaults, the security switches and the scheduled jobs that keep compliance and audit reminders moving."
        breadcrumbs={[{ label: 'Dashboard', href: '/admin/dashboard' }, { label: 'Settings' }]}
      />

      <SettingsOverview
        stats={overview.stats}
        groups={overview.groups}
        screens={SETTINGS_SCREENS as SettingsOverviewProps['screens']}
        integrations={integrations}
        unknownGroups={overview.unknownGroups}
      />

      <SettingsForm
        group="system"
        label="System"
        sections={sectionsFor('system')}
        initial={all.system as unknown as ResolvedSettingMap}
        canEdit={canEdit}
        note="Locale and page-size changes apply to every screen on the next load; the security switches take effect immediately."
      />

      <JobsPanel jobs={overview.jobs as unknown as ScheduledJob[]} typeLabels={JOB_TYPE_LABELS} canEdit={canEdit} />
    </div>
  );
}
