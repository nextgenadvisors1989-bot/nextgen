import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { IntegrationSettings } from '@/components/settings/integration-settings';
import { getAllSettings, integrationStatus } from '@/services/setting.service';
import { sectionsFor } from '@/lib/settings/definitions';
import type { ResolvedSettingMap } from '@/components/settings/settings-form';

export const metadata: Metadata = { title: 'WhatsApp Settings' };
export const dynamic = 'force-dynamic';

export default async function WhatsAppSettingsPage() {
  const user = await requirePanel(['admin', 'super_admin']);
  const [all, integrations] = await Promise.all([getAllSettings(), integrationStatus()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp Settings"
        description="Meta Cloud API or Twilio WhatsApp delivery for employer-facing updates: audit assignments, submitted reports, payslips and compliance expiry notices."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Settings', href: '/admin/settings' },
          { label: 'WhatsApp' },
        ]}
      />
      <IntegrationSettings
        channel="whatsapp"
        label="WhatsApp"
        sections={sectionsFor('whatsapp')}
        initial={all.whatsapp as unknown as ResolvedSettingMap}
        canEdit={hasPermission(user.permissions, 'settings.update')}
        integrations={integrations}
        templatesUsed={integrations.templates.whatsapp}
      />
    </div>
  );
}
