import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { FilesLibrary } from '@/components/files/files-library';

export const metadata: Metadata = { title: 'Document Vault' };
export const dynamic = 'force-dynamic';

export default async function FilesPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Document Vault</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every file the platform stores — employer licences, employee records, audit evidence, payslips and
          generated PDFs. Files are versioned: re-uploading creates a new revision and keeps the old one
          downloadable, and archiving is a soft delete so nothing leaves the audit trail.
        </p>
      </header>
      <FilesLibrary
        canUpload={hasPermission(user.permissions, 'file.create')}
        canEdit={hasPermission(user.permissions, 'file.update')}
        canDelete={hasPermission(user.permissions, 'file.delete')}
        canExport={hasPermission(user.permissions, 'file.export')}
      />
    </div>
  );
}
