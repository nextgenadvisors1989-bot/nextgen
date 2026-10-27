import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { CompanySettings } from '@/components/settings/company-settings';
import { getAllSettings } from '@/services/setting.service';
import { sectionsFor } from '@/lib/settings/definitions';
import type { ResolvedSettingMap } from '@/components/settings/settings-form';

export const metadata: Metadata = { title: 'Company Settings' };
export const dynamic = 'force-dynamic';

export default async function CompanySettingsPage() {
  const user = await requirePanel(['admin', 'super_admin']);
  const all = await getAllSettings();
  const logo = all.company.find((entry) => entry.key === 'logo_path');
  const letterhead = all.company.find((entry) => entry.key === 'letterhead_path');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Settings"
        description="The legal entity behind every document the platform generates: the audit report letterhead, the employee personal file, payslip footers, emails and the public site."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Settings', href: '/admin/settings' },
          { label: 'Company' },
        ]}
      />
      <CompanySettings
        sections={sectionsFor('company')}
        initial={all.company as unknown as ResolvedSettingMap}
        canEdit={hasPermission(user.permissions, 'settings.update')}
        logoUrl={logo?.isSet ? logo.displayValue : null}
        letterheadUrl={letterhead?.isSet ? letterhead.displayValue : null}
      />
    </div>
  );
}
