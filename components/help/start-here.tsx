'use client';

/**
 * "Start here" card on a dashboard: the first few things people of this role usually come to do, each one click away.
 * It can be closed (remembered in this browser) and comes back from the Help & Guide page.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GUIDES, tasksFor, type GuideRole } from '@/lib/help/guides';

export function StartHere({ role, limit = 4, permissions }: { role: GuideRole; limit?: number; permissions?: readonly string[] }) {
  const guide = { ...GUIDES[role], tasks: tasksFor(GUIDES[role], permissions) };
  const key = `cos-start-here-${role}`;
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    try { setClosed(window.localStorage.getItem(key) === 'closed'); } catch { /* storage blocked: stay open */ }
  }, [key]);

  function close() {
    setClosed(true);
    try { window.localStorage.setItem(key, 'closed'); } catch { /* ignore */ }
  }

  if (closed) {
    return (
      <p className="text-sm text-ink-muted">
        <Link href={`/${role}/help`} className="font-medium text-brand-700 hover:underline">Help &amp; Guide</Link> — step-by-step help for every screen.
      </p>
    );
  }

  return (
    <section aria-labelledby={`start-${role}`} className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`start-${role}`} className="text-base font-semibold text-ink">Start here — what would you like to do?</h2>
          <p className="mt-0.5 text-sm text-ink-soft">The most common jobs, one click away.</p>
        </div>
        <button type="button" onClick={close} className="shrink-0 rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-white hover:text-ink focus-ring">Hide</button>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {guide.tasks.slice(0, limit).map((task) => (
          <li key={task.href}>
            <Link href={task.href} className="focus-ring flex h-full flex-col rounded-lg border border-line bg-white p-3 transition-colors hover:border-brand-500">
              <span className="text-sm font-semibold text-ink">{task.title}</span>
              <span className="mt-1 text-xs text-ink-muted">{task.where}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm"><Link href={`/${role}/help`} className="font-medium text-brand-700 hover:underline">See every task with its steps →</Link></p>
    </section>
  );
}
