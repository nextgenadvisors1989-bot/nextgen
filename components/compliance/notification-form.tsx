'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardFooter } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { useComplianceLookups } from '@/components/compliance/shared';
import { INSTRUMENT_STATUSES } from '@/lib/validations/compliance.validation';

export interface NotificationFormValues {
  id?: number;
  notification_number: string;
  title: string;
  notification_date: string;
  issuing_authority: string;
  act_id: string;
  gazette_reference: string;
  subject: string;
  body: string;
  effective_date: string;
  applicability: string;
  action_required: string;
  status: string;
}

export const EMPTY_NOTIFICATION: NotificationFormValues = {
  notification_number: '', title: '', notification_date: '', issuing_authority: '', act_id: '',
  gazette_reference: '', subject: '', body: '', effective_date: '', applicability: '',
  action_required: '', status: 'active',
};

/** Create/edit form for a gazette notification, the register employers are measured against. */
export function NotificationForm({ initial, mode }: { initial?: NotificationFormValues; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [values, setValues] = useState<NotificationFormValues>(initial ?? EMPTY_NOTIFICATION);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { lookups } = useComplianceLookups(null);

  const set = (key: keyof NotificationFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = {
      notification_number: values.notification_number.trim(),
      title: values.title.trim(),
      notification_date: values.notification_date || null,
      issuing_authority: values.issuing_authority.trim() || null,
      act_id: values.act_id ? Number(values.act_id) : null,
      gazette_reference: values.gazette_reference.trim() || null,
      subject: values.subject.trim() || null,
      body: values.body.trim() || null,
      effective_date: values.effective_date || null,
      applicability: values.applicability.trim() || null,
      action_required: values.action_required.trim() || null,
      status: values.status,
    };

    const result = mode === 'create'
      ? await api.post<{ notificationId: number }>('/api/admin/compliance/notifications', payload)
      : await api.put<{ notificationId: number }>(`/api/admin/compliance/notifications/${initial?.id}`, payload);

    setSaving(false);
    if (result.ok) {
      success(mode === 'create' ? 'Notification registered' : 'Notification updated', `${payload.notification_number} saved.`);
      const id = (result.data as { notificationId?: number } | undefined)?.notificationId ?? initial?.id;
      router.push(`/admin/compliance/notifications/${id}`);
      router.refresh();
      return;
    }
    const mapped = fieldErrors(result);
    setErrors(Object.keys(mapped).length ? mapped : { notification_number: result.message });
    errorToast(mode === 'create' ? 'Could not register the notification' : 'Could not update the notification', result.message);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Card>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Notification number" required value={values.notification_number} error={errors.notification_number}
            placeholder="e.g. G.S.R. 1211(E)" onChange={(event) => set('notification_number', event.target.value)} />
          <DatePicker label="Notification date" value={values.notification_date} error={errors.notification_date}
            onChange={(value) => set('notification_date', value)} />
          <div className="sm:col-span-2">
            <Input label="Title" required value={values.title} error={errors.title}
              placeholder="e.g. ESI wage ceiling for coverage raised to ₹21,000 per month"
              onChange={(event) => set('title', event.target.value)} />
          </div>
          <Input label="Issuing authority" value={values.issuing_authority} error={errors.issuing_authority}
            placeholder="e.g. Ministry of Labour and Employment"
            onChange={(event) => set('issuing_authority', event.target.value)} />
          <Select
            label="Act it amends or relates to" searchable clearable value={values.act_id} error={errors.act_id}
            placeholder="Optionally link an act"
            options={(lookups?.actOptions ?? []).map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => set('act_id', value)}
          />
          <Input label="Gazette reference" value={values.gazette_reference} error={errors.gazette_reference}
            placeholder="e.g. The Gazette of India, Extraordinary, Part II, Section 3(i)"
            onChange={(event) => set('gazette_reference', event.target.value)} />
          <DatePicker label="Effective from" value={values.effective_date} error={errors.effective_date}
            onChange={(value) => set('effective_date', value)} />
          <div className="sm:col-span-2">
            <Textarea label="Subject" rows={2} value={values.subject} error={errors.subject}
              placeholder="What the notification amends, in one or two sentences."
              onChange={(event) => set('subject', event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Notification text" rows={5} value={values.body} error={errors.body}
              placeholder="The substance of the change, written so an employer knows what it means in practice."
              onChange={(event) => set('body', event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Who it applies to" rows={2} value={values.applicability} error={errors.applicability}
              placeholder="e.g. Every establishment covered by the ESI Act."
              onChange={(event) => set('applicability', event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Action required" rows={3} value={values.action_required} error={errors.action_required}
              placeholder="What employers must now do — update the master, enrol employees, revise the policy."
              onChange={(event) => set('action_required', event.target.value)} />
          </div>
          <Select
            label="Status" value={values.status} error={errors.status}
            options={INSTRUMENT_STATUSES.map((value) => ({ value, label: value }))}
            onChange={(value) => set('status', value)}
          />
        </CardBody>
        <CardFooter className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{mode === 'create' ? 'Register Notification' : 'Save Changes'}</Button>
        </CardFooter>
      </Card>
    </form>
  );
}
