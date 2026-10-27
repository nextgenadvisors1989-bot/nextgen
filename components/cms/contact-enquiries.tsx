'use client';

/**
 * Admin > Contact Enquiries — the inbox behind the public contact form.
 * The list filters by status and type; the detail card records the response.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { DataTable, DetailRow, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';

const STATUSES = ['New', 'In Progress', 'Responded', 'Closed', 'Spam'];
const TYPES = ['General', 'Demo Request', 'Sales', 'Support', 'Partnership', 'Careers'];
const STATUS_TONE: Record<string, BadgeTone> = {
  New: 'brand', 'In Progress': 'warning', Responded: 'success', Closed: 'slate', Spam: 'danger',
};

interface EnquiryRow {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  company_name: string | null;
  subject: string | null;
  enquiry_type: string;
  status: string;
  created_at: string;
  assigned_name?: string | null;
}

export function ContactEnquiriesTable() {
  const router = useRouter();
  const list = useList<EnquiryRow>({
    endpoint: '/api/admin/contact-enquiries',
    initialFilters: { search: '', status: 'all', enquiry_type: 'all' },
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
  });
  const stats = (list.extra.stats as Record<string, number> | undefined) ?? {};

  const columns: Column<EnquiryRow>[] = [
    {
      key: 'from',
      header: 'From',
      render: (row) => (
        <span>
          <span className="block font-medium text-ink">{row.name}</span>
          <span className="block text-xs text-ink-muted">{row.company_name ? `${row.company_name} · ` : ''}{row.email}</span>
        </span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => <span className="text-ink-soft">{truncate(row.subject ?? '—', 60)}</span>,
    },
    { key: 'type', header: 'Type', hideOnMobile: true, render: (row) => <Badge tone="info">{row.enquiry_type}</Badge> },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={STATUS_TONE[row.status] ?? 'default'} dot>{row.status}</Badge> },
    { key: 'when', header: 'Received', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{formatDateTime(row.created_at)}</span> },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: (row) => <Link href={`/admin/contact-enquiries/${row.id}`} className="link text-sm">Open</Link>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Enquiries" value={formatNumber(stats.total ?? 0)} hint="Everything received" tone="brand" />
        <StatCard label="New" value={formatNumber(stats.New ?? 0)} hint="Waiting for a first response" tone="amber" />
        <StatCard label="In progress" value={formatNumber(stats['In Progress'] ?? 0)} hint="Being handled" tone="violet" />
        <StatCard label="Responded" value={formatNumber((stats.Responded ?? 0) + (stats.Closed ?? 0))} hint="Answered or closed" tone="emerald" />
      </div>

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search name, email, company, subject or message…' },
            { key: 'status', type: 'select', label: 'Status', options: [{ value: 'all', label: 'Any status' }, ...STATUSES.map((value) => ({ value, label: value }))] },
            { key: 'enquiry_type', type: 'select', label: 'Type', options: [{ value: 'all', label: 'Any type' }, ...TYPES.map((value) => ({ value, label: value }))] },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
        />
        <DataTable<EnquiryRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/admin/contact-enquiries/${row.id}`)}
          emptyTitle="No enquiries yet"
          emptySubtitle="Messages sent from the public Contact page land here."
        />
        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>
      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}
    </div>
  );
}

export interface EnquiryDetailData extends EnquiryRow {
  message: string;
  source_page: string | null;
  response: string | null;
  responded_at: string | null;
  ip_address: string | null;
}

export function ContactEnquiryDetail({ enquiry, canEdit }: { enquiry: EnquiryDetailData; canEdit: boolean }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [status, setStatus] = useState(enquiry.status);
  const [response, setResponse] = useState(enquiry.response ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await api.put(`/api/admin/contact-enquiries/${enquiry.id}`, { status, response });
    setSaving(false);
    if (!result.ok) return errorToast(result.message);
    success('Enquiry updated');
    router.refresh();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title={enquiry.subject ?? 'Enquiry'} description={`Received ${formatDateTime(enquiry.created_at)}`} />
        <CardBody>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{enquiry.message}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sender" />
        <CardBody>
          <DetailRow label="Name" value={enquiry.name} />
          <DetailRow label="Email" value={<a className="link break-all" href={`mailto:${enquiry.email}`}>{enquiry.email}</a>} />
          <DetailRow label="Mobile" value={enquiry.mobile ?? '—'} />
          <DetailRow label="Company" value={enquiry.company_name ?? '—'} />
          <DetailRow label="Type" value={<Badge tone="info">{enquiry.enquiry_type}</Badge>} />
          <DetailRow label="From page" value={enquiry.source_page ?? '—'} />
        </CardBody>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader title="Handling" description={enquiry.responded_at ? `Responded ${formatDateTime(enquiry.responded_at)}` : 'Not responded yet'} />
        <CardBody>
          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label="Status"
              value={status}
              onChange={setStatus}
              options={STATUSES.map((value) => ({ value, label: value }))}
              disabled={!canEdit}
            />
            <div className="md:col-span-2">
              <Textarea
                label="Response / internal note"
                rows={4}
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                disabled={!canEdit}
                helper="Recorded against the enquiry. Reply to the sender by email from your own mailbox, then note it here."
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canEdit && <Button onClick={save} loading={saving}>Save changes</Button>}
            <LinkButton href="/admin/contact-enquiries" variant="outline">Back to enquiries</LinkButton>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
