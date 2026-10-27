'use client';

/**
 * Resource create/edit form.
 *
 * A resource must be reachable: either a file uploaded into the vault (the
 * upload field is the vault's own, so the bytes are checksummed and versioned) or
 * an external address. Publishing stamps `published_at` once, so the library can
 * show when something first became available.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Switch } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { RESOURCE_TYPES, RESOURCE_STATUSES, slugify } from '@/lib/validations/cms.validation';

export interface ResourceDetailRow {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  resource_type: string;
  category: string | null;
  act_id: number | null;
  file_id: number | null;
  file_name: string | null;
  external_url: string | null;
  thumbnail: string | null;
  requires_login: number | boolean;
  sort_order: number;
  status: string;
  published_at: string | null;
  download_count: number;
  act_name?: string | null;
}

export function ResourceForm({
  mode,
  resource,
  actOptions,
  canEdit,
}: {
  mode: 'create' | 'edit';
  resource?: ResourceDetailRow;
  actOptions: { value: string; label: string; hint?: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState({
    title: resource?.title ?? '',
    slug: resource?.slug ?? '',
    description: resource?.description ?? '',
    resource_type: resource?.resource_type ?? 'Guide',
    category: resource?.category ?? '',
    act_id: resource?.act_id ? String(resource.act_id) : '',
    file_id: resource?.file_id ? String(resource.file_id) : '',
    external_url: resource?.external_url ?? '',
    thumbnail: resource?.thumbnail ?? '',
    requires_login: Boolean(Number(resource?.requires_login ?? 0)),
    sort_order: String(resource?.sort_order ?? 0),
    status: resource?.status ?? 'draft',
  });
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setIssues((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  /** Uploads into the vault and remembers the file id for the resource row. */
  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('files', file);
      formData.append('folder', 'Resources');
      formData.append('title', form.title || file.name);
      const response = await fetch('/api/admin/cms/media/upload', {
        method: 'POST',
        body: formData,
        headers: { 'x-csrf-token': readCsrf() },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        errorToast(payload?.message ?? `Upload failed (${response.status})`);
        return;
      }

      const mediaId = (payload.data as { created?: number[] } | undefined)?.created?.[0];
      if (mediaId) {
        const detail = await api.get<{ media: { file_id: number | null; file_name: string } }>(`/api/admin/cms/media/${mediaId}`);
        if (detail.ok) {
          const media = (detail.data as { media: { file_id: number | null } }).media;
          if (media.file_id) set('file_id', String(media.file_id));
        }
      }

      success(`${file.name} uploaded — the file is in the vault and the library, and is now attached to this resource`);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setIssues({});
    try {
      const payload = {
        title: form.title,
        slug: form.slug || undefined,
        description: form.description || null,
        resource_type: form.resource_type,
        category: form.category || null,
        act_id: form.act_id ? Number(form.act_id) : null,
        file_id: form.file_id ? Number(form.file_id) : null,
        external_url: form.external_url || null,
        thumbnail: form.thumbnail || null,
        requires_login: form.requires_login,
        sort_order: Number(form.sort_order) || 0,
        status: form.status,
      };

      const result =
        mode === 'create'
          ? await api.post<{ id: number }>('/api/admin/cms/resources', payload)
          : await api.put(`/api/admin/cms/resources/${resource?.id}`, payload);

      if (!result.ok) {
        const mapped: Record<string, string> = {};
        if (Array.isArray(result.errors)) {
          for (const issue of result.errors) mapped[issue.field] = issue.message;
        }
        setIssues(mapped);
        errorToast(result.message);
        return;
      }

      success(result.message);
      if (mode === 'create') {
        const created = result.data as { id: number } | undefined;
        router.push(`/admin/cms/resources/${created?.id ?? ''}`);
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <Card>
          <CardBody className="space-y-5">
            <h2 className="section-title">The resource</h2>
            <Input
              label="Title" required value={form.title} error={issues.title}
              onChange={(event) => set('title', event.target.value)}
            />
            <Input
              label="Slug" value={form.slug} error={issues.slug}
              placeholder={slugify(form.title) || 'inspection-checklist'}
              helper={`Public address: /resources/${form.slug || slugify(form.title) || '…'}`}
              onChange={(event) => set('slug', event.target.value)}
            />
            <Textarea
              label="Description" rows={5} value={form.description}
              helper="Explains what the download contains and who it is for."
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => set('description', event.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Type" value={form.resource_type}
                onChange={(value) => set('resource_type', value)}
                options={RESOURCE_TYPES.map((type) => ({ value: type, label: type }))}
              />
              <Input
                label="Category" value={form.category} placeholder="Statutory registers"
                onChange={(event) => set('category', event.target.value)}
              />
            </div>
            <Select
              label="Related act" value={form.act_id} error={issues.act_id}
              helper="Links the resource to the legislation it explains."
              onChange={(value) => set('act_id', value)}
              options={[
                { value: '', label: 'Not tied to a specific act' },
                ...actOptions.map((act) => ({ value: act.value, label: act.label })),
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-5">
            <div>
              <h2 className="section-title">What people download</h2>
              <p className="mt-1 text-[13px] text-ink-muted">
                A resource needs either an uploaded file or an external address — the platform refuses a resource that
                leads nowhere.
              </p>
            </div>

            <div className="rounded-lg border border-line p-4">
              <p className="text-sm font-medium text-ink">Uploaded file</p>
              <p className="mt-1 text-[12px] text-ink-muted">
                {form.file_id
                  ? resource?.file_name ?? `Vault file #${form.file_id}`
                  : 'No file attached yet — upload one into the document vault.'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  className="focus-ring w-full max-w-sm rounded-lg border border-line bg-white px-3 py-2 text-sm"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                  }}
                />
                {uploading && <span className="text-[12px] text-ink-muted">Uploading…</span>}
              </div>
              <Input
                label="Or link an existing vault file by id" type="number" min={1}
                value={form.file_id} error={issues.file_id}
                helper="Useful when the file was uploaded through the Document Vault screen."
                onChange={(event) => set('file_id', event.target.value)}
              />
            </div>

            <Input
              label="External address" value={form.external_url} error={issues.external_url}
              placeholder="https://…"
              helper="For a resource that lives somewhere else: a video, an external tool, a partner site."
              onChange={(event) => set('external_url', event.target.value)}
            />
            <Input
              label="Thumbnail URL" value={form.thumbnail}
              placeholder="/api/files/12/download"
              onChange={(event) => set('thumbnail', event.target.value)}
            />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardBody className="space-y-5">
            <h2 className="section-title">Publishing</h2>
            <Select
              label="Status" value={form.status}
              onChange={(value) => set('status', value)}
              options={RESOURCE_STATUSES.map((status) => ({ value: status, label: status }))}
            />
            <Switch
              checked={form.requires_login}
              label="Ask visitors to sign in"
              onChange={(checked) => set('requires_login', checked)}
            />
            <p className="text-[12px] text-ink-muted">
              A gated resource still shows its description publicly; the download itself asks for a sign-in.
            </p>
            <Input
              label="Sort order" type="number" min={0} value={form.sort_order}
              helper="Lower numbers appear first in the library."
              onChange={(event) => set('sort_order', event.target.value)}
            />
            {mode === 'edit' && resource && (
              <dl className="space-y-2 text-[12px] text-ink-muted">
                <div className="flex justify-between gap-3">
                  <dt>Downloads</dt>
                  <dd className="text-ink">{resource.download_count}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Published</dt>
                  <dd className="text-ink">{resource.published_at ? resource.published_at.slice(0, 10) : 'Not yet'}</dd>
                </div>
              </dl>
            )}
          </CardBody>
        </Card>

        {canEdit && (
          <Card>
            <CardBody className="space-y-3">
              <Button onClick={save} loading={saving} fullWidth>
                {mode === 'create' ? 'Create resource' : 'Save resource'}
              </Button>
              <Link href="/admin/cms/resources" className="block text-center text-[13px] text-brand-600 hover:underline">
                Back to the library
              </Link>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function readCsrf(): string {
  const match = document.cookie.match(/(?:^|;\s*)cos_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
