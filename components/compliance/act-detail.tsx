'use client';

import Link from 'next/link';
import { Card, CardHeader } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/table';
import { LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';
import { ActProvisions } from '@/components/compliance/act-provisions';
import { ComplianceActivity, ComplianceBadge, DetailRow, Prose } from '@/components/compliance/shared';

interface ActDetailPayload {
  act: Record<string, unknown> & {
    id: number; act_name: string; short_name: string | null; act_number: string | null; act_year: number | null;
    jurisdiction: string; state_name: string | null; ministry: string | null; department: string | null;
    enactment_date: string | null; effective_date: string | null; last_amended_date: string | null;
    applicability_criteria: string | null; industry_applicability: string | null; employee_threshold: string | null;
    summary: string | null; official_source_url: string | null; status: string;
    created_at: string; updated_at: string;
  };
  rules: Record<string, unknown>[];
  regulations: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  counts: { rules: number; regulations: number; notifications: number; documents: number };
}

export function ActDetail({ data, canUpdate, canCreate }: {
  data: ActDetailPayload; canUpdate: boolean; canCreate: boolean;
}) {
  const { act } = data;
  const label = (value: unknown) => String(value ?? '');

  const ruleColumns: Column<Record<string, unknown>>[] = [
    {
      key: 'rule',
      header: 'Obligation',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/compliance/rules/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {label(row.rule_title)}
          </Link>
          <span className="block text-xs text-ink-muted">{label(row.rule_number) || '—'}</span>
        </div>
      ),
    },
    { key: 'type', header: 'Type', hideOnMobile: true, render: (row) => <Badge tone={row.compliance_type === 'Mandatory' ? 'warning' : 'default'}>{label(row.compliance_type)}</Badge> },
    {
      key: 'frequency', header: 'Frequency', hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {label(row.frequency) || 'Ad hoc'}
          {row.due_day_of_month ? <span className="block text-xs text-ink-muted">day {label(row.due_day_of_month)}</span> : null}
        </span>
      ),
    },
    { key: 'owner', header: 'Responsible', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{label(row.responsible_role) || '—'}</span> },
    { key: 'status', header: 'Status', render: (row) => <ComplianceBadge value={label(row.status)} /> },
  ];

  const regulationColumns: Column<Record<string, unknown>>[] = [
    {
      key: 'name',
      header: 'Instrument',
      render: (row) => (
        <Link href={`/admin/compliance/regulations/${row.id}`} className="font-medium text-brand-600 hover:underline">
          {label(row.regulation_name)}
        </Link>
      ),
    },
    { key: 'number', header: 'Number', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{label(row.regulation_number) || '—'}</span> },
    { key: 'authority', header: 'Issued by', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{label(row.issuing_authority) || '—'}</span> },
    { key: 'effective', header: 'In force from', render: (row) => <span className="text-ink-soft">{row.effective_date ? formatDate(String(row.effective_date)) : '—'}</span> },
    { key: 'status', header: 'Status', render: (row) => <ComplianceBadge value={label(row.status)} /> },
  ];

  const notificationColumns: Column<Record<string, unknown>>[] = [
    {
      key: 'number',
      header: 'Notification',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/compliance/notifications/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {label(row.notification_number)}
          </Link>
          <span className="block text-xs text-ink-muted">{label(row.gazette_reference) || '—'}</span>
        </div>
      ),
    },
    { key: 'title', header: 'Title', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{label(row.title)}</span> },
    { key: 'dated', header: 'Dated', render: (row) => <span className="text-ink-soft">{row.notification_date ? formatDate(String(row.notification_date)) : '—'}</span> },
    { key: 'effective', header: 'Effective', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{row.effective_date ? formatDate(String(row.effective_date)) : '—'}</span> },
    { key: 'status', header: 'Status', render: (row) => <ComplianceBadge value={label(row.status)} /> },
  ];

  const documentColumns: Column<Record<string, unknown>>[] = [
    {
      key: 'document',
      header: 'Document',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/compliance/documents/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {label(row.document_name)}
          </Link>
          <span className="block text-xs text-ink-muted">{label(row.company_name)}</span>
        </div>
      ),
    },
    { key: 'type', header: 'Type', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{label(row.document_type)}</span> },
    { key: 'expiry', header: 'Expiry', render: (row) => <span className="text-ink-soft">{row.expiry_date ? formatDate(String(row.expiry_date)) : '—'}</span> },
    { key: 'status', header: 'Status', render: (row) => <ComplianceBadge value={label(row.effective_status ?? row.compliance_status)} /> },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{act.act_name}</h1>
              <ComplianceBadge value={act.status} />
              <Badge tone={act.jurisdiction === 'Central' ? 'info' : 'default'}>
                {act.jurisdiction}{act.state_name ? ` — ${act.state_name}` : ''}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {[act.short_name, act.act_number, act.act_year ? `Enacted ${act.act_year}` : null].filter(Boolean).join(' · ') || 'No reference number recorded'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canCreate && <LinkButton href={`/admin/compliance/rules/create?act_id=${act.id}`} variant="outline" size="sm">Add Obligation</LinkButton>}
            {canUpdate && <LinkButton href={`/admin/compliance/acts/${act.id}/edit`} size="sm">Edit Act</LinkButton>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Obligations', value: data.counts.rules },
          { label: 'Instruments', value: data.counts.regulations },
          { label: 'Gazette notifications', value: data.counts.notifications },
          { label: 'Employer documents', value: data.counts.documents },
        ].map((stat) => (
          <Card key={stat.label} className="text-center">
            <p className="text-2xl font-bold text-ink">{formatNumber(stat.value)}</p>
            <p className="text-[13px] text-ink-muted">{stat.label}</p>
          </Card>
        ))}
      </div>

      <Card padded={false}>
        <Tabs
          defaultTab="overview"
          items={[
            {
              key: 'overview',
              label: 'Overview',
              content: (
                <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-4">
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-ink">Summary</h3>
                      <Prose>{act.summary}</Prose>
                    </div>
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-ink">Who it applies to</h3>
                      <Prose>{act.applicability_criteria}</Prose>
                    </div>
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-ink">Bilingual / industry note</h3>
                      <Prose>{act.industry_applicability}</Prose>
                    </div>
                  </div>
                  <div>
                    <dl className="divide-y divide-line rounded-lg border border-line px-4">
                      <DetailRow label="Ministry">{act.ministry}</DetailRow>
                      <DetailRow label="Department">{act.department}</DetailRow>
                      <DetailRow label="Employee threshold">{act.employee_threshold}</DetailRow>
                      <DetailRow label="Enacted on">{act.enactment_date ? formatDate(act.enactment_date) : null}</DetailRow>
                      <DetailRow label="In force from">{act.effective_date ? formatDate(act.effective_date) : null}</DetailRow>
                      <DetailRow label="Last amended">{act.last_amended_date ? formatDate(act.last_amended_date) : null}</DetailRow>
                      <DetailRow label="Official source">
                        {act.official_source_url
                          ? <a href={act.official_source_url} target="_blank" rel="noreferrer noopener" className="text-brand-600 hover:underline">Open the official text</a>
                          : null}
                      </DetailRow>
                      <DetailRow label="Added">{formatDate(act.created_at)}</DetailRow>
                      <DetailRow label="Last updated">{formatDate(act.updated_at)}</DetailRow>
                    </dl>
                  </div>
                </div>
              ),
            },
            {
              key: 'provisions',
              label: 'Chapters & sections',
              content: <ActProvisions actId={act.id} canEdit={canUpdate} />,
            },
            {
              key: 'rules',
              label: 'Obligations',
              badge: <Badge tone="default">{data.counts.rules}</Badge>,
              content: (
                <DataTable
                  columns={ruleColumns}
                  data={data.rules}
                  rowKey={(row) => Number(row.id)}
                  emptyTitle="No obligations recorded under this act"
                  emptySubtitle="Add the duties an auditor will check, with their frequency and evidence."
                  emptyAction={canCreate ? <LinkButton href={`/admin/compliance/rules/create?act_id=${act.id}`} size="sm">Add Obligation</LinkButton> : undefined}
                />
              ),
            },
            {
              key: 'regulations',
              label: 'Instruments',
              badge: <Badge tone="default">{data.counts.regulations}</Badge>,
              content: (
                <DataTable
                  columns={regulationColumns}
                  data={data.regulations}
                  rowKey={(row) => Number(row.id)}
                  emptyTitle="No instruments recorded under this act"
                  emptySubtitle="Rules, schemes and orders issued under the act appear here."
                />
              ),
            },
            {
              key: 'notifications',
              label: 'Gazette',
              badge: <Badge tone="default">{data.counts.notifications}</Badge>,
              content: (
                <DataTable
                  columns={notificationColumns}
                  data={data.notifications}
                  rowKey={(row) => Number(row.id)}
                  emptyTitle="No gazette notifications for this act"
                  emptySubtitle="Register notifications that change what employers must do."
                />
              ),
            },
            {
              key: 'documents',
              label: 'Employer documents',
              badge: <Badge tone="default">{data.counts.documents}</Badge>,
              content: (
                <DataTable
                  columns={documentColumns}
                  data={data.documents}
                  rowKey={(row) => Number(row.id)}
                  emptyTitle="No employer documents linked to this act"
                  emptySubtitle="Documents recorded against this act appear here with their expiry status."
                />
              ),
            },
            {
              key: 'activity',
              label: 'Activity',
              content: (
                <div className="p-5">
                  <ComplianceActivity entityType="compliance_act" entityId={act.id} title="Act history" />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
