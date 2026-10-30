'use client';

/**
 * Audit and Assessment: the audits and assessments the firm offers. Each one is meant to open its own form; the forms are not ready,
 * so a click says "coming soon". An administrator can add, rename or remove an entry.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Card, CardBody } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';

interface AuditType { id: number; name: string; status: string }

export function AuditAssessment({ mode }: { mode: 'admin' | 'auditor' }) {
  const admin = mode === 'admin';
  const { success, error: errorToast } = useToast();
  const [types, setTypes] = useState<AuditType[] | null>(null);
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState<AuditType | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<AuditType | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<AuditType[]>('/api/compliance-register/types');
    if (result.ok && Array.isArray(result.data)) setTypes(result.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    const result = await api.post('/api/compliance-register/types', { name });
    if (!result.ok) { errorToast('Could not add it', result.message); return; }
    success('Added');
    setAdding(false); setName('');
    await load();
  }

  async function remove() {
    if (!removing) return;
    const result = await api.delete(`/api/compliance-register/types/${removing.id}`);
    setRemoving(null);
    if (!result.ok) { errorToast('Could not remove it', result.message); return; }
    success('Removed');
    await load();
  }

  const needle = search.trim().toLowerCase();
  const shown = (types ?? []).filter((type) => !needle || type.name.toLowerCase().includes(needle));

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full sm:w-96"><Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. fire, HAZOP, labour" /></div>
            {admin && <Button size="sm" onClick={() => setAdding(true)}>+ Add audit or assessment</Button>}
          </div>
        </CardBody>
      </Card>

      {types === null ? <p className="py-8 text-center text-sm text-ink-muted">Loading...</p> : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shown.map((type) => (
            <li key={type.id} className={`flex items-stretch overflow-hidden rounded-xl border border-line bg-white ${type.status === 'inactive' ? 'opacity-60' : ''}`}>
              <button type="button" onClick={() => setOpened(type)} className="flex-1 px-4 py-3.5 text-left text-sm font-medium text-ink hover:bg-surface-muted">{type.name}</button>
              {admin && <button type="button" onClick={() => setRemoving(type)} aria-label={`Remove ${type.name}`} className="px-3 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>}
            </li>
          ))}
          {shown.length === 0 && <li className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-muted md:col-span-2">Nothing matches.</li>}
        </ul>
      )}

      <Modal open={Boolean(opened)} onClose={() => setOpened(null)} title={opened?.name ?? ''} size="md" footer={<div className="flex justify-end"><Button onClick={() => setOpened(null)}>OK</Button></div>}>
        <div className="py-4 text-center">
          <p className="text-lg font-semibold text-ink">Coming soon</p>
          <p className="mt-2 text-sm text-ink-muted">The form for this audit is being prepared and will be available here soon.</p>
        </div>
      </Modal>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add an audit or assessment"
        size="md"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={add} disabled={name.trim().length < 3}>Add</Button></div>}
      >
        <Input label="Audit or assessment" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Noise and Vibration Survey" />
      </Modal>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this audit or assessment?"
        message={removing ? `"${removing.name}" is removed from the list.` : ''}
        confirmLabel="Remove"
        onConfirm={remove}
      />
    </div>
  );
}
