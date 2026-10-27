'use client';

/**
 * The designation field of the employee form: a searchable list of the Designation Master (grouped by industry), with "Add new" for a designation that is
 * missing and "Manage" to open the full register. Choosing one tells the form so it can fill the department, nature of work, skill grade and wage lines.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/utils/api-client';
import { DesignationFormModal, type DesignationLookups } from '@/components/designation/designation-form-modal';

export interface DesignationOption {
  id: number;
  employer_id: number | null;
  industry_code: string | null;
  industry_name: string | null;
  group_name: string | null;
  name: string;
  department: string | null;
  level: string | null;
  nature: string | null;
  basic: number | null;
  da: number | null;
}

export function DesignationPicker({ options: initial, employerId, panel, valueId, valueText, error, onPick }: {
  options: DesignationOption[];
  /** The company the employee belongs to ("" until an administrator has chosen one). */
  employerId: string;
  panel: 'admin' | 'employer';
  valueId: string;
  valueText: string;
  error?: string;
  onPick: (option: DesignationOption | null) => void;
}) {
  const [options, setOptions] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [lookups, setLookups] = useState<DesignationLookups | null>(null);

  useEffect(() => { setOptions(initial); }, [initial]);

  // the shared master plus the chosen company's own additions
  const visible = useMemo(() => options.filter((o) => o.employer_id === null || String(o.employer_id) === employerId || panel === 'employer'), [options, employerId, panel]);
  const selectOptions = useMemo(() => visible.map((o) => ({
    value: String(o.id), label: `${o.name}${o.level ? ` - ${o.level}` : ''}`,
    group: o.employer_id !== null ? 'Your company\'s designations' : o.industry_code ? `${o.industry_code}. ${o.industry_name}` : 'Other',
  })), [visible]);

  const reload = useCallback(async (selectId?: number) => {
    const response = await api.get<DesignationOption[]>(`/api/${panel}/designations/picker`);
    if (!response.ok || !Array.isArray(response.data)) return;
    setOptions(response.data);
    if (selectId) onPick(response.data.find((o) => o.id === selectId) ?? null);
  }, [panel, onPick]);

  async function openAdd() {
    if (!lookups) {
      const response = await api.get<DesignationLookups>(`/api/${panel}/designations/lookups`);
      if (response.ok && response.data) setLookups(response.data);
    }
    setAdding(true);
  }

  return (
    <div className="space-y-1.5">
      <Select label="Designation" value={valueId} onChange={(v) => onPick(visible.find((o) => String(o.id) === v) ?? null)} searchable clearable
        placeholder={valueText && !valueId ? valueText : 'Search the designation master'} options={selectOptions} error={error} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button type="button" onClick={openAdd} className="link font-medium">+ Add a designation</button>
        <Link href={panel === 'admin' ? '/admin/designations' : '/employer/designations'} target="_blank" className="link">Manage designations</Link>
        {valueText && !valueId && <span className="text-ink-muted">Typed earlier: &quot;{valueText}&quot;. Pick from the list to link it.</span>}
      </div>
      <DesignationFormModal open={adding} onClose={() => setAdding(false)} panel={panel} row={null} lookups={lookups}
        employerId={panel === 'admin' && employerId ? Number(employerId) : null} onSaved={(id) => { void reload(id); }} />
    </div>
  );
}
