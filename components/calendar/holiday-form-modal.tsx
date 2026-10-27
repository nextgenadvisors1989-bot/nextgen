'use client';

/**
 * Declare or edit a holiday.
 *
 * A holiday is scoped either to the platform (every company) or to one company,
 * and it is either paid or not — the two facts the working-day count and the
 * payroll engine read. The year is derived from the date on the server, so the
 * two can never drift apart.
 */
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { HOLIDAY_TYPES } from '@/lib/validations/calendar.validation';
import type { CalendarOption } from '@/components/calendar/event-form-modal';

export interface HolidayFormValue {
  id?: number;
  holiday_name: string;
  holiday_date: string;
  holiday_type: string;
  is_paid: number | boolean;
  employer_id: number | null;
  description: string | null;
  year?: number;
}

export function HolidayFormModal({
  open,
  onClose,
  onSaved,
  mode,
  holiday,
  employerOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  mode: 'create' | 'edit';
  holiday?: HolidayFormValue | null;
  employerOptions: CalendarOption[];
}) {
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState({
    holiday_name: holiday?.holiday_name ?? '',
    holiday_date: holiday?.holiday_date ? String(holiday.holiday_date).slice(0, 10) : '',
    holiday_type: holiday?.holiday_type ?? 'Festival',
    is_paid: holiday ? Boolean(Number(holiday.is_paid)) : true,
    employer_id: holiday?.employer_id ? String(holiday.employer_id) : '',
    description: holiday?.description ?? '',
  });
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      holiday_name: holiday?.holiday_name ?? '',
      holiday_date: holiday?.holiday_date ? String(holiday.holiday_date).slice(0, 10) : '',
      holiday_type: holiday?.holiday_type ?? 'Festival',
      is_paid: holiday ? Boolean(Number(holiday.is_paid)) : true,
      employer_id: holiday?.employer_id ? String(holiday.employer_id) : '',
      description: holiday?.description ?? '',
    });
    setIssues({});
  }, [open, holiday]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setIssues((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setIssues({});
    try {
      const payload = {
        holiday_name: form.holiday_name,
        holiday_date: form.holiday_date,
        holiday_type: form.holiday_type,
        is_paid: form.is_paid,
        employer_id: form.employer_id ? Number(form.employer_id) : null,
        description: form.description || null,
      };
      const result = mode === 'create'
        ? await api.post('/api/admin/calendar/holidays', payload)
        : await api.put(`/api/admin/calendar/holidays/${holiday?.id}`, payload);

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
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={mode === 'create' ? 'Declare a holiday' : `Edit “${holiday?.holiday_name ?? 'holiday'}”`}
      description="The holiday master drives the working-day count, the attendance register and the payroll period."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!form.holiday_name || !form.holiday_date}>
            {mode === 'create' ? 'Declare holiday' : 'Save changes'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Holiday" required value={form.holiday_name} error={issues.holiday_name}
          placeholder="Pongal"
          onChange={(event) => set('holiday_name', event.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker
            label="Date" required value={form.holiday_date} error={issues.holiday_date}
            onChange={(value) => set('holiday_date', value)}
          />
          <Select
            label="Type" value={form.holiday_type} error={issues.holiday_type}
            onChange={(value) => set('holiday_type', value)}
            options={HOLIDAY_TYPES.map((type) => ({ value: type, label: type }))}
          />
        </div>
        <Select
          label="Applies to" value={form.employer_id} error={issues.employer_id}
          helper="A company holiday counts only for that company; leave it empty for a platform-wide holiday."
          onChange={(value) => set('employer_id', value)}
          options={[{ value: '', label: 'Every company' }, ...employerOptions]}
        />
        <Checkbox
          label="Paid holiday — the day is paid even though nobody works"
          checked={form.is_paid}
          onChange={(event) => set('is_paid', event.target.checked)}
        />
        <Textarea
          label="Note" rows={3} value={form.description}
          helper="Recorded with the holiday for anyone reading the year later."
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => set('description', event.target.value)}
        />
      </div>
    </Modal>
  );
}
