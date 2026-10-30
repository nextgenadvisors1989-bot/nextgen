'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';

export interface MenuItem {
  label: string;
  href?: string;
  icon?: ReactNode;
  badge?: number | string;
  children?: MenuItem[];
  permission?: string;
}

export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

/** Inline icon set (stroke-based, 18px) so no icon dependency is required. */
const ICONS: Record<string, ReactNode> = {
  dashboard: <path d="M3 12h7V3H3v9Zm11 9h7v-9h-7v9ZM3 21h7v-6H3v6Zm11-12h7V3h-7v6Z" />,
  factory: <path d="M2 21V9l6 4V9l6 4V5h3v8h5v8H2zM7 17h2M12 17h2M17 17h2" />,
  building: <path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M15 21V9h3a2 2 0 0 1 2 2v10M8 7h3M8 11h3M8 15h3M2 21h20" />,
  users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  userCheck: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6 4 2 2 4-4" />,
  clipboard: <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h4" />,
  fileText: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M9 13h6M9 17h4" />,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  alert: <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01" />,
  flask: <path d="M9 2v6l-5 9a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3l-5-9V2M7 2h10M6.5 14h11" />,
  permit: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M9 15l2 2 4-4" />,
  gavel: <path d="m14 13-8.5 8.5a2.12 2.12 0 0 1-3-3L11 10m3 3 3-3m-6 0 3 3m0 0 4 4M14 4l3 3M16.5 1.5 22 7l-3 3-5.5-5.5 3-3Z" />,
  verify: <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622C17.176 19.29 21 14.591 21 9c0-1.042-.133-2.052-.382-3.016Z" />,
  calendar: <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />,
  rupee: <path d="M6 3h12M6 8h12M6 13h4a5 5 0 0 0 0-10M6 13l8 8" />,
  clock: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v4l3 2" />,
  folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11Z" />,
  bell: <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />,
  globe: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0 0c2.5-2.7 4-6.2 4-10s-1.5-7.3-4-10m0 20c-2.5-2.7-4-6.2-4-10s1.5-7.3 4-10M2 12h20" />,
  chart: <path d="M3 3v18h18M7 15v3M12 10v8M17 6v12" />,
  history: <path d="M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.5 7.5 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2l-.4-2.5h-4l-.4 2.5a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z" />,
  key: <path d="M15.5 9a4.5 4.5 0 0 1-6.6 4L7 15v3H4v-3l5.5-5.5A4.5 4.5 0 1 1 15.5 9Zm-3.5 0h.01" />,
  layers: <path d="m12 2 9 5-9 5-9-5 9-5Zm9 12-9 5-9-5m18-5-9 5-9-5" />,
  form: <path d="M4 4h16v16H4zM8 9h8M8 13h5" />,
  table: <path d="M3 5h18v14H3zM3 10h18M9 10v9M15 10v9" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5l-9.6 9.6a2.1 2.1 0 0 1-3-3L14.7 6.3Z" />,
  award: <path d="M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm-3 .5V22l3-2 3 2v-6.5" />,
  download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />,
};

export function Icon({ name, className }: { name: keyof typeof ICONS | string; className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {ICONS[name] ?? ICONS.dashboard}
    </svg>
  );
}

export interface SidebarProps {
  sections: MenuSection[];
  panelLabel: string;
  appName?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  footer?: ReactNode;
}

/** Fixed 260px sidebar; slides in from the left on mobile. */
export function Sidebar({ sections, panelLabel, appName = 'NextGen Socio & Enviro Advisors', onNavigate, footer }: SidebarProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<string[]>(() =>
    sections.flatMap((section) =>
      section.items
        .filter((item) => item.children?.some((child) => child.href && pathname.startsWith(child.href)))
        .map((item) => item.label)
    )
  );

  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === pathname) return true;
    return pathname.startsWith(`${href}/`) && href.split('/').filter(Boolean).length > 1;
  };

  /** Among sub-menu links, only the most specific match is highlighted ("/x/categories" beats "/x"). */
  const isActiveChild = (child: { href?: string }, siblings: { href?: string }[]) => {
    if (!isActive(child.href)) return false;
    return !siblings.some((other) => other.href && other.href !== child.href && other.href.length > (child.href ?? '').length && isActive(other.href));
  };

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-text">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <span className="flex h-11 w-[88px] shrink-0 items-center justify-center rounded-lg bg-white px-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt={appName} className="max-h-full max-w-full object-contain" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold leading-tight">{panelLabel}</span>
          <span className="block truncate text-[11px] tracking-wide text-slate-400">NextGen Socio &amp; Enviro</span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, index) => (
          <div key={section.title ?? index} className={index > 0 ? 'mt-5' : ''}>
            {section.title && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section.title}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const hasChildren = Boolean(item.children?.length);
                const open = expanded.includes(item.label);
                const active = isActive(item.href) || item.children?.some((child) => isActive(child.href));
                return (
                  <li key={item.label}>
                    {hasChildren ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setExpanded((current) => (current.includes(item.label) ? current.filter((l) => l !== item.label) : [...current, item.label]))}
                          className={clsx(
                            'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-150',
                            active ? 'bg-sidebar-hover text-white' : 'text-slate-300 hover:bg-sidebar-hover hover:text-white'
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            {item.icon && <span className="shrink-0">{item.icon}</span>}
                            <span className="truncate">{item.label}</span>
                          </span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={clsx('shrink-0 transition-transform duration-200', open && 'rotate-90')}>
                            <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.ul
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: 'easeOut' }}
                              className="overflow-hidden pl-4"
                            >
                              {item.children!.map((child) => (
                                <li key={child.label}>
                                  <Link
                                    href={child.href ?? '#'}
                                    onClick={onNavigate}
                                    className={clsx(
                                      'mt-0.5 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-150',
                                      isActiveChild(child, item.children ?? []) ? 'bg-brand-500 text-white' : 'text-slate-400 hover:bg-sidebar-hover hover:text-white'
                                    )}
                                  >
                                    <span className="truncate">{child.label}</span>
                                  </Link>
                                </li>
                              ))}
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      </>
                    ) : (
                      <Link
                        href={item.href ?? '#'}
                        onClick={onNavigate}
                        className={clsx(
                          'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-150',
                          isActive(item.href)
                            ? 'bg-brand-500 font-medium text-white'
                            : 'text-slate-300 hover:bg-sidebar-hover hover:text-white'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          {item.icon && <span className="shrink-0">{item.icon}</span>}
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badge !== undefined && item.badge !== 0 && (
                          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{item.badge}</span>
                        )}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {footer && <div className="border-t border-white/10 p-3">{footer}</div>}
    </aside>
  );
}

/** Mobile off-canvas wrapper: hamburger toggles, backdrop closes. */
export function MobileSidebar({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-slate-900/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: -260 }}
            animate={{ x: 0 }}
            exit={{ x: -260 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="absolute left-0 top-0 h-full"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
