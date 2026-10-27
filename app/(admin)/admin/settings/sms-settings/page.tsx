import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { IntegrationSettings } from '@/components/settings/integration-settings';
import { getAllSettings, integrationStatus } from '@/services/setting.service';
import { sectionsFor } from '@/lib/settings/definitions';
import type { ResolvedSettingMap } from '@/components/settings/settings-form';

export const metadata: Metadata = { title: 'SMS Settings' };
export const dynamic = 'force-dynamic';

export default async function SmsSettingsPage() {
  const user = await requirePanel(['admin', 'super_admin']);
  const [all, integrations] = await Promise.all([getAllSettings(), integrationStatus()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Settings"
        description="Twilio or MSG91 delivery for short transactional messages: audit assignments, due reminders, payslip alerts and leave decisions."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Settings', href: '/admin/settings' },
          { label: 'SMS' },
        ]}
      />
      <IntegrationSettings
        channel="sms"
        label="SMS"
        sections={sectionsFor('sms')}
        initial={all.sms as unknown as ResolvedSettingMap}
        canEdit={hasPermission(user.permissions, 'settings.update')}
        integrations={integrations}
        templatesUsed={integrations.templates.sms}
      />
    </div>
  );
}
