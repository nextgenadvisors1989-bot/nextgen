import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePanel } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ActReader } from '@/components/acts/act-reader';
import { readAct } from '@/services/act-reader.service';

export const metadata: Metadata = { title: 'Act' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ actId: string }>; searchParams: Promise<{ part?: string; q?: string; view?: string }> };

export default async function AuditorActPage({ params, searchParams }: Props) {
  await requirePanel(['auditor']);
  const id = Number((await params).actId);
  const sp = await searchParams;
  if (!Number.isInteger(id) || id <= 0) notFound();
  const part = sp.part !== undefined && /^\d+$/.test(sp.part) ? Number(sp.part) : null;
  const data = await readAct(id, 'auditor', { part, q: sp.q });
  if (!data) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        title={data.act.act_name}
        description={data.act.subtitle ?? undefined}
        breadcrumbs={[{ label: 'Dashboard', href: '/auditor/dashboard' }, { label: 'Act & Compliance', href: '/auditor/act-compliance' }, { label: data.act.short_name ?? data.act.act_name }]}
      />
      <ActReader data={data} basePath={`/auditor/act-compliance/library/${id}`} view={sp.view === 'arrangement' ? 'arrangement' : 'part'} />
    </div>
  );
}
