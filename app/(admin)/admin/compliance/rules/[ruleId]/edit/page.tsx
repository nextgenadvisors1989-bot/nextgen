import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/permission-check';
import { getRuleDetail } from '@/services/compliance.service';
import { RuleForm, type RuleFormValues } from '@/components/compliance/rule-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit Compliance Obligation' };

export default async function EditRulePage({ params }: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await params;
  const id = Number(ruleId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  await requirePageUser();
  let data;
  try {
    data = await getRuleDetail(id);
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
    throw error;
  }

  const rule = data.rule as Record<string, unknown>;
  const initial: RuleFormValues = {
    id,
    act_id: String(rule.act_id ?? ''),
    rule_number: String(rule.rule_number ?? ''),
    rule_title: String(rule.rule_title ?? ''),
    rule_text: String(rule.rule_text ?? ''),
    compliance_type: String(rule.compliance_type ?? 'Mandatory'),
    frequency: String(rule.frequency ?? ''),
    due_day_of_month: rule.due_day_of_month ? String(rule.due_day_of_month) : '',
    responsible_role: String(rule.responsible_role ?? ''),
    penalty_details: String(rule.penalty_details ?? ''),
    evidence_required: String(rule.evidence_required ?? ''),
    applicability: String(rule.applicability ?? ''),
    status: String(rule.status ?? 'active'),
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Edit {initial.rule_title}</h1>
        <p className="mt-1 text-sm text-ink-muted">Changes are recorded in the obligation&apos;s activity history.</p>
      </header>
      <RuleForm mode="edit" initial={initial} />
    </div>
  );
}
