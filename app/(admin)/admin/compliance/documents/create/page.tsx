import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/auth/permission-check';
import { DocumentForm } from '@/components/compliance/document-form';

export const metadata: Metadata = { title: 'Record Compliance Document' };
export const dynamic = 'force-dynamic';

export default async function CreateDocumentPage() {
  await requirePageUser();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Record a Document</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Give the issue date and either an expiry date or a validity period — the register works out whether it
          is valid, expiring or lapsed.
        </p>
      </header>
      <DocumentForm mode="create" />
    </div>
  );
}
