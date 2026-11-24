'use client';

/**
 * The statutory directory of the home page: Acts, central links, state links and reports in one tabbed panel instead
 * of four small boxes side by side. Every panel is in the page's HTML (search engines and the "no script" case see
 * all four); the tabs only choose which one is shown. Arrow keys, Home and End move between tabs.
 */
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { SiteIcon } from '@/components/public/icons';

export interface DirectoryRow { title: string; subtitle?: string; link?: string }
export interface DirectoryTab {
  id: string;
  label: string;
  icon: string;
  rows: DirectoryRow[];
  action: { label: string; href: string };
}

function RowLink({ row, className, children }: { row: DirectoryRow; className: string; children: React.ReactNode }) {
  const href = row.link;
  if (!href) return <div className={className}>{children}</div>;
  if (/^https?:\/\//.test(href)) return <a href={href} target="_blank" rel="noreferrer" className={className}>{children}</a>;
  if (/^(mailto|tel):/.test(href)) return <a href={href} className={className}>{children}</a>;
  return <Link href={href} className={className}>{children}</Link>;
}

export function HomeDirectory({ tabs }: { tabs: DirectoryTab[] }) {
  const uid = useId();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const visible = tabs.filter((tab) => tab.rows.length > 0);
  if (!visible.length) return null;
  const current = Math.min(active, visible.length - 1);

  function onKey(event: React.KeyboardEvent, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % visible.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + visible.length) % visible.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = visible.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="overflow-hidden rounded-[2rem] bg-white shadow-xl shadow-[#0B1E36]/10 ring-1 ring-[#0B1E36]/5">
      <div role="tablist" aria-label="Statutory directory" className="flex gap-2 overflow-x-auto px-4 pt-4 sm:px-6 sm:pt-6">
        {visible.map((tab, index) => {
          const selected = index === current;
          return (
            <button
              key={tab.id}
              ref={(node) => { refs.current[index] = node; }}
              type="button"
              role="tab"
              id={`${uid}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onKey(event, index)}
              className={`flex min-h-[46px] shrink-0 items-center gap-2 rounded-full px-5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C59B27] ${
                selected ? 'bg-[#0B1E36] text-white' : 'bg-[#FAF7F0] text-slate-700 hover:bg-[#F2E6C4]'
              }`}
            >
              <SiteIcon name={tab.icon} className={`h-4 w-4 ${selected ? 'text-[#E2B94A]' : 'text-[#9A7518]'}`} />
              <span>{tab.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${selected ? 'bg-white/20 text-white' : 'bg-[#0B1E36]/10 text-slate-700'}`}>{tab.rows.length}</span>
            </button>
          );
        })}
      </div>

      {visible.map((tab, index) => (
        <div key={tab.id} role="tabpanel" id={`${uid}-panel-${tab.id}`} aria-labelledby={`${uid}-tab-${tab.id}`} hidden={index !== current} className="p-5 sm:p-8">
          <ul className="grid gap-x-10 sm:grid-cols-2">
            {tab.rows.map((row, i) => (
              <li key={i} className="border-b border-slate-200">
                <RowLink row={row} className="group flex min-h-[48px] items-center justify-between gap-3 py-3 text-[15px] font-medium text-[#0B1E36] hover:text-[#9A7518]">
                  <span>{row.title}</span>
                  {row.subtitle ? (
                    <span className="shrink-0 rounded-full bg-[#F2E6C4] px-2.5 py-0.5 text-xs font-semibold text-[#6B4F0E]">{row.subtitle}</span>
                  ) : (
                    <SiteIcon name={/^https?:/.test(row.link ?? '') ? 'external' : 'arrow'} className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#9A7518]" />
                  )}
                </RowLink>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <RowLink row={{ title: tab.action.label, link: tab.action.href }} className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#0B1E36] px-6 text-sm font-bold text-white transition-colors hover:bg-[#16365c]">
              <span>{tab.action.label}</span>
              <SiteIcon name="arrow" className="h-4 w-4" />
            </RowLink>
          </div>
        </div>
      ))}
    </div>
  );
}
