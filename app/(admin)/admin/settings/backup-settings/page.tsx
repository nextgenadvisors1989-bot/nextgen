import type { Metadata } from 'next';
import { requirePanel, hasPermission } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { BackupSettings } from '@/components/settings/backup-settings';
import { getAllSettings, filesInBackupDirectory, storageHealth } from '@/services/setting.service';
import { sectionsFor } from '@/lib/settings/definitions';
import type { ResolvedSettingMap } from '@/components/settings/settings-form';

export const metadata: Metadata = { title: 'Backup Settings' };
export const dynamic = 'force-dynamic';

export default async function BackupSettingsPage() {
  const user = await requirePanel(['admin', 'super_admin']);
  const [all, storage, files] = await Promise.all([getAllSettings(), storageHealth(), filesInBackupDirectory()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup Settings"
        description="Schedule, retention window and storage location for database dumps, with the lifetime history of every run and what is actually on disk right now."
        breadcrumbs={[
          { label: 'Dashboard', href: '/admin/dashboard' },
          { label: 'Settings', href: '/admin/settings' },
          { label: 'Backup' },
        ]}
      />
      <BackupSettings
        sections={sectionsFor('backup')}
        initial={all.backup as unknown as ResolvedSettingMap}
        canEdit={hasPermission(user.permissions, 'settings.update')}
        storage={storage}
        files={files}
      />
    </div>
  );
}
