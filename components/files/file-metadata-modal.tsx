'use client';

/**
 * Shared metadata editor for the vault.
 *
 * Used by the library table and by the document detail page, so both surfaces
 * write the same fields through the same endpoint. `is_archived` doubles as the
 * restore switch: tick it to archive, untick it to bring the document back.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { FILE_ACCESS_LABELS } from '@/types/file';

export interface FileMetadataTarget {
  id: number;
  original_name: string;
  category: string | null;
  description: string | null;
  tags: string | null;
  access_level: string;
  expires_at: string | null;
  is_archived: number | boolean;
  latest_version?: number;
  version_count?: number;
}

export function FileMetadataModal({
  file, onClose, onSaved,
}: {
  file: FileMetadataTarget | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({
    original_name: '', category: '', description: '', tags: '', access_level: 'private', expires_at: '', is_archived: false,
  });

  // Reload the form whenever a different document is opened.
  useEffect(() => {
    if (!file) return;
    setValues({
      original_name: file.original_name,
      category: file.category ?? '',
      description: file.description ?? '',
      tags: file.tags ?? '',
      access_level: file.access_level,
      expires_at: file.expires_at ? String(file.expires_at).slice(0, 10) : '',
      is_archived: Boolean(Number(file.is_archived)),
    });
  }, [file]);

  async function save() {
    if (!file) return;
    if (!values.original_name.trim()) {
      errorToast('File name is required', 'Give the document the name it is filed under.');
      return;
    }

    setSaving(true);
    const result = await api.patch(`/api/admin/files/${file.id}`, {
      original_name: values.original_name.trim(),
      category: values.category,
      description: values.description,
      tags: values.tags,
      access_level: values.access_level,
      expires_at: values.expires_at,
      is_archived: values.is_archived,
    });
    setSaving(false);

    if (result.ok) {
      success('Document updated', result.message ?? `${values.original_name} was saved.`);
      onClose();
      onSaved?.();
      router.refresh();
    } else {
      errorToast('Could not update the document', result.message);
    }
  }

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      title="Edit document"
      description={file
        ? `Revision ${Number(file.latest_version ?? 1)} of ${Number(file.version_count ?? 1)} — metadata applies to the whole history.`
        : ''}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save Changes</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="File name" requiredMark value={values.original_name}
          onChange={(event) => setValues((current) => ({ ...current, original_name: event.target.value }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Category" value={values.category} placeholder="Licence, Certificate, Policy…"
            onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))}
          />
          <Select
            label="Access level" value={values.access_level}
            onChange={(value) => setValues((current) => ({ ...current, access_level: value }))}
            options={Object.entries(FILE_ACCESS_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Input
            label="Tags" value={values.tags}
            onChange={(event) => setValues((current) => ({ ...current, tags: event.target.value }))}
          />
          <DatePicker
            label="Valid until" value={values.expires_at}
            onChange={(value) => setValues((current) => ({ ...current, expires_at: value }))}
          />
        </div>
        <Textarea
          label="Description" rows={2} value={values.description}
          onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
        />
        <label className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
          <input
            type="checkbox" className="h-4 w-4" checked={values.is_archived}
            onChange={(event) => setValues((current) => ({ ...current, is_archived: event.target.checked }))}
          />
          <span className="text-sm text-ink-soft">
            Archived
            <span className="block text-xs text-ink-muted">
              Archived documents stay in storage but leave the active listing. Untick to restore.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
