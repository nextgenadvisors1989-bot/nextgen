'use client';

/**
 * Backup settings.
 *
 * The configuration form, a "run a backup now" panel that really shells out to
 * `mysqldump`, the run history with its file sizes and durations, and the disk
 * footprint of the vault and the backup directory. Deleting a record deletes the
 * dump file too — which is why it asks first, and says so.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { formatNumber } from '@/lib/utils/formatting';
import { SettingsForm, type ResolvedValue, type SettingSection } from '@/components/settings/settings-form';

interface BackupRow {
  id: number;
  backup_name: string;
  backup_type: string;
  file_path: string | null;
  file_size_bytes: number | null;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  triggered_by: string;
  created_by_name: string | null;
}

interface StorageMeasure {
  path: string;
  exists: boolean;
  files: number;
  bytes: number;
}

interface DiskFile {
  name: string;
  path: string;
  directory: boolean;
  bytes: number | null;
  modifiedAt: string;
}

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning'> = {
  completed: 'success',
  failed: 'danger',
  running: 'warning',
};

function humanBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function BackupSettings({
  sections,
  initial,
  canEdit,
  storage,
  files,
}: {
  sections: SettingSection[];
  initial: Record<string, ResolvedValue>;
  canEdit: boolean;
  storage: { vault: StorageMeasure; backups: StorageMeasure };
  files: DiskFile[];
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<BackupRow>({
    endpoint: '/api/admin/settings/backups',
    initialFilters: { status: 'all', triggered_by: 'all' },
    initialSortBy: 'started_at',
    initialSortDir: 'desc',
  });

  const [runOpen, setRunOpen] = useState(false);
  const [runType, setRunType] = useState<'full' | 'schema' | 'data'>('full');
  const [runNote, setRunNote] = useState('');
  const [running, setRunning] = useState(false);
  const [detail, setDetail] = useState<{ row: BackupRow; tables?: string[]; fileExists?: boolean; sizeOnDisk?: number | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BackupRow | null>(null);
  const [copying, setCopying] = useState(false);

  const stats = list.extra.stats as { total: number; completed: number; failed: number; bytes: number; lastSuccess: string | null } | undefined;
  const tableCount = Number(list.extra.tableCount ?? 0);

  async function runBackup() {
    setRunning(true);
    try {
      const result = await api.post<{ name: string; sizeBytes: number; tables: number; pruned: number }>(
        '/api/admin/settings/backups/run',
        { type: runType, ...(runNote ? { note: runNote } : {}) }
      );
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setRunOpen(false);
      setRunNote('');
      list.refresh();
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  async function openDetail(row: BackupRow) {
    const result = await api.get<BackupRow & { tables: string[]; fileExists: boolean; sizeOnDisk: number | null }>(
      `/api/admin/settings/backups/${row.id}`
    );
    if (!result.ok) {
      errorToast(result.message);
      return;
    }
    setDetail({ row, ...(result.data as object) } as { row: BackupRow; tables?: string[]; fileExists?: boolean; sizeOnDisk?: number | null });
  }

  async function deleteBackup() {
    if (!pendingDelete) return;
    setRunning(true);
    try {
      const result = await api.delete(`/api/admin/settings/backups/${pendingDelete.id}`);
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setPendingDelete(null);
      list.refresh();
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  async function copyUploads() {
    setCopying(true);
    try {
      const result = await api.post<{ copied: number; bytes: number; destination: string }>(
        '/api/admin/settings/backups/uploads'
      );
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      router.refresh();
    } finally {
      setCopying(false);
    }
  }

  const columns: Column<BackupRow>[] = [
    {
      key: 'backup_name',
      header: 'Backup',
      render: (row) => (
        <div>
          <button type="button" className="text-sm font-medium text-ink hover:text-brand-600" onClick={() => openDetail(row)}>
            {row.backup_name}
          </button>
          <p className="text-[11px] text-ink-muted">{row.file_path ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[row.status] ?? 'slate'} dot>{row.status}</Badge>
          {row.error_message && <span className="text-[11px] text-red-600">see detail</span>}
        </div>
      ),
    },
    {
      key: 'backup_type',
      header: 'Type',
      hideOnMobile: true,
      render: (row) => <span className="text-[13px] text-ink-soft">{row.backup_type}</span>,
    },
    {
      key: 'file_size_bytes',
      header: 'Size',
      align: 'right',
      render: (row) => <span className="text-[13px] text-ink-soft">{humanBytes(row.file_size_bytes)}</span>,
    },
    {
      key: 'duration_seconds',
      header: 'Duration',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-[13px] text-ink-muted">
          {row.duration_seconds === null ? '—' : `${row.duration_seconds}s`}
        </span>
      ),
    },
    {
      key: 'started_at',
      header: 'Started',
      hideOnMobile: true,
      render: (row) => (
        <div>
          <p className="text-[13px] text-ink-soft">{formatDateTime(row.started_at)}</p>
          <p className="text-[11px] text-ink-muted">
            {row.triggered_by}{row.created_by_name ? ` · ${row.created_by_name}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <button type="button" className="btn-icon" title="Open run detail" onClick={() => openDetail(row)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {canEdit && row.status !== 'running' && (
            <button
              type="button"
              className="btn-icon btn-icon-danger"
              title="Delete record and dump file"
              onClick={() => setPendingDelete(row)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
  ];

  const sidebar = (
    <>
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Run a backup now</h3>
            <p className="mt-1 text-[12px] text-ink-muted">
              Writes a real <span className="font-mono">mysqldump</span> into the configured directory, records the run
              and prunes dumps past the retention window.
            </p>
          </div>
          <Button onClick={() => setRunOpen(true)} disabled={!canEdit} fullWidth>
            Back up the database
          </Button>
          <Button onClick={copyUploads} loading={copying} disabled={!canEdit} fullWidth variant="outline">
            Copy uploaded files
          </Button>
          <dl className="space-y-2 text-[12px] text-ink-muted">
            <div className="flex justify-between gap-3">
              <dt>Vault</dt>
              <dd className="text-right text-ink">{storage.vault.files} file(s) · {humanBytes(storage.vault.bytes)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Backup directory</dt>
              <dd className="text-right text-ink">{storage.backups.files} file(s) · {humanBytes(storage.backups.bytes)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Tables in the database</dt>
              <dd className="text-ink">{formatNumber(tableCount)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-ink">On disk</h3>
          <p className="text-[12px] text-ink-muted">
            {storage.backups.exists ? storage.backups.path : 'The backup directory does not exist yet — it is created on the first run.'}
          </p>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {files.map((file) => (
              <div key={file.path} className="flex items-center justify-between gap-3 rounded-md border border-line px-2.5 py-1.5">
                <span className="truncate font-mono text-[11px] text-ink-soft">{file.name}</span>
                <span className="shrink-0 text-[11px] text-ink-muted">
                  {file.directory ? 'folder' : humanBytes(file.bytes)}
                </span>
              </div>
            ))}
            {!files.length && <p className="text-[12px] text-ink-muted">Nothing on disk yet.</p>}
          </div>
        </CardBody>
      </Card>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Backups recorded" value={formatNumber(stats?.total ?? 0)} tone="brand" />
        <StatCard label="Completed" value={formatNumber(stats?.completed ?? 0)} tone="emerald" hint={stats?.lastSuccess ? `Latest ${formatDateTime(stats.lastSuccess)}` : 'None yet'} />
        <StatCard label="Failed" value={formatNumber(stats?.failed ?? 0)} tone="red" />
        <StatCard label="Stored bytes" value={humanBytes(stats?.bytes ?? 0)} tone="slate" hint={`${storage.backups.files} file(s) on disk`} />
      </div>

      <SettingsForm
        group="backup"
        label="Backup"
        sections={sections}
        initial={initial}
        canEdit={canEdit}
        note="The schedule is honoured by the platform's backup job when the deployment's cron entry runs it; a manual run works regardless."
        sidebar={sidebar}
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Backup history</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              Every run with its file, size and outcome. A failed run keeps the database's own error text so the cause
              is diagnosable from here.
            </p>
          </div>
          <Select
            value={list.filters.status}
            onChange={(value) => list.setFilter('status', value)}
            options={[
              { value: 'all', label: 'Every status' },
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
              { value: 'running', label: 'Running' },
            ]}
            size="sm"
          />
        </div>

        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No backups have run yet"
          emptySubtitle="Run one now, or point the deployment's cron at npm run backup:db."
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      <Modal
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title="Run a database backup"
        description="The dump is written into the configured backup directory and recorded in the history below."
        footer={
          <>
            <Button variant="outline" onClick={() => setRunOpen(false)}>Cancel</Button>
            <Button onClick={runBackup} loading={running}>Run backup</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="What to include" value={runType}
            onChange={(value) => setRunType(value as 'full' | 'schema' | 'data')}
            options={[
              { value: 'full', label: 'Full — schema and every row' },
              { value: 'schema', label: 'Schema only — table structures, no rows' },
              { value: 'data', label: 'Data only — rows for an existing schema' },
            ]}
          />
          <Input
            label="Note (optional)" value={runNote} maxLength={200}
            placeholder="e.g. before the October payroll run"
            onChange={(event) => setRunNote(event.target.value)}
          />
          <p className="text-[12px] text-ink-muted">
            A full dump of this database takes a few seconds. The screen stays usable; the run appears in the history
            as soon as it starts.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.row.backup_name ?? 'Backup'}
        size="lg"
        footer={<Button variant="outline" onClick={() => setDetail(null)}>Close</Button>}
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['Status', detail.row.status],
                ['Type', detail.row.backup_type],
                ['Triggered by', `${detail.row.triggered_by}${detail.row.created_by_name ? ` · ${detail.row.created_by_name}` : ''}`],
                ['Started', formatDateTime(detail.row.started_at)],
                ['Completed', detail.row.completed_at ? formatDateTime(detail.row.completed_at) : '—'],
                ['Duration', detail.row.duration_seconds === null ? '—' : `${detail.row.duration_seconds} second(s)`],
                ['Recorded size', humanBytes(detail.row.file_size_bytes)],
                ['Size on disk', detail.fileExists ? humanBytes(detail.sizeOnDisk) : 'dump file missing'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</dt>
                  <dd className="mt-0.5 text-[13px] text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="text-[12px] uppercase tracking-wide text-ink-muted">File</p>
              <p className="mt-1 break-all font-mono text-[12px] text-ink-soft">{detail.row.file_path ?? '—'}</p>
            </div>

            {detail.row.error_message && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-[12px] uppercase tracking-wide text-red-700">Failure</p>
                <p className="mt-1 text-[13px] text-red-700">{detail.row.error_message}</p>
              </div>
            )}

            {detail.tables && detail.tables.length > 0 && (
              <div>
                <p className="text-[12px] uppercase tracking-wide text-ink-muted">
                  Tables in the dump ({detail.tables.length})
                </p>
                <div className="mt-2 flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
                  {detail.tables.map((table) => (
                    <span key={table} className="rounded-md bg-surface-muted px-2 py-0.5 font-mono text-[11px] text-ink-soft">
                      {table}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={deleteBackup}
        title="Delete this backup?"
        message={`${pendingDelete?.backup_name ?? 'The record'} and its dump file will be removed from disk. This cannot be undone — restore points are gone with it.`}
        confirmLabel="Delete backup"
        loading={running}
      />
    </div>
  );
}
