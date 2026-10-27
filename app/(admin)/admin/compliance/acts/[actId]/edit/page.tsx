import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getActDetail } from '@/services/compliance.service';
import { ActForm, type ActFormValues } from '@/components/compliance/act-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit Compliance Act' };

export default async function EditActPage({ params }: { params: Promise<{ actId: string }> }) {
  const { actId } = await params;
  const id = Number(actId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  await requirePageUser();
  let detail;
  try {
    detail = await getActDetail(id);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    throw error;
  }

  const act = detail.act as Record<string, unknown>;
  const initial: ActFormValues = {
    id,
    act_name: String(act.act_name ?? ''),
    short_name: String(act.short_name ?? ''),
    act_number: String(act.act_number ?? ''),
    act_year: act.act_year ? String(act.act_year) : '',
    jurisdiction: String(act.jurisdiction ?? 'Central'),
    state_name: String(act.state_name ?? ''),
    ministry: String(act.ministry ?? ''),
    department: String(act.department ?? ''),
    enactment_date: act.enactment_date ? String(act.enactment_date).slice(0, 10) : '',
    effective_date: act.effective_date ? String(act.effective_date).slice(0, 10) : '',
    last_amended_date: act.last_amended_date ? String(act.last_amended_date).slice(0, 10) : '',
    applicability_criteria: String(act.applicability_criteria ?? ''),
    industry_applicability: String(act.industry_applicability ?? ''),
    employee_threshold: String(act.employee_threshold ?? ''),
    summary: String(act.summary ?? ''),
    official_source_url: String(act.official_source_url ?? ''),
    status: String(act.status ?? 'active'),
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Edit {initial.act_name}</h1>
        <p className="mt-1 text-sm text-ink-muted">Changes are recorded in the act&apos;s activity history.</p>
      </header>
      <ActForm mode="edit" initial={initial} />
    </div>
  );
}
