import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { PageHeader } from '@/components/ui/breadcrumb';
import { ActReader } from '@/components/acts/act-reader';
import { readAct } from '@/services/act-reader.service';

export const metadata: Metadata = { title: 'Read the Act' };
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ actId: string }>; searchParams: Promise<{ part?: string; q?: string; view?: string }> };

/** The Act as an auditor reads it (an administrator checks the text here before the Act is shown to the public). */
export default async function AdminActReadPage({ params, searchParams }: Props) {
  await requirePageUser();
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
        breadcrumbs={[{ label: 'Compliance', href: '/admin/compliance/acts' }, { label: data.act.short_name ?? data.act.act_name, href: `/admin/compliance/acts/${id}` }, { label: 'Read' }]}
      />
      <ActReader data={data} basePath={`/admin/compliance/acts/${id}/read`} view={sp.view === 'arrangement' ? 'arrangement' : 'part'} />
    </div>
  );
}
