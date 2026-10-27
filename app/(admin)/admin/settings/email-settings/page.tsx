import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { IntegrationSettings } from '@/components/settings/integration-settings';
import { getAllSettings, integrationStatus } from '@/services/setting.service';
import { sectionsFor } from '@/lib/settings/definitions';
import type { ResolvedSettingMap } from '@/components/settings/settings-form';

export const metadata: Metadata = { title: 'Email Settings' };
export const dynamic = 'force-dynamic';

export default async function EmailSettingsPage() {
  const user = await requirePanel(['admin', 'super_admin']);
  const [all, integrations] = await Promise.all([getAllSettings(), integrationStatus()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Settings"
        description="SMTP, SendGrid or Office 365 delivery for every transactional message — credentials, activation links, audit notifications and payslips."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Settings', href: '/admin/settings' },
          { label: 'Email' },
        ]}
      />
      <IntegrationSettings
        channel="email"
        label="Email"
        sections={sectionsFor('email')}
        initial={all.email as unknown as ResolvedSettingMap}
        canEdit={hasPermission(user.permissions, 'settings.update')}
        integrations={integrations}
        templatesUsed={integrations.templates.email}
      />
    </div>
  );
}
