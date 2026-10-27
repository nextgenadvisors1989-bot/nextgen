'use client';

/**
 * Submission record.
 *
 * The metadata header (number, module, status, score, decision, attachments)
 * wrapped around the shared renderer. In `fill` mode an auditor/employer/employee
 * gets the live form with autosave and submit; in `view` mode the same answers are
 * shown read-only and, when the caller may verify, the approve / return / reject
 * panel appears underneath.
 */
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormRenderer, type RendererSpec } from './form-renderer';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatBytes } from '@/lib/utils/formatting';

export interface SubmissionFileRow {
  id: number;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | string;
  version: number | string;
  created_at: string;
}

export interface SubmissionWorkspacePayload {
  submission: Record<string, unknown>;
  form: Record<string, unknown>;
  module: Record<string, unknown>;
  structure: Record<string, unknown>;
  values: Record<string, unknown>;
  tableRows: Record<string, Array<Record<string, unknown>>>;
  tableTotals: Record<string, Record<string, number>>;
  permissions: { canEdit: boolean; canSubmit: boolean; canReview: boolean; canDelete: boolean };
  files: SubmissionFileRow[];
}

export function SubmissionRecord({
  workspace,
  mode,
  apiBase,
  reviewBase,
  backHref,
  backLabel,
}: {
  workspace: SubmissionWorkspacePayload;
  mode: 'fill' | 'view';
  apiBase?: string;
  reviewBase?: string;
  backHref: string;
  backLabel: string;
}) {
  const router = useRouter();
  const { submission } = workspace;
  const submissionId = Number(submission.id);
  const spec: RendererSpec = {
    form: workspace.form,
    module: workspace.module,
    structure: workspace.structure as unknown as RendererSpec['structure'],
    defaults: {},
    existingDraftId: submissionId,
  };

  const scorePercentage = submission.score_percentage === null || submission.score_percentage === undefined
    ? null
    : Number(submission.score_percentage);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={String(submission.submission_number)}
          description={String(submission.title ?? workspace.form.name ?? 'Dynamic form submission')}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={String(submission.status)} />
              {scorePercentage !== null && (
                <span className={`text-sm font-semibold ${scorePercentage >= 90 ? 'text-emerald-600' : scorePercentage >= 75 ? 'text-brand-600' : scorePercentage >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                  {scorePercentage.toFixed(1)}%
                </span>
              )}
            </div>
          }
        />
        <CardBody className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
            <div>
              <dt className="text-[13px] text-ink-muted">Module</dt>
              <dd className="font-medium text-ink">
                {String(workspace.module.name ?? '—')}
                <span className="block text-xs font-normal text-ink-muted">
                  {String(workspace.module.module_type ?? '')} · v{String(workspace.module.version ?? '1.0')}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-ink-muted">Form</dt>
              <dd className="font-medium text-ink">
                {String(workspace.form.name ?? '—')}
                <span className="block text-xs font-normal text-ink-muted">
                  v{String(workspace.form.version ?? 1)} · {String(workspace.form.form_type ?? 'STANDARD')}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-ink-muted">Submitted</dt>
              <dd className="font-medium text-ink">{submission.submitted_at ? formatDateTime(String(submission.submitted_at)) : 'Not submitted yet'}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-ink-muted">Last saved</dt>
              <dd className="font-medium text-ink">{formatDateTime(String(submission.updated_at))}</dd>
            </div>
            {submission.period_from || submission.period_to ? (
              <div>
                <dt className="text-[13px] text-ink-muted">Period covered</dt>
                <dd className="font-medium text-ink">
                  {submission.period_from ? formatDate(String(submission.period_from)) : '—'} → {submission.period_to ? formatDate(String(submission.period_to)) : '—'}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Link href={backHref} className="text-sm font-medium text-brand-600 hover:underline">← {backLabel}</Link>
            <span className="text-ink-muted">·</span>
            <a
              href={`/api/pdf/submission/${submissionId}`}
              className="text-sm font-medium text-brand-600 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {submission.pdf_file_id ? 'Download PDF (latest version)' : 'Generate PDF'}
            </a>
            {workspace.permissions.canReview && mode === 'view' && (
              <Badge tone="violet" dot>Awaiting your decision</Badge>
            )}
          </div>

          {workspace.files.length > 0 && (
            <div className="rounded-lg border border-line bg-surface-muted p-3">
              <p className="mb-2 text-[13px] font-semibold text-ink-soft">Attachments</p>
              <ul className="space-y-1.5">
                {workspace.files.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <a href={`/api/files/${file.id}`} className="font-medium text-brand-600 hover:underline" target="_blank" rel="noreferrer">
                      {file.original_name}
                    </a>
                    <span className="text-xs text-ink-muted">
                      {formatBytes(Number(file.size_bytes))} · v{String(file.version)} · {formatDate(String(file.created_at))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <FormRenderer
        mode={mode}
        spec={spec}
        apiBase={apiBase}
        reviewBase={reviewBase}
        submissionId={submissionId}
        values={workspace.values}
        tableRows={workspace.tableRows}
        permissions={workspace.permissions}
        submission={submission}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
