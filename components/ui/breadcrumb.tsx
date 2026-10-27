import Link from 'next/link';
import { Fragment } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** Renders below the page title; the final item is always plain text. */
export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li>
                {last || !item.href ? (
                  <span className={last ? 'font-medium text-ink-soft' : ''} aria-current={last ? 'page' : undefined}>
                    {item.label}
                  </span>
                ) : (
                  <Link href={item.href} className="hover:text-brand-600 hover:underline">
                    {item.label}
                  </Link>
                )}
              </li>
              {!last && (
                <li aria-hidden className="text-slate-300">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/** Page header with title, breadcrumb, description and right-hand actions. */
export function PageHeader({ title, breadcrumbs, description, actions, sticky }: {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  description?: string;
  actions?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <div className={`mb-4 ${sticky ? 'sticky top-16 z-20 -mx-4 border-b border-line bg-surface-canvas/95 px-4 py-3 lg:-mx-6 lg:px-6 backdrop-blur' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title break-words">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} className="mt-1.5" />}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
