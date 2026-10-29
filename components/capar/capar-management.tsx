'use client';

/**
 * CAPAR Management (administrator): which of the six common CAPAR categories each checklist document belongs to.
 * Every auditor sees the same six categories; on a report they tick the ones being audited and only those are reported.
 * Documents are added or renamed in Audit Documents; here each one is placed under a category, one by one or a whole section at once.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardBody } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';

interface Group { id: number; name: string }
interface Doc { id: number; name: string; group_id: number | null }
interface Section { id: number; name: string; items: Doc[] }
interface Data { groups: Group[]; sections: Section[] }

export function CaparManagement() {
  const { success, error: errorToast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [open, setOpen] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const result = await api.get<Data>('/api/admin/capar/management');
    if (!result.ok || !result.data) { setLoadError(result.message || 'Could not load CAPAR Management'); return; }
    setLoadError(null);
    setData(result.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const map = new Map<number, number>();
    const first = data?.groups[0]?.id;
    data?.sections.forEach((section) => section.items.forEach((doc) => {
      const id = doc.group_id ?? first;
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    }));
    return map;
  }, [data]);

  if (loadError) return <Card><CardBody><p className="py-8 text-center text-sm text-red-600">{loadError}</p></CardBody></Card>;
  if (!data) return <Card><CardBody><p className="py-8 text-center text-sm text-ink-muted">Loading...</p></CardBody></Card>;

  const options = data.groups.map((group) => ({ value: String(group.id), label: group.name }));
  const needle = search.trim().toLowerCase();
  const filterId = groupFilter ? Number(groupFilter) : null;
  const first = data.groups[0]?.id;
  const toggle = (id: number) => setOpen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function moveDoc(doc: Doc, groupId: string) {
    if (!groupId) return;
    const result = await api.put(`/api/admin/capar/management/items/${doc.id}`, { group_id: Number(groupId) });
    if (!result.ok) { errorToast('Could not save', result.message); return; }
    success('Saved');
    await load();
  }

  async function moveSection(section: Section, groupId: string) {
    if (!groupId) return;
    const result = await api.put(`/api/admin/capar/management/sections/${section.id}`, { group_id: Number(groupId) });
    if (!result.ok) { errorToast('Could not save', result.message); return; }
    success(`${section.items.length} documents moved`);
    await load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <p className="text-sm text-ink">Every CAPAR report has these six categories. Place each document under the category it belongs to.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.groups.map((group) => (
              <li key={group.id}>
                <button
                  type="button"
                  onClick={() => setGroupFilter(groupFilter === String(group.id) ? '' : String(group.id))}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${groupFilter === String(group.id) ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink-soft hover:bg-surface-muted'}`}
                >
                  {group.name} · {counts.get(group.id) ?? 0}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">To add or rename a document use <Link href="/admin/audit-documents" className="font-medium text-brand-600 hover:underline">Audit Documents</Link>. A new document starts under the first category.</p>
          <div className="mt-4 max-w-md"><Input label="Search documents" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. fire, payroll, licence" /></div>
        </CardBody>
      </Card>

      {data.sections.map((section) => {
        const rows = section.items.filter((doc) => (!needle || doc.name.toLowerCase().includes(needle)) && (!filterId || (doc.group_id ?? first) === filterId));
        if ((needle || filterId) && !rows.length) return null;
        const expanded = needle || filterId ? true : open.has(section.id);
        return (
          <div key={section.id} className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <button type="button" onClick={() => toggle(section.id)} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-semibold text-ink">{section.name}</span>
                <span className="block text-xs text-ink-muted">{section.items.length} documents</span>
              </button>
              <div className="w-64">
                <Select label="" aria-label={`Move all of ${section.name}`} options={options} value="" onChange={(value) => void moveSection(section, value)} placeholder="Move all to a category..." />
              </div>
              <button type="button" onClick={() => toggle(section.id)} aria-label={expanded ? 'Close section' : 'Open section'} className="p-1 text-ink-muted">
                <svg className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {expanded && (
              <ul className="divide-y divide-line border-t border-line">
                {rows.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 text-sm text-ink">{doc.name}</span>
                    <div className="w-64">
                      <Select label="" aria-label={`Category of ${doc.name}`} options={options} value={String(doc.group_id ?? first ?? '')} onChange={(value) => void moveDoc(doc, value)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
