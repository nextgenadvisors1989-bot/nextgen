'use client';

/**
 * The Home page editor.
 *
 * The home page of the public website is built from blocks. This screen lists them top to bottom in the order the
 * visitor meets them, each with a plain-language name and what it is for. Open a block, change the words, press Save;
 * the website shows it at once. "Back to the standard text" returns a block to what it said when the site was built.
 * The fields of every block come from lib/public/home-blocks.ts, the same catalogue the page itself reads.
 */
import { useMemo, useState } from 'react';
import { Button, LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Switch, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { HOME_BLOCKS, ICON_NAMES, type HomeBlockMeta, type ItemField } from '@/lib/public/home-blocks';

export interface EditorItem { title?: string | null; subtitle?: string | null; text?: string | null; value?: string | null; label?: string | null; icon?: string | null; link?: string | null; linkLabel?: string | null }
export interface EditorBlock {
  key: string;
  heading: string;
  subheading: string;
  html: string;
  items: EditorItem[];
  imageUrl: string;
  hidden: boolean;
  customised: boolean;
  standard: { heading: string; subheading: string; html: string; items: EditorItem[] };
}

interface Draft { heading: string; subheading: string; html: string; imageUrl: string; items: EditorItem[]; hidden: boolean }

const toDraft = (block: EditorBlock): Draft => ({
  heading: block.heading,
  subheading: block.subheading,
  html: block.html,
  imageUrl: block.imageUrl,
  items: block.items.map((item) => ({ ...item })),
  hidden: block.hidden,
});

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

function csrf(): string {
  const match = document.cookie.match(/(?:^|;\s*)cos_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function HomeEditor({ initial }: { initial: EditorBlock[] }) {
  const [blocks, setBlocks] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const edited = blocks.filter((block) => block.customised).length;
  const hidden = blocks.filter((block) => block.hidden).length;

  function replace(key: string, next: EditorBlock) {
    setBlocks((current) => current.map((block) => (block.key === key ? next : block)));
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-base font-semibold text-ink">How this works</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
              <li>Below are the parts of your home page, in the order a visitor reads them.</li>
              <li>Press <strong>Edit</strong> on a part, change the words, then press <strong>Save</strong>. The website shows the change at once.</li>
              <li>Switch a part off with <strong>Show on home page</strong> if you do not want it there. Nothing is lost; you can switch it back on.</li>
              <li>Made a mess? <strong>Back to the standard text</strong> returns that part to what it said when the site was built.</li>
            </ol>
          </div>
          <div className="flex flex-col items-end gap-2">
            <LinkButton href="/" variant="outline" size="sm">Open the home page</LinkButton>
            <p className="text-xs text-ink-muted">{edited} of {blocks.length} parts edited{hidden ? ` · ${hidden} hidden` : ''}</p>
          </div>
        </div>
      </Card>

      <ol className="space-y-3">
        {HOME_BLOCKS.map((meta, index) => {
          const block = blocks.find((entry) => entry.key === meta.key);
          if (!block) return null;
          return (
            <BlockCard
              key={meta.key}
              meta={meta}
              block={block}
              position={index + 1}
              isOpen={open === meta.key}
              onToggle={() => setOpen(open === meta.key ? null : meta.key)}
              onSaved={(next) => replace(meta.key, next)}
            />
          );
        })}
      </ol>
    </div>
  );
}

function BlockCard({ meta, block, position, isOpen, onToggle, onSaved }: {
  meta: HomeBlockMeta;
  block: EditorBlock;
  position: number;
  isOpen: boolean;
  onToggle: () => void;
  onSaved: (block: EditorBlock) => void;
}) {
  const { success, error: errorToast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft(block));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const dirty = useMemo(() => !sameDraft(draft, toDraft(block)), [draft, block]);
  const panelId = `home-block-${meta.key}`;

  const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));
  const patchItem = (index: number, key: ItemField['key'], value: string) =>
    setDraft((current) => ({ ...current, items: current.items.map((item, i) => (i === index ? { ...item, [key]: value } : item)) }));
  const move = (index: number, by: -1 | 1) =>
    setDraft((current) => {
      const target = index + by;
      if (target < 0 || target >= current.items.length) return current;
      const items = [...current.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, items };
    });

  function problems(result: { message: string; errors?: unknown }) {
    const mapped: Record<string, string> = {};
    if (Array.isArray(result.errors)) for (const issue of result.errors as { field: string; message: string }[]) mapped[issue.field] = issue.message;
    setIssues(mapped);
    errorToast(result.message);
  }

  async function save() {
    setSaving(true);
    setIssues({});
    try {
      const result = await api.put(`/api/admin/cms/home/${meta.key}`, {
        heading: draft.heading,
        subheading: draft.subheading,
        html: draft.html,
        imageUrl: draft.imageUrl,
        items: draft.items,
        hidden: draft.hidden,
      });
      if (!result.ok) return problems(result);
      success(result.message);
      // What the visitor sees now = what was just saved (the server drops blank rows and trims text).
      const kept = draft.items.filter((item) => Object.entries(item).some(([k, v]) => k !== 'icon' && typeof v === 'string' && v.trim()));
      const next: EditorBlock = { ...block, heading: draft.heading.trim(), subheading: draft.subheading.trim(), html: draft.html.trim(), imageUrl: draft.imageUrl, items: kept, hidden: draft.hidden, customised: true };
      onSaved(next);
      setDraft(toDraft(next));
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!window.confirm(`Put “${meta.name}” back to the standard text? Your changes to this part will be lost.`)) return;
    setSaving(true);
    try {
      const result = await api.delete(`/api/admin/cms/home/${meta.key}`);
      if (!result.ok) return problems(result);
      success(result.message);
      const next: EditorBlock = { ...block, ...block.standard, imageUrl: '', hidden: false, customised: false, items: block.standard.items.map((item) => ({ ...item })) };
      onSaved(next);
      setDraft(toDraft(next));
      setIssues({});
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/admin/cms/home/photo', { method: 'POST', body: form, headers: { 'x-csrf-token': csrf() } });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        errorToast(payload?.message ?? `Upload failed (${response.status})`);
        return;
      }
      patch({ imageUrl: String(payload.url) });
      success(payload.message);
    } finally {
      setUploading(false);
    }
  }

  const status = block.hidden ? <Badge tone="slate">Hidden</Badge> : block.customised ? <Badge tone="success">Edited</Badge> : <Badge tone="brand">Standard text</Badge>;

  return (
    <li>
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-xs font-semibold text-ink-soft" aria-hidden="true">{position}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-ink">{meta.name}</h3>
            <p className="text-xs text-ink-muted">{meta.where}</p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <Badge tone="warning">Not saved</Badge>}
            {status}
            <Button variant={isOpen ? 'secondary' : 'outline'} size="sm" onClick={onToggle} aria-expanded={isOpen} aria-controls={panelId}>
              {isOpen ? 'Close' : 'Edit'}
            </Button>
          </div>
        </div>

        {isOpen && (
          <div id={panelId} className="space-y-5 border-t border-line px-4 py-5 sm:px-5">
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-ink-soft">{meta.help}</p>

            {!meta.alwaysVisible && (
              <Switch checked={!draft.hidden} onChange={(shown) => patch({ hidden: !shown })} label="Show on home page" />
            )}

            {meta.photo && (
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-start">
                <div className="flex aspect-[4/5] w-40 items-center justify-center overflow-hidden rounded-md border border-line bg-slate-50 text-xs text-ink-muted">
                  {draft.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.imageUrl} alt="The photo as it will appear" className="h-full w-full object-cover object-top" />
                  ) : (
                    <span className="px-2 text-center">No photo yet — a monogram is shown</span>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-ink">{meta.photo.label}</p>
                  <p className="text-xs text-ink-muted">{meta.photo.help}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={`inline-flex min-h-[36px] cursor-pointer items-center rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-500 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                      {uploading ? 'Uploading…' : draft.imageUrl ? 'Choose another photo' : 'Choose photo'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { void uploadPhoto(event.target.files?.[0]); event.target.value = ''; }} />
                    </label>
                    {draft.imageUrl && <Button variant="ghost" size="sm" onClick={() => patch({ imageUrl: '' })}>Remove photo</Button>}
                  </div>
                  {issues.imageUrl && <p className="text-xs text-red-600">{issues.imageUrl}</p>}
                  <p className="text-xs text-ink-muted">After choosing a photo, press Save below to show it on the home page.</p>
                </div>
              </div>
            )}

            {meta.headingLabel && <Input label={meta.headingLabel} value={draft.heading} maxLength={255} error={issues.heading} onChange={(event) => patch({ heading: event.target.value })} />}
            {meta.subheadingLabel && <Input label={meta.subheadingLabel} value={draft.subheading} maxLength={500} error={issues.subheading} onChange={(event) => patch({ subheading: event.target.value })} />}
            {meta.textLabel && <Textarea label={meta.textLabel} helper={meta.textHelp} rows={meta.key === 'spotlight' ? 5 : 3} maxLength={2000} value={draft.html} onChange={(event) => patch({ html: event.target.value })} />}

            {meta.itemFields && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {meta.itemName ? meta.itemName.charAt(0).toUpperCase() + meta.itemName.slice(1) : 'Row'}s ({draft.items.length})
                  </p>
                  <Button variant="outline" size="sm" disabled={draft.items.length >= (meta.maxItems ?? 20)} onClick={() => patch({ items: [...draft.items, {}] })}>
                    Add {meta.itemName ?? 'row'}
                  </Button>
                </div>
                {issues.items && <p className="text-xs text-red-600">{issues.items}</p>}

                {draft.items.length === 0 && <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-sm text-ink-muted">Nothing here yet. Press “Add {meta.itemName ?? 'row'}”.</p>}

                {draft.items.map((item, index) => (
                  <fieldset key={index} className="rounded-md border border-line p-3">
                    <legend className="px-1 text-xs font-semibold capitalize text-ink-soft">{meta.itemName ?? 'Row'} {index + 1}</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {meta.itemFields!.map((field) => {
                        const wide = field.kind === 'textarea';
                        const error = issues[`items.${index}.${field.key}`];
                        const value = String(item[field.key] ?? '');
                        return (
                          <div key={field.key} className={wide ? 'sm:col-span-2' : ''}>
                            {field.kind === 'textarea' ? (
                              <Textarea label={field.label} rows={2} maxLength={600} value={value} error={error} onChange={(event) => patchItem(index, field.key, event.target.value)} />
                            ) : field.kind === 'icon' ? (
                              <div className="w-full">
                                <label className="label" htmlFor={`${panelId}-${index}-icon`}>{field.label}</label>
                                <select id={`${panelId}-${index}-icon`} className="focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink" value={value} onChange={(event) => patchItem(index, 'icon', event.target.value)}>
                                  <option value="">None</option>
                                  {ICON_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
                                </select>
                              </div>
                            ) : (
                              <Input label={field.label} value={value} maxLength={300} placeholder={field.placeholder} helper={field.kind === 'link' ? field.help : undefined} error={error} onChange={(event) => patchItem(index, field.key, event.target.value)} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${meta.itemName ?? 'row'} ${index + 1} up`}>Move up</Button>
                      <Button variant="ghost" size="sm" disabled={index === draft.items.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${meta.itemName ?? 'row'} ${index + 1} down`}>Move down</Button>
                      <Button variant="ghost" size="sm" onClick={() => patch({ items: draft.items.filter((_, i) => i !== index) })} aria-label={`Remove ${meta.itemName ?? 'row'} ${index + 1}`}>Remove</Button>
                    </div>
                  </fieldset>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <Button variant="ghost" size="sm" onClick={reset} disabled={saving || !block.customised}>Back to the standard text</Button>
              <div className="flex items-center gap-2">
                {dirty && <Button variant="outline" onClick={() => { setDraft(toDraft(block)); setIssues({}); }} disabled={saving}>Undo my changes</Button>}
                <Button onClick={save} loading={saving} disabled={!dirty}>Save</Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}
