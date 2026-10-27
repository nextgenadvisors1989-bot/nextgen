'use client';

/**
 * Scheduled jobs.
 *
 * The platform ships four jobs — compliance reminders, audit reminders, the
 * activity-log retention cleanup and the database backup. The operator's cron
 * (or systemd timer) owns the timing; this panel is where an administrator sees
 * the state, pauses a job and runs the reminder jobs on demand, which is what
 * makes "did the reminders go out?" answerable without shell access.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';

export interface ScheduledJob {
  id: number;
  code: string;
  name: string;
  description: string | null;
  cron: string | null;
  type: string;
  active: boolean;
  lastRunAt: string | null;
  lastStatus: string;
  lastMessage: string | null;
  nextRunAt: string | null;
}

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'slate'> = {
  success: 'success',
  failed: 'danger',
  running: 'warning',
  never: 'slate',
};

export function JobsPanel({
  jobs,
  typeLabels,
  canEdit,
}: {
  jobs: ScheduledJob[];
  typeLabels: Record<string, string>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingRun, setPendingRun] = useState<ScheduledJob | null>(null);

  async function toggle(job: ScheduledJob, active: boolean) {
    setBusy(job.code);
    try {
      const result = await api.patch(`/api/admin/settings/jobs/${job.code}`, { is_active: active });
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(`${job.name} ${active ? 'enabled' : 'disabled'}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function runNow(job: ScheduledJob) {
    setBusy(job.code);
    try {
      const result = await api.post(`/api/admin/settings/jobs/${job.code}`);
      if (!result.ok) {
        errorToast(result.message);
        return;
      }
      success(result.message);
      setPendingRun(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card padded={false}>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Scheduled jobs</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          The platform registers these jobs; the cron entry in the deployment guide runs them. Reminder jobs can be
          triggered here at any time — they are idempotent, so a manual run never double-sends.
        </p>
      </div>

      <div className="divide-y divide-line">
        {jobs.map((job) => (
          <div key={job.code} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink">{job.name}</p>
                <Badge tone="slate">{typeLabels[job.type] ?? job.type}</Badge>
                <Badge tone={STATUS_TONE[job.lastStatus] ?? 'slate'} dot>
                  {job.lastStatus === 'never' ? 'Never run' : job.lastStatus}
                </Badge>
                {!job.active && <Badge tone="warning">Paused</Badge>}
              </div>
              {job.description && <p className="mt-1 max-w-3xl text-[12px] text-ink-muted">{job.description}</p>}
              <p className="mt-1 text-[11px] text-ink-muted">
                Schedule <span className="font-mono">{job.cron ?? 'not set'}</span>
                {job.lastRunAt ? ` · last run ${formatDateTime(job.lastRunAt)}` : ' · never run'}
                {job.nextRunAt ? ` · next ${formatDateTime(job.nextRunAt)}` : ''}
              </p>
              {job.lastMessage && (
                <p className={`mt-1 text-[12px] ${job.lastStatus === 'failed' ? 'text-red-600' : 'text-ink-muted'}`}>
                  Last result: {job.lastMessage}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Switch checked={job.active} disabled={!canEdit || busy === job.code} onChange={(next) => toggle(job, next)} label="" />
              {job.type === 'REMINDER' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canEdit || !job.active}
                  loading={busy === job.code}
                  onClick={() => setPendingRun(job)}
                >
                  Run now
                </Button>
              )}
            </div>
          </div>
        ))}
        {!jobs.length && <p className="px-4 py-8 text-center text-sm text-ink-muted">No jobs are registered.</p>}
      </div>

      <ConfirmDialog
        open={Boolean(pendingRun)}
        onClose={() => setPendingRun(null)}
        onConfirm={async () => {
          if (pendingRun) await runNow(pendingRun);
        }}
        title={`Run ${pendingRun?.name ?? 'job'} now?`}
        message="Reminders are dispatched for everything that is due and has not been notified yet. Already-sent reminders are skipped, so a manual run never double-sends."
        confirmLabel="Run now"
        variant="primary"
        loading={busy === pendingRun?.code}
      />
    </Card>
  );
}
