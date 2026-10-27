'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from './sidebar';

interface AssignedModule {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  category: string | null;
  form_count: number;
}

/**
 * Auditor sidebar section listing only the dynamic modules assigned to the
 * signed-in auditor's roles/account — fetched from /api/auditor/modules.
 */
export function DynamicSidebarSection() {
  const [modules, setModules] = useState<AssignedModule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auditor/modules')
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload.success) setModules(payload.data ?? []);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="px-3 py-2">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton mt-2 h-6 rounded" />
      </div>
    );
  }

  if (modules.length === 0) return null;

  return (
    <div className="mt-5">
      <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Assigned Modules</p>
      <ul className="space-y-0.5">
        {modules.map((module) => (
          <li key={module.id}>
            <Link
              href="/auditor/modules"
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] text-slate-300 transition-colors hover:bg-sidebar-hover hover:text-white"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="shrink-0">
                  <Icon name="layers" />
                </span>
                <span className="truncate">{module.name}</span>
              </span>
              {module.form_count > 0 && (
                <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium">{module.form_count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
