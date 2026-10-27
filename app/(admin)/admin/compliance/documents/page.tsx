import type { Metadata } from 'next';
import { requirePageUser, hasPermission } from '@/lib/auth/permission-check';
import { DocumentsTable } from '@/components/compliance/documents-table';

export const metadata: Metadata = { title: 'Compliance Documents' };
export const dynamic = 'force-dynamic';

export default async function ComplianceDocumentsPage() {
  const user = await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Compliance Documents</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The legal register: every employer&apos;s licences, certificates, permits and returns. Status is derived
          from the expiry date, and the nightly reminder job emails whoever owns the renewal.
        </p>
      </header>
      <DocumentsTable
        canCreate={hasPermission(user.permissions, 'compliance_document.create')}
        canDelete={hasPermission(user.permissions, 'compliance_document.delete')}
      />
    </div>
  );
}
