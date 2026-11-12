import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { Card, CardBody } from '@/components/ui/card';
import { ActCompliance } from '@/components/compliance/act-compliance';
import { listLibraryActs } from '@/services/act-reader.service';

export const metadata: Metadata = { title: 'Act & Compliance' };
export const dynamic = 'force-dynamic';

export default async function AuditorActCompliancePage({ searchParams }: { searchParams: Promise<{ lib?: string }> }) {
  await requirePanel(['auditor']);
  const { lib } = await searchParams;
  const acts = await listLibraryActs('auditor', { search: lib });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Act & Compliance"
        description="The text of the Acts and Rules, chapter by chapter, and the Legal Compliance Register of Forms, Returns and Statements."
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'Act & Compliance' }]}
      />

      {(acts.length > 0 || lib) && (
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Acts library</h2>
                <p className="mt-0.5 text-sm text-ink-muted">Open an Act to read its Arrangement of Sections, every chapter and section with its sub sections and amendments.</p>
              </div>
              <form method="get" role="search" className="flex gap-2">
                <input type="search" name="lib" defaultValue={lib ?? ''} placeholder="Find an Act" aria-label="Find an Act"
                  className="focus-ring w-56 rounded-lg border border-line px-3 py-1.5 text-sm" />
                <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-surface-muted">Search</button>
              </form>
            </div>
            {acts.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">No Act matches &ldquo;{lib}&rdquo;.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {acts.map((act) => (
                  <li key={act.id}>
                    <Link href={`/auditor/act-compliance/library/${act.id}`}
                      className="focus-ring block h-full rounded-xl border border-line p-4 transition-colors hover:border-brand-300 hover:bg-surface-muted">
                      <span className="block text-sm font-semibold leading-snug text-ink">{act.act_name}</span>
                      {act.subtitle && <span className="mt-0.5 block text-xs text-ink-muted">{act.subtitle}</span>}
                      <span className="mt-2 block text-xs text-ink-muted">
                        {[act.state_name ?? act.jurisdiction, act.part_count ? `${act.part_count} chapters and schedules` : null, `${act.section_count} ${/\brules\b/i.test(act.act_name) ? 'rules' : 'sections'}`].filter(Boolean).join(' · ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <ActCompliance mode="auditor" />
    </div>
  );
}
