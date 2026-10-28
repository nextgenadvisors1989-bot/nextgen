'use client';

/**
 * The CAPAR body as the client's sheet lays it out: sections (Wages and Benefits, Health & Safety ...) that open and close, and under each
 * one a row per document (Leave records ...) with one plain status: Not checked, No issue, Draft or Issue found.
 * A row opens in a popup: the form for the auditor, the recorded row for everybody else.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { FindingEditor } from '@/components/capar/finding-editor';
import type { CaparCategory, CaparChecklistSection, CaparFinding } from '@/types/capar';

interface RowItem { id: number; name: string; group_name: string | null }
interface Section { id: number; name: string; items: RowItem[] }

/** The checklist the auditor may work through, plus any row already recorded against a document that is no longer offered. */
function buildSections(checklist: CaparChecklistSection[], findings: CaparFinding[]): Section[] {
  const sections: Section[] = checklist.map((section) => ({ id: section.id, name: section.name, items: [...section.items] }));
  findings.filter((finding) => finding.evidence_item_id).forEach((finding) => {
    const sectionId = Number(finding.evidence_section_id ?? 0);
    let section = sections.find((entry) => entry.id === sectionId);
    if (!section) {
      section = { id: sectionId, name: finding.evidence_section_name ?? 'Checklist', items: [] };
      sections.push(section);
    }
    if (!section.items.some((item) => item.id === finding.evidence_item_id)) {
      section.items.push({ id: Number(finding.evidence_item_id), name: finding.evidence_item_name ?? 'Checklist item', group_name: null });
    }
  });
  return sections;
}

function chipFor(finding: CaparFinding | undefined): { text: string; tone: string } {
  if (!finding) return { text: 'Not checked', tone: 'bg-slate-100 text-slate-600' };
  if (finding.item_status === 'Not findings' || finding.outcome === 'No Violation') return { text: 'No issue', tone: 'bg-emerald-50 text-emerald-700' };
  if (finding.item_status === 'Verified') return { text: 'Issue found', tone: 'bg-red-50 text-red-700' };
  return { text: 'Draft', tone: 'bg-amber-50 text-amber-700' };
}

export function CaparChecklist({ reportId, checklist, findings, categories, canEdit, onChanged, onRemove, renderRow }: {
  reportId: number;
  checklist: CaparChecklistSection[];
  findings: CaparFinding[];
  categories: CaparCategory[];
  canEdit: boolean;
  onChanged: () => void;
  onRemove: (finding: CaparFinding) => void;
  /** The recorded row, as the rest of the report shows it (with the verifier's controls). */
  renderRow: (finding: CaparFinding) => ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [openSections, setOpenSections] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<{ item: RowItem; section: Section; preview?: boolean } | null>(null);

  const sections = useMemo(() => buildSections(checklist, findings), [checklist, findings]);
  const byItem = useMemo(() => new Map(findings.filter((finding) => finding.evidence_item_id).map((finding) => [Number(finding.evidence_item_id), finding])), [findings]);
  const needle = search.trim().toLowerCase();

  if (!sections.length) return null;

  const toggleSection = (id: number) => setOpenSections((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const all = sections.flatMap((section) => section.items);
  const checked = all.filter((item) => byItem.has(item.id)).length;
  const issues = all.filter((item) => byItem.get(item.id)?.outcome === 'Violation').length;
  const activeFinding = active ? byItem.get(active.item.id) : undefined;

  return (
    <section className="space-y-3" aria-label="Checklist">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Documents to check</h2>
          <p className="text-sm text-ink-muted">
            <strong className="text-ink">{checked}</strong> of {all.length} checked
            {issues > 0 && <> · <strong className="text-red-700">{issues}</strong> with an issue</>}.
            {canEdit && ' Open a section, then click a document.'}
          </p>
        </div>
        <div className="w-full sm:w-72">
          <Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a document, e.g. leave" />
        </div>
      </div>

      {sections.map((section) => {
        const items = needle ? section.items.filter((item) => item.name.toLowerCase().includes(needle)) : section.items;
        if (needle && !items.length) return null;
        const done = section.items.filter((item) => byItem.has(item.id)).length;
        const open = needle ? true : openSections.has(section.id);
        const percent = section.items.length ? Math.round((done / section.items.length) * 100) : 0;
        return (
          <div key={section.id} className="overflow-hidden rounded-xl border border-line bg-white">
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{section.name}</span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100" aria-hidden><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} /></span>
                  <span className="text-xs text-ink-muted">{done} of {section.items.length} checked</span>
                </span>
              </span>
              <svg className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {open && (
              <ul className="divide-y divide-line border-t border-line">
                {items.map((item) => {
                  const chip = chipFor(byItem.get(item.id));
                  return (
                    <li key={item.id} className="flex items-center hover:bg-surface-muted">
                      <button
                        type="button"
                        onClick={() => setActive({ item, section })}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="min-w-0 text-sm text-ink">{item.name}</span>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip.tone}`}>{chip.text}</span>
                      </button>
                      {byItem.has(item.id) && (
                        <span className="flex shrink-0 items-center gap-3 pr-4 text-xs font-semibold">
                          <button type="button" onClick={() => setActive({ item, section, preview: true })} className="text-brand-600 hover:underline">Preview</button>
                          {canEdit && <button type="button" onClick={() => onRemove(byItem.get(item.id)!)} className="text-red-600 hover:underline">Delete</button>}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active?.item.name ?? ''}
        description={active ? `${active.section.name}${canEdit ? ': record what you checked' : ''}` : undefined}
        size="xl"
      >
        {active && (
          canEdit && !active.preview ? (
            <FindingEditor
              reportId={reportId}
              categories={categories}
              finding={activeFinding ?? null}
              item={{ id: active.item.id, name: active.item.name, sectionName: active.section.name }}
              onSaved={onChanged}
              onClose={() => setActive(null)}
              onRemove={activeFinding ? () => { const target = activeFinding; setActive(null); onRemove(target); } : undefined}
            />
          ) : activeFinding ? (
            <ul>{renderRow(activeFinding)}</ul>
          ) : (
            <p className="text-sm text-ink-muted">Nothing was recorded for this document.</p>
          )
        )}
      </Modal>
    </section>
  );
}
