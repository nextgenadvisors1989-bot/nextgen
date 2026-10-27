'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Avatar } from '@/components/ui/avatar';
import { getCsrfToken } from '@/components/ui/file-upload';
import { timeAgo } from '@/lib/utils/dates';

export interface TopbarUser {
  id: number;
  fullName: string;
  email: string;
  roleLabel: string;
  profilePhoto?: string | null;
  dashboardPath: string;
  settingsPath: string;
  profilePath: string;
}

export interface TopbarNotification {
  id: number;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  action_url: string | null;
  type: string;
}

/** 64px sticky header: menu toggle, page search, notifications, user menu. */
export function Topbar({ user, onMenuClick, notifications = [], unreadCount = 0, title, actions }: {
  actions?: React.ReactNode;
  user: TopbarUser;
  onMenuClick: () => void;
  notifications?: TopbarNotification[];
  unreadCount?: number;
  title?: string;
}) {
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
        setNotifOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setUserMenuOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken() } });
    router.push('/login');
    router.refresh();
  };

  const markAllRead = async () => {
    await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
      body: JSON.stringify({}),
    });
    router.refresh();
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    setSearchOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-white px-4 lg:px-6" ref={wrapperRef}>
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenuClick} className="rounded-lg p-2 text-ink-soft hover:bg-surface-muted lg:hidden" aria-label="Open navigation menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {title && <h2 className="truncate text-base font-semibold text-ink">{title}</h2>}
      </div>

      <div className="flex items-center gap-1.5">
        {actions}
        <button type="button" onClick={() => setSearchOpen((value) => !value)} className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-surface-muted" aria-label="Search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen((value) => !value);
              setUserMenuOpen(false);
            }}
            className="relative rounded-lg p-2 text-ink-soft transition-colors hover:bg-surface-muted"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="animate-slide-down fixed inset-x-3 top-[4.25rem] z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-sm font-semibold text-ink">Notifications</p>
                {unreadCount > 0 && (
                  <button type="button" onClick={markAllRead} className="text-xs font-medium text-brand-600 hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {notifications.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-muted">You have no notifications</li>}
                {notifications.map((notification) => (
                  <li key={notification.id} className={clsx(!notification.is_read && 'bg-brand-50/50')}>
                    <Link
                      href={notification.action_url ?? '#'}
                      onClick={() => setNotifOpen(false)}
                      className="block px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <p className="text-[13px] font-medium text-ink">{notification.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{notification.message}</p>
                      <p className="mt-1 text-[11px] text-ink-muted">{timeAgo(notification.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={user.settingsPath.replace('/settings', '/notifications')} onClick={() => setNotifOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-xs font-medium text-brand-600 hover:bg-surface-muted">
                View all notifications
              </Link>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setUserMenuOpen((value) => !value);
              setNotifOpen(false);
            }}
            className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-surface-muted"
          >
            <Avatar name={user.fullName} src={user.profilePhoto} size={32} />
            <span className="hidden text-left sm:block">
              <span className="block max-w-[140px] truncate text-[13px] font-medium leading-tight text-ink">{user.fullName}</span>
              <span className="block text-[11px] leading-tight text-ink-muted">{user.roleLabel}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="hidden text-ink-muted sm:block">
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          {userMenuOpen && (
            <div className="animate-slide-down absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
                <p className="truncate text-xs text-ink-muted">{user.email}</p>
              </div>
              <Link href={user.profilePath} className="block px-4 py-2.5 text-sm text-ink-soft hover:bg-surface-muted" onClick={() => setUserMenuOpen(false)}>
                My Profile
              </Link>
              <Link href={user.settingsPath} className="block px-4 py-2.5 text-sm text-ink-soft hover:bg-surface-muted" onClick={() => setUserMenuOpen(false)}>
                Settings
              </Link>
              <Link href="/change-password" className="block px-4 py-2.5 text-sm text-ink-soft hover:bg-surface-muted" onClick={() => setUserMenuOpen(false)}>
                Change Password
              </Link>
              <button type="button" onClick={logout} className="w-full border-t border-line px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50">
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24" onClick={() => setSearchOpen(false)}>
          <form
            onSubmit={submitSearch}
            onClick={(event) => event.stopPropagation()}
            className="animate-scale-in w-full max-w-xl rounded-xl bg-white p-2 shadow-2xl"
          >
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search employers, employees, auditors, reports…"
              className="h-12 w-full rounded-lg border-0 px-4 text-base focus:outline-none"
            />
            <div className="flex items-center justify-between px-3 py-2 text-xs text-ink-muted">
              <span>Press Enter to search globally</span>
              <kbd className="rounded border border-line px-1.5 py-0.5">Esc</kbd>
            </div>
          </form>
        </div>
      )}
    </header>
  );
}
