'use client';

/**
 * "Start audit" screen.
 *
 * Deliberately a confirmation rather than a one-click redirect: the auditor sees
 * the brief, the schedule and what starting will do (open the report draft, move
 * the assignment to In Progress, tell the employer) before committing. If a draft
 * already exists the button becomes "Resume" and says so.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';

export function AuditStartPanel({
  assignment,
  existingReport,
}: {
  assignment: Record<string, unknown>;
  existingReport: { id: number; report_number: string } | null;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const result = await api.post(`/api/auditor/audits/${Number(assignment.id)}/start`, {});
    setBusy(false);
    if (result.ok) {
      const payload = (result.data ?? {}) as { reportId?: number };
      success(result.message, 'The report composer is ready — save as often as you like.');
      router.push(payload.reportId ? `/auditor/audits/${Number(assignment.id)}/draft` : `/auditor/audits/${Number(assignment.id)}`);
      router.refresh();
    } else {
      errorToast('Could not open the audit', result.message);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader
          title={String(assignment.audit_title)}
          description={`${String(assignment.assignment_number)} · ${String(assignment.assignment_type ?? '').replace('_', ' ')}`}
          action={<StatusBadge status={String(assignment.status)} />}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Fact label="Employer" value={String(assignment.employer_name ?? '—')} />
          <Fact label="Unit" value={String(assignment.unit_name ?? 'All units')} />
          <Fact label="Department" value={String(assignment.department_name ?? 'All departments')} />
          <Fact label="Verifier" value={String(assignment.verifier_name ?? 'Not assigned yet')} />
          <Fact label="Audit window" value={`${formatDate(assignment.start_date as string)} → ${formatDate(assignment.end_date as string)}`} />
          <Fact label="Due date" value={formatDate(assignment.due_date as string)} />
          <Fact label="Closing meeting" value={formatDateTime(assignment.audit_end_meeting_at as string)} />
          <Fact label="Priority" value={String(assignment.priority ?? '—')} />
        </CardBody>
        {assignment.scope ? (
          <div className="border-t border-line px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Scope</p>
            <p className="mt-1 text-sm text-ink-soft">{String(assignment.scope)}</p>
          </div>
        ) : null}
        {assignment.instructions ? (
          <div className="border-t border-line px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Instructions</p>
            <p className="mt-1 text-sm text-ink-soft">{String(assignment.instructions)}</p>
          </div>
        ) : null}
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader
            title={existingReport ? 'Resume this audit' : 'Start this audit'}
            description={existingReport
              ? `Report ${existingReport.report_number} is already open. Resuming keeps everything you have written.`
              : 'Opening the audit creates its report draft and moves the assignment to In Progress.'}
          />
          <CardBody className="space-y-4">
            <ul className="space-y-2 text-sm text-ink-soft">
              <li>• A numbered report draft is created for this audit.</li>
              <li>• Your notes, findings and scores are saved as you type.</li>
              <li>• Submitting freezes a revision, generates the PDF and asks the verifier to review it.</li>
              <li>• The employer&apos;s portal users are told the audit has begun.</li>
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button loading={busy} onClick={() => void start()}>
                {existingReport ? 'Resume Audit' : 'Start Audit'}
              </Button>
              <LinkButton href="/auditor/audits" variant="outline">Back to the list</LinkButton>
            </div>
            {existingReport ? (
              <p className="text-xs text-ink-muted">
                Existing report <Badge tone="slate">{existingReport.report_number}</Badge>
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink-strong">{value}</p>
    </div>
  );
}
