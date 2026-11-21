'use client';

import { useId, useState } from 'react';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { SiteIcon } from '@/components/public/icons';

const OTHER = 'Something else / not sure yet';
const EMPTY = { company_name: '', contact_person: '', email: '', phone: '', district_state: '', service: '', notes: '' };
const FIELD = 'w-full rounded-sm border border-slate-400 bg-white px-3.5 py-3 text-base text-[#0B1E36] placeholder:text-slate-400 focus:border-[#0B1E36] focus:outline-none focus:ring-2 focus:ring-[#C59B27]/60';
const LABEL = 'mb-1.5 block text-sm font-bold text-[#0B1E36]';

/** The "Official Plant Audit Request Form": every submission lands in the admin's Contact Enquiries inbox. */
export function EnquiryForm({ services = [] }: { services?: string[] }) {
  const uid = useId();
  const options = [...services, OTHER];
  const [form, setForm] = useState({ ...EMPTY, service: options[0] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  const set = (field: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    setErrors({});
    const result = await api.post('/api/public/contact', {
      name: form.contact_person,
      email: form.email,
      mobile: form.phone,
      company_name: form.company_name,
      subject: form.service,
      message: `Service requested: ${form.service}\nDistrict / State: ${form.district_state || 'not given'}\n\n${form.notes || 'No further scope provided.'}`,
      enquiry_type: 'sales',
      website: '',
    });
    if (!result.ok) {
      setState('idle');
      const fields = fieldErrors(result);
      setErrors(Object.keys(fields).length ? fields : { form: result.message });
      return;
    }
    setState('done');
    setForm({ ...EMPTY, service: options[0] });
  }

  const id = (name: string) => `${uid}-${name}`;
  return (
    <div className="rounded-sm border border-[#0B1E36]/25 bg-white p-6 shadow-[6px_6px_0_0_rgba(11,30,54,0.08)] sm:p-8">
      <h3 className="font-display text-2xl font-semibold text-[#0B1E36]">Request a plant audit</h3>
      <p className="mt-1 text-[15px] text-slate-600">Tell us about your plant. Fields marked * are needed.</p>

      <form onSubmit={submit} className="mt-6 space-y-5" noValidate={false}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={id('company')} className={LABEL}>Company / factory name *</label>
            <input id={id('company')} required autoComplete="organization" className={FIELD} value={form.company_name} onChange={set('company_name')} aria-invalid={Boolean(errors.company_name)} />
            {errors.company_name && <p className="mt-1 text-sm font-medium text-red-700">{errors.company_name}</p>}
          </div>
          <div>
            <label htmlFor={id('person')} className={LABEL}>Contact person *</label>
            <input id={id('person')} required autoComplete="name" className={FIELD} value={form.contact_person} onChange={set('contact_person')} aria-invalid={Boolean(errors.name)} />
            {errors.name && <p className="mt-1 text-sm font-medium text-red-700">{errors.name}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={id('email')} className={LABEL}>E-mail *</label>
            <input id={id('email')} required type="email" autoComplete="email" className={FIELD} value={form.email} onChange={set('email')} aria-invalid={Boolean(errors.email)} />
            {errors.email && <p className="mt-1 text-sm font-medium text-red-700">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor={id('phone')} className={LABEL}>Mobile number *</label>
            <input id={id('phone')} required type="tel" inputMode="tel" autoComplete="tel" className={FIELD} value={form.phone} onChange={set('phone')} aria-invalid={Boolean(errors.mobile)} />
            {errors.mobile && <p className="mt-1 text-sm font-medium text-red-700">{errors.mobile}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={id('place')} className={LABEL}>District & state</label>
            <input id={id('place')} autoComplete="address-level2" className={FIELD} placeholder="Where is the plant?" value={form.district_state} onChange={set('district_state')} />
          </div>
          <div>
            <label htmlFor={id('service')} className={LABEL}>What do you need?</label>
            <select id={id('service')} className={FIELD} value={form.service} onChange={set('service')}>
              {options.map((service) => <option key={service} value={service}>{service}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={id('notes')} className={LABEL}>About your plant (optional)</label>
          <textarea id={id('notes')} rows={4} className={FIELD} placeholder="What you make, how many people work there, any notice or renewal that is due." value={form.notes} onChange={set('notes')} />
        </div>

        <div aria-live="polite">
          {errors.form && <div role="alert" className="rounded-sm border border-red-300 bg-red-50 p-3 text-[15px] font-semibold text-red-800">{errors.form}</div>}
          {state === 'done' && (
            <div role="status" className="rounded-sm border border-emerald-300 bg-emerald-50 p-3.5 text-[15px] font-semibold text-emerald-900">
              Thank you — your enquiry has reached our team. We will contact you on the e-mail or mobile number you gave.
            </div>
          )}
        </div>

        <button type="submit" disabled={state === 'sending'} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-sm bg-[#0B1E36] px-6 text-base font-bold text-white transition-colors hover:bg-[#16365c] disabled:opacity-60 motion-reduce:transition-none">
          <span>{state === 'sending' ? 'Sending…' : 'Send enquiry'}</span>
          <SiteIcon name="send" className="h-4 w-4 text-[#C59B27]" />
        </button>
      </form>
    </div>
  );
}
