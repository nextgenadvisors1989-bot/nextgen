'use client';

import { useState } from 'react';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { api, fieldErrors } from '@/lib/utils/api-client';

const ENQUIRY_OPTIONS = [
  { value: 'demo', label: 'Request a product demo' },
  { value: 'sales', label: 'Pricing and commercial enquiry' },
  { value: 'support', label: 'Support for an existing account' },
  { value: 'partnership', label: 'Partnership or reseller enquiry' },
  { value: 'careers', label: 'Careers' },
  { value: 'other', label: 'Something else' },
];

const EMPTY = { name: '', email: '', mobile: '', company_name: '', subject: '', message: '', website: '' };

export function ContactForm() {
  const [form, setForm] = useState({ ...EMPTY });
  const [enquiryType, setEnquiryType] = useState('demo');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ enquiryId: number | null } | null>(null);

  const set = (field: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setErrors({});

    const result = await api.post<{ enquiryId: number | null }>('/api/public/contact', {
      ...form,
      enquiry_type: enquiryType,
    });

    setSending(false);

    if (!result.ok) {
      setErrors(fieldErrors(result));
      setErrors((current) => (Object.keys(current).length ? current : { message: result.message }));
      return;
    }

    setSent({ enquiryId: (result.data as { enquiryId?: number | null } | undefined)?.enquiryId ?? null });
    setForm({ ...EMPTY });
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h2 className="mt-4 text-xl font-semibold text-emerald-900">Thank you — your enquiry is with us</h2>
        <p className="mt-2 text-sm leading-relaxed text-emerald-800">
          {sent.enquiryId ? `Your reference number is #${sent.enquiryId}. ` : ''}
          A confirmation email is on its way, and a member of our team will respond within one working day.
        </p>
        <button
          type="button"
          onClick={() => setSent(null)}
          className="mt-6 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-700"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line p-6 lg:p-8">
      <h2 className="text-xl font-semibold text-ink">Send us an enquiry</h2>
      <p className="mt-1 text-sm text-ink-muted">Fields marked with * are required.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Full Name" requiredMark value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Ramesh Kumar" />
        <Input label="Work Email" type="email" requiredMark value={form.email} onChange={set('email')} error={errors.email} placeholder="you@company.com" />
        <Input label="Mobile" value={form.mobile} onChange={set('mobile')} error={errors.mobile} placeholder="+91 98xxx xxxxx" />
        <Input label="Company Name" value={form.company_name} onChange={set('company_name')} error={errors.company_name} />
        <Select label="What can we help with?" value={enquiryType} onChange={setEnquiryType} options={ENQUIRY_OPTIONS} />
        <Input label="Subject" requiredMark value={form.subject} onChange={set('subject')} error={errors.subject} placeholder="e.g. Safety audit for a 300-worker unit" />
        <div className="sm:col-span-2">
          <Textarea
            label="Message" required rows={6} value={form.message} onChange={set('message')} error={errors.message}
            placeholder="Tell us your industry, state, headcount and the audits or statutory returns you need help with."
          />
        </div>
      </div>

      {/* Honeypot — hidden from users, catches automated submissions. */}
      <div className="hidden" aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
      </div>

      {errors.message && !errors.subject && <p className="mt-4 text-sm text-red-600">{errors.message}</p>}

      <div className="mt-6 flex items-center gap-4">
        <Button type="submit" loading={sending}>Send Enquiry</Button>
        <p className="text-xs text-ink-muted">
          We use your details only to respond to this enquiry — see our privacy policy.
        </p>
      </div>
    </form>
  );
}
