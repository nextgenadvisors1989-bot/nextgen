'use client';

/** "Quotation Generation" on the public site: pick the services, describe the plant, and the request lands in the admin's Contact Enquiries inbox. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, fieldErrors } from '@/lib/utils/api-client';

interface Service { id: number; name: string; scope: string | null; frequency: string }
const FIELD = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';
const EMPTY = { company_name: '', contact_person: '', email: '', phone: '', location: '', employees: '', shifts: '', notes: '' };

export function QuotationRequest() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');

  useEffect(() => { api.get<Service[]>('/api/public/billing-services').then((r) => setServices(r.ok && Array.isArray(r.data) ? r.data : [])); }, []);
  const set = (key: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const toggle = (id: number) => setChosen((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (chosen.length === 0) { setErrors({ services: 'Choose at least one service to be quoted' }); return; }
    setState('sending');
    setErrors({});
    const picked = (services ?? []).filter((s) => chosen.includes(s.id));
    const result = await api.post('/api/public/contact', {
      name: form.contact_person, email: form.email, mobile: form.phone, company_name: form.company_name,
      subject: `Quotation request - ${picked.length} service${picked.length === 1 ? '' : 's'}`,
      message: `Quotation requested for:\n${picked.map((s, i) => `${i + 1}. ${s.name} (${s.frequency.toLowerCase()})`).join('\n')}\n\nLocation: ${form.location || '-'}\nEmployees: ${form.employees || '-'}\nShifts: ${form.shifts || '-'}\n\n${form.notes || 'No further notes.'}`,
      enquiry_type: 'sales', website: '',
    });
    if (!result.ok) {
      setState('idle');
      const fields = fieldErrors(result);
      setErrors(Object.keys(fields).length ? fields : { form: result.message });
      return;
    }
    setState('done');
  }

  if (state === 'done') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center" role="status">
        <h2 className="text-2xl font-bold text-emerald-900">Request received</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-emerald-900/80">Thank you. Our team will study the scope and send you a priced quotation. Once you accept it, your tax invoices and receipts appear under Billing in your client portal.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Back to home</Link>
          <button type="button" onClick={() => { setState('idle'); setChosen([]); setForm({ ...EMPTY }); }} className="rounded-lg border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface-muted">Request another</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <fieldset>
        <legend className="text-lg font-bold text-ink">1. Choose the services</legend>
        <p className="mt-1 text-sm text-ink-muted">Tick everything you would like quoted. You can change the scope when we reply.</p>
        {errors.services && <p className="mt-2 text-sm font-medium text-red-600" role="alert">{errors.services}</p>}
        {services === null ? <p className="mt-4 text-sm text-ink-muted">Loading services...</p> : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {services.map((s) => (
              <li key={s.id}>
                <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${chosen.includes(s.id) ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:bg-surface-muted'}`}>
                  <input type="checkbox" checked={chosen.includes(s.id)} onChange={() => toggle(s.id)} className="mt-1 h-4 w-4 shrink-0 accent-[#C59B27]" />
                  <span><span className="block text-sm font-semibold text-ink">{s.name}</span><span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{s.scope}</span></span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-bold text-ink">2. Tell us about your company</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-ink-soft">Company / factory name *<input required className={`${FIELD} mt-1`} value={form.company_name} onChange={set('company_name')} />{errors.company_name && <span className="mt-1 block text-red-600">{errors.company_name}</span>}</label>
          <label className="block text-xs font-semibold text-ink-soft">Contact person *<input required className={`${FIELD} mt-1`} value={form.contact_person} onChange={set('contact_person')} />{errors.name && <span className="mt-1 block text-red-600">{errors.name}</span>}</label>
          <label className="block text-xs font-semibold text-ink-soft">Email *<input required type="email" className={`${FIELD} mt-1`} value={form.email} onChange={set('email')} />{errors.email && <span className="mt-1 block text-red-600">{errors.email}</span>}</label>
          <label className="block text-xs font-semibold text-ink-soft">Phone *<input required className={`${FIELD} mt-1`} value={form.phone} onChange={set('phone')} />{errors.mobile && <span className="mt-1 block text-red-600">{errors.mobile}</span>}</label>
          <label className="block text-xs font-semibold text-ink-soft">Location<input className={`${FIELD} mt-1`} value={form.location} onChange={set('location')} placeholder="Tiruppur, Tamil Nadu" /></label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-xs font-semibold text-ink-soft">Employees<input type="number" min={0} className={`${FIELD} mt-1`} value={form.employees} onChange={set('employees')} /></label>
            <label className="block text-xs font-semibold text-ink-soft">Shifts<input type="number" min={0} className={`${FIELD} mt-1`} value={form.shifts} onChange={set('shifts')} /></label>
          </div>
        </div>
        <label className="block text-xs font-semibold text-ink-soft">Anything else we should know<textarea rows={3} className={`${FIELD} mt-1`} value={form.notes} onChange={set('notes')} /></label>
      </fieldset>

      {errors.form && <p className="text-sm font-medium text-red-600" role="alert">{errors.form}</p>}
      {errors.message && <p className="text-sm font-medium text-red-600" role="alert">{errors.message}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={state === 'sending'} className="rounded-lg bg-brand-500 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60">{state === 'sending' ? 'Sending...' : `Request quotation${chosen.length ? ` (${chosen.length} selected)` : ''}`}</button>
        <p className="text-xs text-ink-muted">The fees are prepared by our team for your scope; you are not charged for asking.</p>
      </div>
    </form>
  );
}
