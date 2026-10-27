'use client';

/**
 * The page editor — fields, SEO, menu placement and the block builder.
 *
 * A page is edited in place: the form saves the row, the block list underneath
 * composes what the public page renders, and the publishing bar at the top runs
 * the state machine (draft → published → archived, with scheduling in between).
 * Slugs are checked live against every other page, every resource and the
 * platform's own fixed routes, so a clash is caught before the save.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { Button, LinkButton } from '@/components/ui/button';
import { Input, Textarea, Switch } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { truncate } from '@/lib/utils/formatting';
import {
  CMS_PAGE_TYPES,
  CMS_PAGE_TYPE_LABELS,
  CMS_TEMPLATES,
  CMS_SECTION_TYPE_LABELS,
  RESERVED_SLUGS,
  slugify,
} from '@/lib/validations/cms.validation';
import { SectionEditorModal, type SectionDraft } from '@/components/cms/section-editor-modal';

export interface SectionRow {
  id: number;
  section_type: string;
  section_key: string | null;
  heading: string | null;
  subheading: string | null;
  content_html: string | null;
  content_json: unknown;
  image_url: string | null;
  background_color: string | null;
  sort_order: number;
  status: string;
}

export interface PageDetail {
  page: Record<string, unknown>;
  sections: SectionRow[];
  children: { id: number; title: string; slug: string; status: string }[];
  parent: { id: number; title: string; slug: string } | null;
}

export interface SlugCatalog {
  pages: { id: number; slug: string }[];
  resources: { id: number; slug: string }[];
  reserved: string[];
}

function itemCount(contentJson: unknown): number {
  const raw = contentJson as unknown;
  if (!raw) return 0;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return 0;
    }
  }
  if (Array.isArray(parsed)) return parsed.length;
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown[] }).items)) {
    return ((parsed as { items: unknown[] }).items).length;
  }
  return 0;
}

function sectionToDraft(row: SectionRow): SectionDraft {
  const raw = row.content_json as unknown;
  let parsed: unknown = raw;
  if (typeof raw === 'string' && raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const itemsRaw = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown[] }).items)
      ? ((parsed as { items: Record<string, unknown>[] }).items)
      : [];

  return {
    id: row.id,
    section_type: row.section_type,
    section_key: row.section_key ?? '',
    heading: row.heading ?? '',
    subheading: row.subheading ?? '',
    content_html: row.content_html ?? '',
    image_url: row.image_url ?? '',
    background_color: row.background_color ?? '',
    status: row.status === 'inactive' ? 'inactive' : 'active',
    items: (itemsRaw as Record<string, unknown>[]).map((item) => ({
      title: (item.title as string) ?? undefined,
      subtitle: (item.subtitle as string) ?? undefined,
      text: (item.text as string) ?? undefined,
      value: (item.value as string) ?? undefined,
      label: (item.label as string) ?? undefined,
      icon: (item.icon as string) ?? undefined,
      image: (item.image as string) ?? undefined,
      link: (item.link as string) ?? undefined,
      linkLabel: (item.linkLabel as string) ?? undefined,
      question: (item.question as string) ?? undefined,
      answer: (item.answer as string) ?? undefined,
      price: (item.price as string) ?? undefined,
      features: Array.isArray(item.features) ? (item.features as string[]).join(', ') : undefined,
    })),
  };
}

const EMPTY_FORM = {
  title: '',
  slug: '',
  subtitle: '',
  page_type: 'page',
  template: 'default',
  meta_title: '',
  meta_description: '',
  meta_keywords: '',
  hero_image: '',
  content_html: '',
  parent_page_id: '',
  sort_order: '0',
  show_in_menu: false,
  menu_label: '',
  is_homepage: false,
  status: 'draft',
  scheduled_at: '',
};

export function PageEditor({
  mode,
  pageId,
  detail,
  catalog,
  pageOptions,
  canEdit,
  canDelete,
}: {
  mode: 'create' | 'edit';
  pageId?: number;
  detail?: PageDetail;
  catalog: SlugCatalog;
  pageOptions: { id: number; title: string; slug: string }[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();

  const page = detail?.page ?? {};
  const [form, setForm] = useState(() =>
    mode === 'edit'
      ? {
          title: String(page.title ?? ''),
          slug: String(page.slug ?? ''),
          subtitle: String(page.subtitle ?? ''),
          page_type: String(page.page_type ?? 'page'),
          template: String(page.template ?? 'default'),
          meta_title: String(page.meta_title ?? ''),
          meta_description: String(page.meta_description ?? ''),
          meta_keywords: String(page.meta_keywords ?? ''),
          hero_image: String(page.hero_image ?? ''),
          content_html: String(page.content_html ?? ''),
          parent_page_id: page.parent_page_id ? String(page.parent_page_id) : '',
          sort_order: String(page.sort_order ?? 0),
          show_in_menu: Boolean(Number(page.show_in_menu ?? 0)),
          menu_label: String(page.menu_label ?? ''),
          is_homepage: Boolean(Number(page.is_homepage ?? 0)),
          status: String(page.status ?? 'draft'),
          scheduled_at: page.scheduled_at ? String(page.scheduled_at).slice(0, 16).replace(' ', 'T') : '',
        }
      : EMPTY_FORM
  );

  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [changeNote, setChangeNote] = useState('');
  const [sections, setSections] = useState<SectionRow[]>(detail?.sections ?? []);
  const [sectionModal, setSectionModal] = useState<{ open: boolean; section: SectionDraft | null }>({ open: false, section: null });
  const [pendingSectionDelete, setPendingSectionDelete] = useState<SectionRow | null>(null);
  const [statusAction, setStatusAction] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const slugPreview = form.slug ? slugify(form.slug) : slugify(form.title);
  const takenSlugs = useMemo(() => {
    const taken = new Set<string>();
    for (const entry of catalog.pages) if (entry.id !== pageId) taken.add(entry.slug);
    for (const entry of catalog.resources) taken.add(entry.slug);
    return taken;
  }, [catalog, pageId]);

  const slugConflict = slugPreview
    ? (RESERVED_SLUGS as readonly string[]).includes(slugPreview)
      ? `“${slugPreview}” is a fixed platform route — the public site already owns it`
      : takenSlugs.has(slugPreview)
        ? `“${slugPreview}” is already used by another page or resource`
        : null
    : null;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setIssues((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function payload() {
    return {
      title: form.title,
      slug: form.slug || undefined,
      subtitle: form.subtitle || null,
      page_type: form.page_type,
      template: form.template,
      meta_title: form.meta_title || null,
      meta_description: form.meta_description || null,
      meta_keywords: form.meta_keywords || null,
      hero_image: form.hero_image || null,
      content_html: form.content_html || null,
      parent_page_id: form.parent_page_id ? Number(form.parent_page_id) : null,
      sort_order: Number(form.sort_order) || 0,
      show_in_menu: form.show_in_menu,
      menu_label: form.menu_label || null,
      is_homepage: form.is_homepage,
      status: form.status === 'scheduled' ? 'draft' : form.status,
      change_note: changeNote || undefined,
    };
  }

  async function save() {
    setSaving(true);
    setIssues({});
    try {
      const result =
        mode === 'create'
          ? await api.post<{ id: number; slug: string; status: string }>('/api/admin/cms/pages', payload())
          : await api.put(`/api/admin/cms/pages/${pageId}`, payload());

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
      setChangeNote('');
      if (mode === 'create') {
        const created = result.data as { id: number } | undefined;
        router.push(`/admin/cms/pages/${created?.id ?? ''}`);
        router.refresh();
      } else {
        router.refresh();
        window.location.reload();
      }
    } finally {
      setSaving(false);
    }
  }

  async function runStatus(action: string, scheduledAt?: string) {
    if (mode === 'create') {
      errorToast('Save the page before publishing it');
      return;
    }
    setBusy(true);
    try {
      const result = await api.post(`/api/admin/cms/pages/${pageId}/status`, {
        action,
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      });
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setStatusAction(null);
      setScheduleFor(null);
      router.refresh();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function deleteSection() {
    if (!pendingSectionDelete) return;
    setBusy(true);
    try {
      const result = await api.delete(`/api/admin/cms/pages/${pageId}/sections/${pendingSectionDelete.id}`);
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setSections((current) => current.filter((row) => row.id !== pendingSectionDelete.id));
      setPendingSectionDelete(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function moveSection(index: number, direction: -1 | 1) {
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
    const result = await api.post(`/api/admin/cms/pages/${pageId}/sections/reorder`, { order: next.map((row) => row.id) });
    if (!result.ok) {
      errorToast(result.message);
      setSections(sections);
      return;
    }
    success('Block order saved');
    router.refresh();
  }

  async function toggleSectionStatus(row: SectionRow) {
    const draft = sectionToDraft(row);
    draft.status = row.status === 'active' ? 'inactive' : 'active';
    const result = await api.put(`/api/admin/cms/pages/${pageId}/sections/${row.id}`, {
      section_type: draft.section_type,
      section_key: draft.section_key || null,
      heading: draft.heading || null,
      subheading: draft.subheading || null,
      content_html: draft.content_html || null,
      image_url: draft.image_url || null,
      background_color: draft.background_color || null,
      status: draft.status,
      items: draft.items,
    });
    if (!result.ok) {
      errorToast(result.message);
      return;
    }
    success(draft.status === 'active' ? 'Block is visible again' : 'Block hidden from the page');
    setSections((current) =>
      current.map((entry) => (entry.id === row.id ? { ...entry, status: draft.status } : entry))
    );
    router.refresh();
  }

  const status = mode === 'edit' ? String(page.status ?? 'draft') : 'unsaved';

  return (
    <div className="space-y-5">
      {/* publishing bar */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status === 'published' ? 'success' : status === 'scheduled' ? 'warning' : status === 'archived' ? 'danger' : 'slate'} dot>
                {status}
              </Badge>
              {form.show_in_menu && <Badge tone="brand">In the menu</Badge>}
              {form.is_homepage && <Badge tone="violet">Homepage</Badge>}
              {slugConflict && <Badge tone="danger">{slugConflict}</Badge>}
            </div>
            <p className="mt-2 text-[12px] text-ink-muted">
              {mode === 'edit' ? (
                <>
                  {page.published_at ? `Published ${formatDateTime(String(page.published_at))}` : 'Never published'}
                  {page.scheduled_at ? ` · scheduled for ${formatDateTime(String(page.scheduled_at))}` : ''}
                  {Number(page.view_count ?? 0) > 0 ? ` · ${Number(page.view_count)} view(s)` : ''}
                </>
              ) : (
                'Save the page to start composing its blocks.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mode === 'edit' && (
              <>
                <LinkButton href={`/admin/cms/pages/${pageId}/preview`} variant="outline" size="sm">Preview</LinkButton>
                {status === 'published' && (
                  <LinkButton href={`/${String(page.slug)}`} variant="outline" size="sm">Open live page</LinkButton>
                )}
              </>
            )}
            {canEdit && mode === 'edit' && status !== 'published' && (
              <Button size="sm" onClick={() => setStatusAction('publish')} disabled={!sections.length && !form.content_html}>
                Publish
              </Button>
            )}
            {canEdit && mode === 'edit' && status === 'published' && (
              <Button size="sm" variant="outline" onClick={() => setStatusAction('unpublish')}>Unpublish</Button>
            )}
            {canEdit && mode === 'edit' && (
              <Button size="sm" variant="outline" onClick={() => setScheduleFor(new Date(Date.now() + 3600_000).toISOString().slice(0, 16))}>
                Schedule
              </Button>
            )}
            {canEdit && mode === 'edit' && status !== 'archived' && (
              <Button size="sm" variant="outline" onClick={() => setStatusAction('archive')}>Archive</Button>
            )}
            {canEdit && mode === 'edit' && status === 'archived' && (
              <Button size="sm" onClick={() => setStatusAction('restore')}>Restore</Button>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardBody className="space-y-5">
              <h2 className="section-title">Content</h2>
              <Input
                label="Title" required value={form.title} error={issues.title}
                onChange={(event) => set('title', event.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Slug" value={form.slug} error={issues.slug ?? slugConflict ?? undefined}
                  placeholder={slugify(form.title) || 'about-our-services'}
                  helper={`Public address: /${slugPreview || '…'}`}
                  onChange={(event) => set('slug', event.target.value)}
                />
                <Select
                  label="Parent page"
                  value={form.parent_page_id}
                  error={issues.parent_page_id}
                  helper="Nesting groups related pages; the menu can show the tree."
                  options={[
                    { value: '', label: 'Top level' },
                    ...pageOptions.map((option) => ({ value: String(option.id), label: `${option.title} (/${option.slug})` })),
                  ]}
                  onChange={(value) => set('parent_page_id', value)}
                />
              </div>
              <Input
                label="Subtitle" value={form.subtitle}
                onChange={(event) => set('subtitle', event.target.value)}
              />
              <Textarea
                label="Page body" rows={8} value={form.content_html}
                helper="The page's main prose. Blocks below are appended underneath it, in order."
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => set('content_html', event.target.value)}
              />
            </CardBody>
          </Card>

          <Card padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Blocks ({sections.length})</h2>
                <p className="mt-1 text-[13px] text-ink-muted">
                  Heroes, feature grids, statistics, accordions, galleries, pricing, FAQs — each block renders in order.
                </p>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => setSectionModal({ open: true, section: null })}
                  disabled={mode === 'create'}
                >
                  Add block
                </Button>
              )}
            </div>

            <div className="divide-y divide-line">
              {sections.map((row, index) => (
                <div key={row.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                        {index + 1}
                      </span>
                      <p className="text-sm font-medium text-ink">{row.heading ?? CMS_SECTION_TYPE_LABELS[row.section_type] ?? row.section_type}</p>
                      <Badge tone="slate">{CMS_SECTION_TYPE_LABELS[row.section_type] ?? row.section_type}</Badge>
                      {row.status === 'inactive' && <Badge tone="warning">Hidden</Badge>}
                    </div>
                    <p className="mt-1 text-[12px] text-ink-muted">
                      {row.section_key ? <span className="font-mono">{row.section_key} · </span> : null}
                      {itemCount(row.content_json)} item(s)
                      {row.subheading ? ` · ${truncate(row.subheading, 70)}` : ''}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" className="btn-icon" title="Move up" disabled={index === 0} onClick={() => moveSection(index, -1)}>↑</button>
                      <button type="button" className="btn-icon" title="Move down" disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)}>↓</button>
                      <Button size="sm" variant="outline" onClick={() => setSectionModal({ open: true, section: sectionToDraft(row) })}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleSectionStatus(row)}>
                        {row.status === 'active' ? 'Hide' : 'Show'}
                      </Button>
                      <button
                        type="button"
                        className="btn-icon btn-icon-danger"
                        title="Remove block"
                        onClick={() => setPendingSectionDelete(row)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {!sections.length && (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">
                  {mode === 'create'
                    ? 'Save the page first, then compose its blocks.'
                    : 'No blocks yet. The page body above is all that shows until you add one.'}
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardBody className="space-y-5">
              <h2 className="section-title">Placement</h2>
              <Select
                label="Page type" value={form.page_type} error={issues.page_type}
                onChange={(value) => set('page_type', value)}
                options={CMS_PAGE_TYPES.map((type) => ({ value: type, label: CMS_PAGE_TYPE_LABELS[type] ?? type }))}
              />
              <Select
                label="Template" value={form.template}
                onChange={(value) => set('template', value)}
                options={CMS_TEMPLATES.map((template) => ({ value: template, label: template }))}
              />
              <Input
                label="Sort order" type="number" value={form.sort_order} min={0}
                helper="Where it sits in the menu when several pages share a level."
                onChange={(event) => set('sort_order', event.target.value)}
              />
              <Switch
                checked={form.show_in_menu} label="Show in the public menu"
                onChange={(checked) => set('show_in_menu', checked)}
              />
              <Input
                label="Menu label" value={form.menu_label} placeholder="Defaults to the title"
                onChange={(event) => set('menu_label', event.target.value)}
              />
              <Switch
                checked={form.is_homepage} label="Use as the homepage"
                onChange={(checked) => set('is_homepage', checked)}
              />
              <p className="text-[12px] text-ink-muted">
                Exactly one page can be the homepage: choosing this one releases whichever page held it.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-5">
              <div>
                <h2 className="section-title">Search &amp; social</h2>
                <p className="mt-1 text-[12px] text-ink-muted">
                  What search engines and link previews show. Leave blank to fall back to the title and subtitle.
                </p>
              </div>
              <Input
                label="Meta title" value={form.meta_title} maxLength={255}
                helper={`${form.meta_title.length}/60 is the comfortable length`}
                onChange={(event) => set('meta_title', event.target.value)}
              />
              <Textarea
                label="Meta description" rows={3} value={form.meta_description} maxLength={500}
                helper={`${form.meta_description.length}/160 is the comfortable length`}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => set('meta_description', event.target.value)}
              />
              <Input
                label="Meta keywords" value={form.meta_keywords}
                placeholder="compliance, audit, tamil nadu"
                onChange={(event) => set('meta_keywords', event.target.value)}
              />
              <Input
                label="Hero image URL" value={form.hero_image}
                placeholder="/api/files/12/download or https://…"
                onChange={(event) => set('hero_image', event.target.value)}
              />
            </CardBody>
          </Card>

          {mode === 'edit' && (
            <Card>
              <CardBody className="space-y-3">
                <h2 className="section-title">Relationships</h2>
                {detail?.parent ? (
                  <p className="text-[13px] text-ink-soft">
                    Parent: <Link href={`/admin/cms/pages/${detail.parent.id}`} className="text-brand-600 hover:underline">{detail.parent.title}</Link>
                  </p>
                ) : (
                  <p className="text-[13px] text-ink-muted">Top-level page.</p>
                )}
                {detail?.children.length ? (
                  <div>
                    <p className="text-[13px] text-ink-soft">Child pages ({detail.children.length})</p>
                    <ul className="mt-1 space-y-1">
                      {detail.children.map((child) => (
                        <li key={child.id} className="text-[13px]">
                          <Link href={`/admin/cms/pages/${child.id}`} className="text-brand-600 hover:underline">{child.title}</Link>
                          <span className="ml-2 text-[11px] text-ink-muted">{child.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[13px] text-ink-muted">No child pages.</p>
                )}
              </CardBody>
            </Card>
          )}

          {canEdit && (
            <Card>
              <CardBody className="space-y-4">
                <Input
                  label="Change note (optional)" value={changeNote} maxLength={300}
                  placeholder="Why this is being changed — recorded in the activity log"
                  onChange={(event) => setChangeNote(event.target.value)}
                />
                <Button onClick={save} loading={saving} fullWidth disabled={Boolean(slugConflict)}>
                  {mode === 'create' ? 'Create page' : 'Save page'}
                </Button>
                {mode === 'edit' && canDelete && status !== 'archived' && (
                  <Button variant="outline" fullWidth onClick={() => setStatusAction('archive')}>
                    Archive this page
                  </Button>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {mode === 'edit' && pageId && (
        <SectionEditorModal
          open={sectionModal.open}
          onClose={() => setSectionModal({ open: false, section: null })}
          pageId={pageId}
          section={sectionModal.section}
          onSaved={() => {
            setSectionModal({ open: false, section: null });
            router.refresh();
            window.location.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingSectionDelete)}
        onClose={() => setPendingSectionDelete(null)}
        onConfirm={deleteSection}
        loading={busy}
        title="Remove this block?"
        message={`“${pendingSectionDelete?.heading ?? CMS_SECTION_TYPE_LABELS[pendingSectionDelete?.section_type ?? ''] ?? 'Block'}” will disappear from the page immediately.`}
        confirmLabel="Remove block"
      />

      <ConfirmDialog
        open={Boolean(statusAction)}
        onClose={() => setStatusAction(null)}
        onConfirm={async () => {
          if (statusAction) await runStatus(statusAction);
        }}
        loading={busy}
        variant={statusAction === 'archive' ? 'danger' : 'primary'}
        title={`${statusAction ? statusAction.charAt(0).toUpperCase() + statusAction.slice(1) : ''} this page?`}
        message={
          statusAction === 'publish'
            ? 'The page goes live on the public site at its slug address, exactly as it looks in the preview.'
            : statusAction === 'unpublish'
              ? 'The page returns to draft and disappears from the public site. Its content and blocks are untouched.'
              : statusAction === 'archive'
                ? 'The page leaves the public site. Everything is kept, so restoring it later brings it back as a draft.'
                : 'The page comes back as a draft so you can review it before publishing again.'
        }
        confirmLabel="Confirm"
      />

      <Modal
        open={Boolean(scheduleFor)}
        onClose={() => setScheduleFor(null)}
        title="Schedule this page"
        description="The page publishes itself at the moment you choose — no one has to be at a keyboard."
        footer={
          <>
            <Button variant="outline" onClick={() => setScheduleFor(null)}>Cancel</Button>
            <Button onClick={() => scheduleFor && runStatus('schedule', scheduleFor)} loading={busy}>Schedule</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Publish at"
            type="datetime-local"
            value={scheduleFor ?? ''}
            onChange={(event) => setScheduleFor(event.target.value)}
          />
          <p className="text-[12px] text-ink-muted">
            The scheduled-publishing job promotes the page on its own five-minute tick, and the public read path also
            promotes anything overdue — so the moment holds even on a deployment whose cron has not run yet.
          </p>
        </div>
      </Modal>
    </div>
  );
}
