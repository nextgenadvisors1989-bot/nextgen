'use client';

import { useState } from 'react';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { SiteIcon } from '@/components/public/icons';

const SERVICES = [
  'Zero Liquid Discharge / ETP Advisory',
  'IS 14489 Safety Audit & DISH License',
  'GHG Protocol Carbon Footprint (Scope 1-3)',
  'GOTS / GRS / Textile Exchange Certification',
  'TNPCB CTO Red Category Renewal & Defense',
];

const EMPTY = { company_name: '', contact_person: '', email: '', phone: '', district_state: 'Tirupur, Tamil Nadu', service: SERVICES[0], notes: '' };
const FIELD = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-[#0B2545] focus:border-[#0B2545] focus:outline-none';

/** The "Official Plant Audit Request Form": every submission lands in the admin's Contact Enquiries inbox. */
export function EnquiryForm() {
  const [form, setForm] = useState({ ...EMPTY });
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
      message: `Service requested: ${form.service}\nDistrict / State: ${form.district_state}\n\n${form.notes || 'No further scope provided.'}`,
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
    setForm({ ...EMPTY });
    setTimeout(() => setState('idle'), 6000);
  }

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
      <div>
        <h3 className="text-lg font-bold text-[#0B2545]">Official Plant Audit Request Form</h3>
        <p className="mt-0.5 text-xs text-slate-500">Submit your manufacturing plant details for statutory scoping and pre-audit proposal</p>
      </div>

      <form onSubmit={submit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block font-bold text-slate-700">Company / Factory Name *</span>
            <input required className={FIELD} placeholder="e.g. Shakthi Knitting Unit #2" value={form.company_name} onChange={set('company_name')} />
            {errors.company_name && <span className="mt-1 block text-red-600">{errors.company_name}</span>}
          </label>
          <label className="block"><span className="mb-1 block font-bold text-slate-700">Contact Person & Designation *</span>
            <input required className={FIELD} placeholder="e.g. S. Raman (EHS General Manager)" value={form.contact_person} onChange={set('contact_person')} />
            {errors.name && <span className="mt-1 block text-red-600">{errors.name}</span>}
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block font-bold text-slate-700">Official Email Address *</span>
            <input required type="email" className={FIELD} placeholder="ehs@company.com" value={form.email} onChange={set('email')} />
            {errors.email && <span className="mt-1 block text-red-600">{errors.email}</span>}
          </label>
          <label className="block"><span className="mb-1 block font-bold text-slate-700">Phone / Mobile Number *</span>
            <input required type="tel" className={FIELD} placeholder="+91 98422 00000" value={form.phone} onChange={set('phone')} />
            {errors.mobile && <span className="mt-1 block text-red-600">{errors.mobile}</span>}
          </label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block font-bold text-slate-700">Manufacturing District & State</span>
            <input className={FIELD} value={form.district_state} onChange={set('district_state')} />
          </label>
          <label className="block"><span className="mb-1 block font-bold text-slate-700">Advisory Service Required</span>
            <select className={FIELD} value={form.service} onChange={set('service')}>
              {SERVICES.map((service) => <option key={service} value={service}>{service}</option>)}
            </select>
          </label>
        </div>
        <label className="block"><span className="mb-1 block font-bold text-slate-700">Specific Plant Scope / Requirements</span>
          <textarea rows={3} className={FIELD} placeholder="Describe your plant capacity (e.g. 500 KLD ETP, 10 Ton/day dyeing), current permits or notice status..." value={form.notes} onChange={set('notes')} />
        </label>

        {errors.form && <div className="rounded-xl border border-red-200 bg-red-50 p-3 font-semibold text-red-700">{errors.form}</div>}
        {state === 'done' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 font-bold text-emerald-800">
            Your official plant audit enquiry has been sent to our team. We will respond within one working day.
          </div>
        )}

        <button type="submit" disabled={state === 'sending'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B2545] py-3.5 text-xs font-extrabold text-white shadow-md transition-all hover:bg-[#133B5C] disabled:opacity-60">
          <span>{state === 'sending' ? 'Sending...' : 'Dispatch Statutory Audit Request'}</span>
          <SiteIcon name="send" className="h-4 w-4 text-amber-400" />
        </button>
      </form>
    </div>
  );
}
