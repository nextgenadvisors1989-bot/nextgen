'use client';

import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/dates';
import { ComplianceActivity, ComplianceBadge, DetailRow, Prose } from '@/components/compliance/shared';

export function RegulationDetail({ regulation, canUpdate }: {
  regulation: Record<string, unknown> & {
    id: number; act_id: number | null; act_name?: string | null; act_short_name?: string | null;
    rule_id: number | null; rule_number?: string | null; rule_title?: string | null;
    regulation_name: string; regulation_number: string | null; issuing_authority: string | null;
    issue_date: string | null; effective_date: string | null; scope: string | null; obligations: string | null;
    reporting_authority: string | null; reporting_frequency: string | null; penalty_provision: string | null;
    status: string; created_at: string; updated_at: string;
  };
  canUpdate: boolean;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{regulation.regulation_name}</h1>
              <ComplianceBadge value={regulation.status} />
              {regulation.reporting_frequency && <Badge tone="info">Reports {regulation.reporting_frequency}</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {[
                regulation.regulation_number,
                regulation.issuing_authority,
                regulation.act_name ? `under ${regulation.act_name}` : null,
              ].filter(Boolean).join(' · ') || 'No reference details recorded'}
            </p>
          </div>
          {canUpdate && <LinkButton href={`/admin/compliance/regulations/${regulation.id}/edit`} size="sm">Edit Instrument</LinkButton>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Scope" />
            <Prose>{regulation.scope}</Prose>
          </Card>
          <Card>
            <CardHeader title="Obligations imposed" />
            <Prose>{regulation.obligations}</Prose>
          </Card>
          <Card>
            <CardHeader title="Penalty provision" />
            <Prose>{regulation.penalty_provision}</Prose>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Instrument details" />
            <dl className="divide-y divide-line">
              <DetailRow label="Number">{regulation.regulation_number}</DetailRow>
              <DetailRow label="Issued by">{regulation.issuing_authority}</DetailRow>
              <DetailRow label="Issued on">{regulation.issue_date ? formatDate(regulation.issue_date) : null}</DetailRow>
              <DetailRow label="In force from">{regulation.effective_date ? formatDate(regulation.effective_date) : null}</DetailRow>
              <DetailRow label="Parent act">
                {regulation.act_id
                  ? <Link href={`/admin/compliance/acts/${regulation.act_id}`} className="text-brand-600 hover:underline">{regulation.act_name}</Link>
                  : null}
              </DetailRow>
              <DetailRow label="Obligation">
                {regulation.rule_id
                  ? <Link href={`/admin/compliance/rules/${regulation.rule_id}`} className="text-brand-600 hover:underline">
                    {regulation.rule_title ?? regulation.rule_number}
                  </Link>
                  : null}
              </DetailRow>
              <DetailRow label="Reporting authority">{regulation.reporting_authority}</DetailRow>
              <DetailRow label="Reporting frequency">{regulation.reporting_frequency}</DetailRow>
              <DetailRow label="Added">{formatDate(regulation.created_at)}</DetailRow>
            </dl>
          </Card>
          <Card>
            <ComplianceActivity entityType="compliance_regulation" entityId={regulation.id} title="Instrument history" />
          </Card>
        </div>
      </div>
    </div>
  );
}
