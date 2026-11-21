import Link from 'next/link';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card } from '@/components/ui/card';
import { GUIDES, tasksFor, type GuideRole } from '@/lib/help/guides';

/** The full Help & Guide page of a panel: every task, with its steps. */
export function GuidePage({ role, permissions }: { role: GuideRole; permissions?: readonly string[] }) {
  const guide = { ...GUIDES[role], tasks: tasksFor(GUIDES[role], permissions) };
  return (
    <div className="space-y-5">
      <PageHeader
        title="Help & Guide"
        description={guide.intro}
        breadcrumbs={[{ label: 'Dashboard', href: `/${role}/dashboard` }, { label: 'Help & Guide' }]}
      />
      <nav aria-label="Tasks on this page">
        <ul className="flex flex-wrap gap-2">
          {guide.tasks.map((task, index) => (
            <li key={task.href}><a href={`#task-${index + 1}`} className="focus-ring inline-block rounded-full border border-line bg-white px-3 py-1 text-sm text-ink-soft hover:border-brand-500 hover:text-ink">{task.title}</a></li>
          ))}
        </ul>
      </nav>
      <ol className="space-y-4">
        {guide.tasks.map((task, index) => (
          <li key={task.href} id={`task-${index + 1}`} className="scroll-mt-24">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-ink"><span className="mr-2 font-mono text-sm text-ink-muted">{index + 1}.</span>{task.title}</h2>
                  <p className="mt-0.5 text-sm text-ink-muted">Where: {task.where}</p>
                </div>
                <Link href={task.href} className="focus-ring shrink-0 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Take me there</Link>
              </div>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
                {task.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              {task.tip && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>Good to know:</strong> {task.tip}</p>}
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
