import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getDocumentDetail } from '@/services/compliance.service';
import { DocumentForm, type DocumentFormValues } from '@/components/compliance/document-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit Compliance Document' };

export default async function EditDocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const id = Number(documentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  await requirePageUser();
  let data;
  try {
    data = await getDocumentDetail(id);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    throw error;
  }

  const row = data.document as Record<string, unknown>;
  const date = (value: unknown) => (value ? String(value).slice(0, 10) : '');
  const initial: DocumentFormValues = {
    id,
    employer_id: String(row.employer_id ?? ''),
    unit_id: row.unit_id ? String(row.unit_id) : '',
    document_name: String(row.document_name ?? ''),
    document_type: String(row.document_type ?? 'Licence'),
    document_number: String(row.document_number ?? ''),
    issuing_authority: String(row.issuing_authority ?? ''),
    act_id: row.act_id ? String(row.act_id) : '',
    rule_id: row.rule_id ? String(row.rule_id) : '',
    issue_date: date(row.issue_date),
    expiry_date: date(row.expiry_date),
    validity_period_days: row.validity_period_days ? String(row.validity_period_days) : '',
    remind_days_before: row.remind_days_before ? String(row.remind_days_before) : '30',
    renewal_responsibility: String(row.renewal_responsibility ?? ''),
    fee_amount: row.fee_amount !== null && row.fee_amount !== undefined ? String(row.fee_amount) : '',
    notes: String(row.notes ?? ''),
    is_verified: Boolean(row.is_verified),
    file_id: row.file_id ? Number(row.file_id) : null,
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Edit {initial.document_name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Changing the dates recomputes the status and re-arms the expiry reminders.
        </p>
      </header>
      <DocumentForm mode="edit" initial={initial} />
    </div>
  );
}
