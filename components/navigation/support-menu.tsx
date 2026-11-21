'use client';

/** Help menu in the top bar of every panel: email, phones and a WhatsApp chat, all from Settings > Company. */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/utils/api-client';
import { guideForPath } from '@/lib/help/guides';

interface Contact { email: string; phone: string; phone2: string; whatsapp: string; timing: string }

const digits = (value: string) => value.replace(/\D/g, '');

export function SupportMenu() {
  const guide = guideForPath(usePathname() ?? '');
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || contact) return;
    void api.get<Contact>('/api/public/site-contact').then((result) => { if (result.ok && result.data) setContact(result.data); });
  }, [open, contact]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const rows: { label: string; value: string; href: string; external?: boolean }[] = [];
  if (contact?.whatsapp) rows.push({ label: 'WhatsApp', value: contact.whatsapp, href: `https://wa.me/${digits(contact.whatsapp)}?text=${encodeURIComponent('Hello, I need help with ComplianceOS.')}`, external: true });
  if (contact?.phone) rows.push({ label: 'Call', value: contact.phone, href: `tel:${contact.phone.replace(/\s/g, '')}` });
  if (contact?.phone2) rows.push({ label: 'Call (alternate)', value: contact.phone2, href: `tel:${contact.phone2.replace(/\s/g, '')}` });
  if (contact?.email) rows.push({ label: 'Email', value: contact.email, href: `mailto:${contact.email}` });

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Help and contact" className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-surface-muted">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 16.5v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div role="dialog" aria-label="Help and contact" className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-line bg-white p-3 shadow-lg">
          <p className="px-1 pb-2 text-sm font-semibold text-ink">Need help?</p>
          {guide && (
            <Link href={`/${guide.role}/help`} onClick={() => setOpen(false)} className="mb-2 block rounded-lg bg-brand-50 px-2 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100">
              How to use the {guide.panel.toLowerCase()} portal
              <span className="block text-xs font-normal text-brand-700">Step-by-step guide to every task</span>
            </Link>
          )}
          {!contact ? <p className="px-1 py-2 text-xs text-ink-muted">Loading...</p> : rows.length === 0 ? (
            <p className="px-1 py-2 text-xs text-ink-muted">No contact details have been set yet.</p>
          ) : (
            <ul className="space-y-1">
              {rows.map((row) => (
                <li key={row.label}>
                  <a href={row.href} {...(row.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="block rounded-lg px-2 py-2 hover:bg-surface-muted">
                    <span className="block text-[11px] uppercase tracking-wide text-ink-muted">{row.label}</span>
                    <span className="block break-all text-sm font-medium text-ink">{row.value}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {contact?.timing && <p className="px-1 pt-2 text-xs text-ink-muted">{contact.timing}</p>}
        </div>
      )}
    </div>
  );
}
