'use client';

/** On an employee's page (employer's own view): lets this employee enter Data Management records (they cannot verify or delete). */
import { useState } from 'react';
import { Switch } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';

export function DataEntrySwitch({ employeeId, initial }: { employeeId: number; initial: boolean }) {
  const { success, error: errorToast } = useToast();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    setBusy(true);
    const result = await api.put(`/api/employer/employees/${employeeId}/data-entry`, { enabled: next });
    setBusy(false);
    if (!result.ok) { errorToast(result.message); return; }
    setEnabled(next);
    success(result.message);
  }
  return (
    <div className="mt-5 rounded-lg border border-line bg-surface-muted p-4">
      <Switch checked={enabled} disabled={busy} onChange={(next) => void change(next)} label="This employee may enter Data Management records" />
      <p className="mt-2 text-sm text-ink-muted">
        When it is on, “Data Management” appears in this employee&rsquo;s menu: they can enter records and correct their own until you verify them. They cannot verify, delete or see other companies&rsquo; data.
      </p>
    </div>
  );
}
