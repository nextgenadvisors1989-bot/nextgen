'use client';

/** The auditor's list of companies with the state of each pack: submitted or not, and whether this auditor has downloaded the latest. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';

interface Row {
  id: number; company_name: string; employer_code: string | null; city: string | null; downloaded_at: string | null;
  latest: { id: number; submitted_at: string; provided_items: number; total_items: number } | null;
}

export function AuditorPacks({ basePath }: { basePath: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [sections, setSections] = useState<number | null>(null);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await api.get<{ employers: Row[]; sections_granted: number | null }>('/api/evidence/auditor/employers');
    if (response.ok && response.data) { setRows(response.data.employers); setSections(response.data.sections_granted); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = rows.filter((row) => !term.trim() || `${row.company_name} ${row.employer_code ?? ''} ${row.city ?? ''}`.toLowerCase().includes(term.toLowerCase()));

  return (
    <Card padded={false}>
      <CardHeader title="Employer document packs" description={sections === 0
        ? 'The administrator has not given you any document sections yet, so there is nothing to download.'
        : 'Download the pack an employer submitted before you start its audit. A CAPAR cannot be started until you have.'} />
      <div className="px-5 pb-3"><Input label="Search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Company, code or city" /></div>
      {loading ? <p className="px-5 pb-5 text-sm text-ink-muted">Loading...</p> : shown.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-muted">No companies match.</p> : (
        <ul className="divide-y divide-line border-t border-line">
          {shown.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{row.company_name}</p>
                <p className="text-xs text-ink-muted">{[row.employer_code, row.city].filter(Boolean).join(' · ')}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {row.latest ? `Submitted ${formatDateTime(row.latest.submitted_at)} · ${row.latest.provided_items} of ${row.latest.total_items} provided` : 'Not submitted yet'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!row.latest ? <Badge tone="warning">Waiting for the employer</Badge>
                  : row.downloaded_at ? <Badge tone="success">Downloaded {formatDateTime(row.downloaded_at)}</Badge>
                  : sections === 0 ? <Badge tone="slate">No sections for you</Badge> : <Badge tone="warning">Not downloaded</Badge>}
                {row.latest && sections !== 0 && (
                  <a href={`/api/pdf/evidence-pack/${row.latest.id}`} target="_blank" rel="noreferrer" onClick={() => setTimeout(load, 2500)}><Button size="sm">Download pack (PDF)</Button></a>
                )}
                <Link href={`${basePath}/${row.id}`}><Button size="sm" variant="outline">View</Button></Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
