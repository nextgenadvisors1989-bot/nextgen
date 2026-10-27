'use client';

/**
 * The block editor.
 *
 * A section is one block of a page. The form adapts to the block type: prose
 * blocks take rich text, list blocks (features, stats, FAQ, pricing, gallery,
 * team, testimonials, table, tabs) take repeatable items with the fields that
 * type actually renders. Whatever is entered here is what the public page shows —
 * the renderer and this editor read the same catalogue.
 */
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Switch } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import {
  CMS_SECTION_TYPES,
  CMS_SECTION_TYPE_LABELS,
  LIST_SECTION_TYPES,
} from '@/lib/validations/cms.validation';

export interface SectionItemDraft {
  title?: string;
  subtitle?: string;
  text?: string;
  value?: string;
  label?: string;
  icon?: string;
  image?: string;
  link?: string;
  linkLabel?: string;
  question?: string;
  answer?: string;
  price?: string;
  features?: string;
}

export interface SectionDraft {
  id?: number;
  section_type: string;
  section_key: string;
  heading: string;
  subheading: string;
  content_html: string;
  image_url: string;
  background_color: string;
  status: 'active' | 'inactive';
  items: SectionItemDraft[];
}

const EMPTY_SECTION: SectionDraft = {
  section_type: 'text',
  section_key: '',
  heading: '',
  subheading: '',
  content_html: '',
  image_url: '',
  background_color: '',
  status: 'active',
  items: [],
};

/** Which item fields each block type actually renders. */
const ITEM_FIELDS: Record<string, (keyof SectionItemDraft)[]> = {
  features: ['title', 'text', 'icon', 'link', 'linkLabel'],
  services: ['title', 'text', 'icon', 'link', 'linkLabel'],
  stats: ['value', 'label'],
  faq: ['question', 'answer'],
  accordion: ['question', 'answer'],
  tabs: ['title', 'text'],
  gallery: ['image', 'title'],
  team: ['title', 'subtitle', 'image', 'text'],
  testimonials: ['title', 'subtitle', 'text'],
  pricing: ['title', 'price', 'features', 'link', 'linkLabel'],
  table: ['title', 'features'],
};

const ITEM_LABELS: Record<string, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  text: 'Body',
  value: 'Value',
  label: 'Label',
  icon: 'Icon (SVG path or image URL)',
  image: 'Image URL',
  link: 'Link',
  linkLabel: 'Link label',
  question: 'Question',
  answer: 'Answer',
  price: 'Price',
  features: 'Comma-separated entries',
};

export function SectionEditorModal({
  open,
  onClose,
  pageId,
  section,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  pageId: number;
  section: SectionDraft | null;
  onSaved: (message: string) => void;
}) {
  const { success, error: errorToast } = useToast();
  const [draft, setDraft] = useState<SectionDraft>(section ?? EMPTY_SECTION);
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDraft(section ?? EMPTY_SECTION);
      setIssues({});
    }
  }, [open, section]);

  const isList = LIST_SECTION_TYPES.includes(draft.section_type);
  const itemFields = ITEM_FIELDS[draft.section_type] ?? ['title', 'text'];
  const needsItems = isList;

  function setItem(index: number, key: keyof SectionItemDraft, value: string) {
    setDraft((current) => {
      const items = [...current.items];
      items[index] = { ...items[index], [key]: value };
      return { ...current, items };
    });
  }

  async function save() {
    setSaving(true);
    setIssues({});
    try {
      const payload: Record<string, unknown> = {
        section_type: draft.section_type,
        section_key: draft.section_key || null,
        heading: draft.heading || null,
        subheading: draft.subheading || null,
        content_html: draft.content_html || null,
        image_url: draft.image_url || null,
        background_color: draft.background_color || null,
        status: draft.status,
      };

      if (isList) {
        payload.items = draft.items
          .map((item) => ({
            ...item,
            features: item.features
              ? item.features.split(',').map((entry) => entry.trim()).filter(Boolean)
              : undefined,
          }))
          .filter((item) =>
            Object.entries(item).some(([key, value]) =>
              key === 'features' ? Array.isArray(value) && value.length > 0 : Boolean(value)
            )
          );
      }

      const result = draft.id
        ? await api.put(`/api/admin/cms/pages/${pageId}/sections/${draft.id}`, payload)
        : await api.post(`/api/admin/cms/pages/${pageId}/sections`, payload);

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
      onSaved(result.message);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={draft.id ? `Edit block — ${CMS_SECTION_TYPE_LABELS[draft.section_type] ?? draft.section_type}` : 'Add a block'}
      description="Blocks render in order, top to bottom, on the public page."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>{draft.id ? 'Save block' : 'Add block'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Block type"
            value={draft.section_type}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                section_type: value,
                items: current.items.length && LIST_SECTION_TYPES.includes(value) ? current.items : [],
              }))
            }
            options={CMS_SECTION_TYPES.map((type) => ({ value: type, label: CMS_SECTION_TYPE_LABELS[type] ?? type }))}
            helper={isList ? 'This block renders a list of items.' : 'This block renders prose.'}
          />
          <Input
            label="Key (optional)"
            value={draft.section_key}
            placeholder="pricing-heading"
            helper="A stable name for the block, useful when two blocks are similar."
            onChange={(event) => setDraft((current) => ({ ...current, section_key: event.target.value }))}
          />
        </div>

        <Input
          label="Heading"
          value={draft.heading}
          error={issues.heading}
          onChange={(event) => setDraft((current) => ({ ...current, heading: event.target.value }))}
        />
        <Input
          label="Subheading"
          value={draft.subheading}
          onChange={(event) => setDraft((current) => ({ ...current, subheading: event.target.value }))}
        />

        <Textarea
          label="Body"
          rows={5}
          value={draft.content_html}
          helper="Plain text or simple HTML — paragraphs, lists, links and emphasis all render."
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            setDraft((current) => ({ ...current, content_html: event.target.value }))
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Image or video still URL"
            value={draft.image_url}
            placeholder="/api/files/12/download or https://…"
            onChange={(event) => setDraft((current) => ({ ...current, image_url: event.target.value }))}
          />
          <Input
            label="Background colour"
            value={draft.background_color}
            placeholder="#1e293b"
            error={issues.background_color}
            onChange={(event) => setDraft((current) => ({ ...current, background_color: event.target.value }))}
          />
        </div>

        {needsItems && (
          <div className="space-y-4 rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink">Items ({draft.items.length})</p>
                <p className="text-[12px] text-ink-muted">
                  {draft.section_type === 'table'
                    ? 'The first item is the header row: its title is the first column and its entries are the column headings.'
                    : 'Each item becomes one card, statistic, question or plan on the page.'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDraft((current) => ({ ...current, items: [...current.items, {}] }))}
              >
                Add item
              </Button>
            </div>

            {draft.items.map((item, index) => (
              <div key={index} className="rounded-lg border border-line bg-surface-muted p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-ink-soft">
                    {draft.section_type === 'table' && index === 0 ? 'Header row' : `Item ${index + 1}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-icon"
                      title="Move up"
                      disabled={index === 0}
                      onClick={() =>
                        setDraft((current) => {
                          const items = [...current.items];
                          [items[index - 1], items[index]] = [items[index], items[index - 1]];
                          return { ...current, items };
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      title="Move down"
                      disabled={index === draft.items.length - 1}
                      onClick={() =>
                        setDraft((current) => {
                          const items = [...current.items];
                          [items[index + 1], items[index]] = [items[index], items[index + 1]];
                          return { ...current, items };
                        })
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-icon btn-icon-danger"
                      title="Remove item"
                      onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {itemFields.map((field) => (
                    <Input
                      key={String(field)}
                      label={ITEM_LABELS[String(field)] ?? String(field)}
                      value={(item[field] as string | undefined) ?? ''}
                      placeholder={field === 'features' ? 'First, Second, Third' : undefined}
                      onChange={(event) => setItem(index, field, event.target.value)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {!draft.items.length && (
              <p className="text-[12px] text-ink-muted">
                No items yet — a list block with no items renders nothing on the page.
              </p>
            )}
          </div>
        )}

        <Switch
          checked={draft.status === 'active'}
          label="Visible on the page"
          onChange={(checked) => setDraft((current) => ({ ...current, status: checked ? 'active' : 'inactive' }))}
        />
      </div>
    </Modal>
  );
}
