'use client';

/**
 * The conversation of a CAPAR report in one popup, for the employer and the auditor alike: every issue the auditor raised, a filter
 * (all, still to answer, answered, approved), and for the chosen issue its Reply thread, the employer's fix and the auditor's review.
 * The popup can be widened to the full screen.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { FindingResponse, RESPONSE_LABEL, RESPONSE_TONE } from '@/components/capar/finding-response';
import type { CaparFinding } from '@/types/capar';

type Filter = 'all' | 'todo' | 'answered' | 'approved';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All issues' },
  { key: 'todo', label: 'To answer' },
  { key: 'answered', label: 'Answered' },
  { key: 'approved', label: 'Approved' },
];

const matches = (finding: CaparFinding, filter: Filter) => {
  if (filter === 'todo') return ['Pending', 'Declined'].includes(finding.response_status);
  if (filter === 'answered') return finding.response_status === 'Employer Submitted';
  if (filter === 'approved') return finding.response_status === 'Approved';
  return true;
};

export function CaparConversation({ open, onClose, reportId, reportNumber, role, findings, can, onChanged }: {
  open: boolean;
  onClose: () => void;
  reportId: number;
  reportNumber: string;
  role: string;
  findings: CaparFinding[];
  can: { respond: boolean; review: boolean; message: boolean };
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [wide, setWide] = useState(false);

  const issues = useMemo(() => findings.filter((finding) => finding.outcome === 'Violation'), [findings]);
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return issues.filter((finding) => matches(finding, filter) && (!needle || `${finding.evidence_item_name ?? ''} ${finding.act_rule ?? ''} ${finding.finding ?? ''}`.toLowerCase().includes(needle)));
  }, [issues, filter, search]);
  const selected = shown.find((finding) => finding.id === selectedId) ?? shown[0] ?? null;

  useEffect(() => { if (open && selected && selected.id !== selectedId) setSelectedId(selected.id); }, [open, selected, selectedId]);

  const photos = selected?.files.filter((file) => file.kind === 'Photo') ?? [];

  return (
    <Modal open={open} onClose={onClose} title={`Messages and answers: ${reportNumber}`} description="Every issue in the report, with its conversation. Reply, attach images and submit the fix here." size={wide ? 'full' : 'xl'}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter the issues">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={filter === item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === item.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink-soft hover:bg-surface-muted'}`}
            >
              {item.label} · {issues.filter((finding) => matches(finding, item.key)).length}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the issues" aria-label="Search the issues" className="focus-ring h-9 w-56 rounded-lg border border-line bg-white px-3 text-sm placeholder:text-slate-400" />
          <button type="button" onClick={() => setWide((value) => !value)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-muted">{wide ? 'Make smaller' : 'Expand'}</button>
        </div>
      </div>

      {issues.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">This report has no issues to answer.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1" aria-label="Issues">
            {shown.length === 0 && <li className="rounded-lg bg-surface-muted p-3 text-sm text-ink-muted">No issue matches.</li>}
            {shown.map((finding) => (
              <li key={finding.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(finding.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${selected?.id === finding.id ? 'border-brand-600 bg-brand-50/60' : 'border-line bg-white hover:bg-surface-muted'}`}
                >
                  <span className="block text-sm font-medium text-ink">{finding.evidence_item_name ?? finding.act_rule ?? 'Issue'}</span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${RESPONSE_TONE[finding.response_status] ?? 'bg-slate-100 text-slate-600'}`}>{RESPONSE_LABEL[finding.response_status] ?? finding.response_status}</span>
                    {finding.messages.length > 0 && <span className="text-[11px] text-ink-muted">{finding.messages.length} message{finding.messages.length === 1 ? '' : 's'}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="min-w-0">
              <div className="rounded-xl border border-line p-4 text-sm">
                <p className="font-semibold text-ink">{selected.evidence_item_name ?? 'Issue'}</p>
                {selected.act_rule && <p className="mt-0.5 text-xs text-ink-muted">{selected.act_rule}</p>}
                {selected.finding && <p className="mt-3 whitespace-pre-line text-ink">{selected.finding}</p>}
                <div className="mt-3 grid grid-cols-1 gap-3 text-xs text-ink-soft sm:grid-cols-3">
                  {selected.root_cause && <p><strong className="block uppercase tracking-wide text-ink-muted">Root cause</strong>{selected.root_cause}</p>}
                  {selected.action_plan && <p><strong className="block uppercase tracking-wide text-ink-muted">Action plan</strong>{selected.action_plan}</p>}
                  {selected.timeline_date && <p><strong className="block uppercase tracking-wide text-ink-muted">Timeline</strong>{selected.timeline_date.slice(0, 10)}</p>}
                </div>
                {photos.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {photos.map((file) => (
                      <li key={file.link_id}>
                        <a href={file.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={file.url} alt={file.caption ?? file.original_name} className="h-16 w-24 rounded-lg border border-line object-cover" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <FindingResponse key={selected.id} reportId={reportId} finding={selected} role={role} can={can} onChanged={onChanged} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
