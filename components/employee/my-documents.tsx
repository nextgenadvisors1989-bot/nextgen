'use client';

/**
 * The employee's own document vault: what is on file, what the employer has
 * verified, and the two things the employee may do — upload and withdraw.
 *
 * A verified document cannot be withdrawn: verification is the employer's act and
 * only the employer can lift it, so the row says so instead of offering a button
 * that would be refused.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { Spinner } from '@/components/ui/loader';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatFileSize } from '@/lib/files/file-format';

interface DocumentRow {
  id: number;
  document_type: string;
  document_name: string;
  document_number: string | null;
  file_id: number | null;
  original_name: string | null;
  size_bytes: number | null;
  is_verified: number;
  verified_at: string | null;
  created_at: string;
}

/** The types the vault accepts, from the platform's own document taxonomy. */
const DOCUMENT_TYPES = [
  'Aadhaar Card', 'PAN Card', 'Passport', 'Driving Licence', 'Voter ID',
  'Educational Certificate', 'Experience Certificate', 'Relieving Letter',
  'Bank Passbook', 'Cancelled Cheque', 'Medical Certificate', 'Police Verification',
  'Photograph', 'Signature', 'Other',
];

export function MyDocuments() {
  const toast = useToast();
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<DocumentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ document_type: DOCUMENT_TYPES[0], document_name: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<DocumentRow[]>('/api/employee/documents');
      setRows(response.data ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Your documents could not be loaded');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function withdraw() {
    if (!pending) return;
    setBusy(true);
    try {
      const response = await api.delete<{ withdrawn: boolean }>(`/api/employee/documents/${pending.id}`);
      if (!response.ok) { toast.error(response.message); return; }
      toast.success('Document withdrawn');
      setPending(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be withdrawn');
    } finally {
      setBusy(false);
    }
  }

  const verified = rows.filter((row) => Number(row.is_verified) === 1).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="On file" value={rows.length} tone="brand" />
        <StatCard label="Verified" value={verified} tone="emerald" />
        <StatCard label="Awaiting verification" value={rows.length - verified} tone={rows.length - verified ? 'amber' : 'slate'} />
      </div>

      <Card padded={false}>
        <CardHeader
          title="Upload a document"
          description="Filed against your own record and shared with your employer's personal file."
        />
        <div className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-soft">Document type</span>
              <select
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                value={form.document_type}
                onChange={(event) => setForm((current) => ({ ...current, document_type: event.target.value }))}
              >
                {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-soft">Document name</span>
              <input
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                value={form.document_name}
                placeholder="e.g. ITI certificate 2019"
                onChange={(event) => setForm((current) => ({ ...current, document_name: event.target.value }))}
              />
            </label>
          </div>

          <FileUpload
            label="The file"
            accept="application/pdf,image/*"
            maxSizeMb={25}
            entityType="EMPLOYEE"
            category={form.document_type}
            endpoint="/api/employee/documents"
            extraFields={{ document_type: form.document_type, document_name: form.document_name }}
            helper="PDF, JPG or PNG. It appears on the register below and is shared with your employer."
            onUploaded={() => { toast.success('Document uploaded'); void load(); }}
            onError={(message) => toast.error(message)}
          />
        </div>
      </Card>

      <Card padded={false}>
        <CardHeader title="My documents" description="Everything filed against your record." />
        {loading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing on file yet" subtitle="Upload your certificates and identity papers above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Document', 'Type', 'Verified', 'Uploaded', ''].map((header) => (
                    <th key={header} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-6 py-3">
                      <p className="font-medium text-ink">{row.document_name}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {row.original_name ?? '—'}{row.size_bytes ? ` · ${formatFileSize(row.size_bytes)}` : ''}
                        {row.document_number ? ` · ${row.document_number}` : ''}
                      </p>
                    </td>
                    <td className="px-6 py-3 text-ink-soft">{row.document_type}</td>
                    <td className="px-6 py-3">
                      {Number(row.is_verified) === 1
                        ? <Badge tone="success">verified {row.verified_at ? formatDate(row.verified_at) : ''}</Badge>
                        : <Badge tone="warning">pending</Badge>}
                    </td>
                    <td className="px-6 py-3 text-ink-muted">{formatDate(row.created_at)}</td>
                    <td className="px-6 py-3 text-right">
                      {row.file_id ? (
                        <a href={`/api/files/${row.file_id}/download`} className="mr-3 text-sm font-medium text-brand-600 hover:underline">
                          Download
                        </a>
                      ) : null}
                      {Number(row.is_verified) === 1 ? (
                        <span className="text-xs text-ink-muted">Verified — ask your employer to return it</span>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setPending(row)}>Withdraw</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        onConfirm={withdraw}
        loading={busy}
        title="Withdraw this document?"
        message={`${pending?.document_name ?? 'The document'} will be taken off your register. You can upload it again at any time.`}
        confirmLabel="Withdraw"
      />
    </div>
  );
}
