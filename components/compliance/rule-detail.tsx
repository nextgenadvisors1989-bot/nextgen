'use client';

import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/dates';
import { ComplianceActivity, ComplianceBadge, DetailRow, Prose } from '@/components/compliance/shared';

interface RuleDetailProps {
  rule: Record<string, unknown> & {
    id: number; act_id: number; act_name: string; act_short_name?: string | null; jurisdiction?: string;
    rule_number: string | null; rule_title: string; rule_text: string | null; compliance_type: string;
    frequency: string | null; due_day_of_month: number | null; responsible_role: string | null;
    penalty_details: string | null; evidence_required: string | null; applicability: string | null;
    status: string; regulation_count?: number; created_at: string; updated_at: string;
  };
  regulations: Record<string, unknown>[];
  canUpdate: boolean;
}

export function RuleDetail({ rule, regulations, canUpdate }: RuleDetailProps) {
  const label = (value: unknown) => String(value ?? '');

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{rule.rule_title}</h1>
              <ComplianceBadge value={rule.status} />
              <Badge tone={rule.compliance_type === 'Mandatory' ? 'warning' : 'default'}>{rule.compliance_type}</Badge>
              {rule.frequency && <Badge tone="info">{rule.frequency}</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              <Link href={`/admin/compliance/acts/${rule.act_id}`} className="text-brand-600 hover:underline">
                {rule.act_name}
              </Link>
              {rule.rule_number ? ` · ${rule.rule_number}` : ''}
              {rule.due_day_of_month ? ` · falls due on day ${rule.due_day_of_month} of the month` : ''}
            </p>
          </div>
          {canUpdate && <LinkButton href={`/admin/compliance/rules/${rule.id}/edit`} size="sm">Edit Obligation</LinkButton>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="What must be done" />
            <Prose>{rule.rule_text}</Prose>
          </Card>
          <Card>
            <CardHeader title="Evidence the auditor will ask for" description="Kept with the establishment's compliance file." />
            <Prose>{rule.evidence_required}</Prose>
          </Card>
          <Card>
            <CardHeader title="Penalty for non-compliance" />
            <Prose>{rule.penalty_details}</Prose>
          </Card>
          {regulations.length > 0 && (
            <Card>
              <CardHeader title="Instruments giving effect to this obligation" />
              <ul className="divide-y divide-line">
                {regulations.map((row) => (
                  <li key={String(row.id)} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <Link href={`/admin/compliance/regulations/${row.id}`} className="font-medium text-brand-600 hover:underline">
                        {label(row.regulation_name)}
                      </Link>
                      <span className="block text-xs text-ink-muted">
                        {[label(row.regulation_number) || null, label(row.issuing_authority) || null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ComplianceBadge value={label(row.status)} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Obligation details" />
            <dl className="divide-y divide-line">
              <DetailRow label="Responsible role">{rule.responsible_role}</DetailRow>
              <DetailRow label="Frequency">{rule.frequency ?? 'Ad hoc'}</DetailRow>
              <DetailRow label="Due day">{rule.due_day_of_month ? `Day ${rule.due_day_of_month}` : null}</DetailRow>
              <DetailRow label="Act">
                <Link href={`/admin/compliance/acts/${rule.act_id}`} className="text-brand-600 hover:underline">
                  {rule.act_short_name ?? rule.act_name}
                </Link>
              </DetailRow>
              <DetailRow label="Applicability">{rule.applicability}</DetailRow>
              <DetailRow label="Instruments">{String(rule.regulation_count ?? regulations.length)}</DetailRow>
              <DetailRow label="Added">{formatDate(rule.created_at)}</DetailRow>
              <DetailRow label="Last updated">{formatDate(rule.updated_at)}</DetailRow>
            </dl>
          </Card>
          <Card>
            <ComplianceActivity entityType="compliance_rule" entityId={rule.id} title="Obligation history" />
          </Card>
        </div>
      </div>
    </div>
  );
}
