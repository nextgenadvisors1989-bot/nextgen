import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { DocumentForm } from '@/components/compliance/document-form';

export const metadata: Metadata = { title: 'Add Compliance Document' };
export const dynamic = 'force-dynamic';

export default async function CreateEmployerDocumentPage() {
  const user = await requirePageUser();
  const employer = await queryOne<RowDataPacket>(
    'SELECT company_name FROM employers WHERE id = ? AND deleted_at IS NULL',
    [Number(user.employerId ?? 0)]
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Add a Document</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Record one of {employer?.company_name ?? 'your company'}&apos;s licences or registration certificates, its
          issue date and either the expiry date or the validity period printed on it.
        </p>
      </header>
      <DocumentForm
        mode="create"
        lockedEmployer={{ id: Number(user.employerId ?? 0), name: String(employer?.company_name ?? 'Your company') }}
      />
    </div>
  );
}
