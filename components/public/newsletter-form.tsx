'use client';

import { useState } from 'react';
import { api } from '@/lib/utils/api-client';
import { SiteIcon } from '@/components/public/icons';

/** The footer's "Statutory Updates Newsletter" box; a signup lands in the admin's Contact Enquiries inbox. */
export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email) return;
    setState('sending');
    const result = await api.post('/api/public/contact', {
      name: 'Newsletter subscriber',
      email,
      subject: 'Statutory updates newsletter',
      message: `Please add ${email} to the statutory updates newsletter.`,
      enquiry_type: 'other',
      website: '',
    });
    if (result.ok) {
      setState('done');
      setEmail('');
    } else {
      setState('failed');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1.5 pt-1">
      <div className="text-[11px] font-bold text-slate-700">Statutory Updates Newsletter</div>
      <div className="flex rounded-md">
        <input
          type="email"
          required
          placeholder="Your official email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-l-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-[#0B1E36] focus:border-[#C59B27] focus:outline-none"
        />
        <button type="submit" disabled={state === 'sending'} aria-label="Subscribe" className="shrink-0 rounded-r-md bg-[#C59B27] px-3 py-1.5 text-white transition-colors hover:bg-[#b0881e] disabled:opacity-60">
          <SiteIcon name="send" className="h-3.5 w-3.5" />
        </button>
      </div>
      {state === 'done' && <div className="text-[10px] font-semibold text-emerald-700">Subscribed to Gazette Alerts!</div>}
      {state === 'failed' && <div className="text-[10px] font-semibold text-red-600">Could not subscribe just now. Please try again.</div>}
    </form>
  );
}
