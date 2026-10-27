'use client';

/** The employer's queue of short-permission requests: pending first, approve or reject with an optional note. */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/loader';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';

interface Row { id: number; permission_date: string; from_time: string; to_time: string; minutes: number; reason: string; status: string; decision_note: string | null; employee_name: string; employee_number: string }
const FILTERS = ['Pending', 'Approved', 'Rejected', 'All'];

export function PermissionRequests() {
  const toast = useToast();
  const [filter, setFilter] = useState('Pending');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const response = await api.get<Row[]>(`/api/employer/permissions${filter === 'All' ? '' : `?status=${filter}`}`);
    if (response.ok) setRows(Array.isArray(response.data) ? response.data : []);
    else { toast.error(response.message); setRows([]); }
  }, [filter, toast]);
  useEffect(() => { void load(); }, [load]);

  async function decide(id: number, decision: 'Approved' | 'Rejected') {
    setBusy(id);
    const response = await api.put(`/api/employer/permissions/${id}`, { decision });
    setBusy(null);
    if (response.ok) { toast.success(response.message); await load(); } else toast.error(response.message);
  }

  return (
    <Card padded={false}>
      <CardHeader title="Permission requests" description="Short permissions your employees asked for (up to 4 hours)."
        action={<div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {FILTERS.map((name) => <Button key={name} size="sm" variant={filter === name ? 'primary' : 'outline'} onClick={() => setFilter(name)}>{name}</Button>)}
        </div>} />
      {rows === null ? <div className="flex justify-center py-10"><Spinner /></div> : rows.length === 0 ? (
        <EmptyState title="No requests" subtitle={filter === 'Pending' ? 'Nothing is waiting for a decision.' : 'Nothing matches this filter.'} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-ink">{row.employee_name} <span className="font-normal text-ink-muted">({row.employee_number})</span></p>
                <p className="text-ink-soft">{formatDate(row.permission_date)}, {String(row.from_time).slice(0, 5)} - {String(row.to_time).slice(0, 5)} ({row.minutes} min)</p>
                <p className="text-xs text-ink-muted">{row.reason}{row.decision_note ? ` - ${row.decision_note}` : ''}</p>
              </div>
              {row.status === 'Pending' ? (
                <div className="flex gap-2">
                  <Button size="sm" loading={busy === row.id} onClick={() => decide(row.id, 'Approved')}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => decide(row.id, 'Rejected')}>Reject</Button>
                </div>
              ) : <Badge tone={row.status === 'Approved' ? 'success' : row.status === 'Rejected' ? 'danger' : 'slate'}>{row.status}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
