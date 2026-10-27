import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getRegulationDetail } from '@/services/compliance.service';
import { RegulationForm, type RegulationFormValues } from '@/components/compliance/regulation-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit Compliance Instrument' };

export default async function EditRegulationPage({ params }: { params: Promise<{ regulationId: string }> }) {
  const { regulationId } = await params;
  const id = Number(regulationId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  await requirePageUser();
  let data;
  try {
    data = await getRegulationDetail(id);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    throw error;
  }

  const row = data.regulation as Record<string, unknown>;
  const date = (value: unknown) => (value ? String(value).slice(0, 10) : '');
  const initial: RegulationFormValues = {
    id,
    act_id: row.act_id ? String(row.act_id) : '',
    rule_id: row.rule_id ? String(row.rule_id) : '',
    regulation_name: String(row.regulation_name ?? ''),
    regulation_number: String(row.regulation_number ?? ''),
    issuing_authority: String(row.issuing_authority ?? ''),
    issue_date: date(row.issue_date),
    effective_date: date(row.effective_date),
    scope: String(row.scope ?? ''),
    obligations: String(row.obligations ?? ''),
    reporting_authority: String(row.reporting_authority ?? ''),
    reporting_frequency: String(row.reporting_frequency ?? ''),
    penalty_provision: String(row.penalty_provision ?? ''),
    status: String(row.status ?? 'active'),
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Edit {initial.regulation_name}</h1>
        <p className="mt-1 text-sm text-ink-muted">Changes are recorded in the instrument&apos;s activity history.</p>
      </header>
      <RegulationForm mode="edit" initial={initial} />
    </div>
  );
}
