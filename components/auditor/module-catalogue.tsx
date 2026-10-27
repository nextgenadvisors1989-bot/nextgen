'use client';

/**
 * Assigned modules — the auditor's catalogue.
 *
 * Only published modules the auditor is entitled to (by role assignment or a
 * named-user assignment) appear, and only their published forms. Starting a form
 * opens the submission; if a draft already exists the engine resumes it instead
 * of creating a duplicate.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatNumber, truncate } from '@/lib/utils/formatting';

export interface AvailableForm {
  id: number;
  name: string;
  description: string | null;
  form_type: string;
  version: string | number;
  requires_signature: boolean;
  requires_attachments: boolean;
  allow_draft: boolean;
}

export interface AvailableModule {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  version: string;
  module_type: string;
  default_tat_days: number | null;
  requires_verification: number | boolean;
  published_forms: number | string;
  access: { role: string; can_create: boolean } | null;
  forms: AvailableForm[];
}

export function ModuleCatalogue({
  modules,
  stats,
  drafts,
  panel = 'auditor',
}: {
  /** Which workspace is rendering the catalogue; selects its API and page prefixes. */
  panel?: 'auditor' | 'employer';
  modules: AvailableModule[];
  stats: { total: number; drafts: number; submitted: number; underReview: number; approved: number; averageScore: number | null };
  drafts: { id: number; submission_number: string; title: string | null; module_name: string; form_name: string; updated_at: string }[];
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [starting, setStarting] = useState<number | null>(null);
  const submissionsApi = `/api/${panel}/submissions`;
  const submissionsPath = `/${panel}/submissions`;

  async function start(form: AvailableForm) {
    setStarting(form.id);
    try {
      const response = await api.post<{ submissionId: number; resumed: boolean; submissionNumber: string }>(submissionsApi, {
        form_id: form.id,
      });
      if (!response.ok) throw new Error(response.message);
      const started = response.data as { submissionId?: number; resumed?: boolean; submissionNumber?: string } | undefined;
      success(started?.resumed ? `Resuming ${started.submissionNumber}` : `${form.name} started`);
      if (started?.submissionId) router.push(`${submissionsPath}/${started.submissionId}`);
      else router.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setStarting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Assigned Modules" value={formatNumber(modules.length)} hint="Published and available to you" tone="brand" />
        <StatCard label="Open Drafts" value={formatNumber(stats.drafts)} hint="Resume where you left off" tone="slate" />
        <StatCard label="In Review" value={formatNumber(stats.submitted + stats.underReview)} hint="With a verifier" tone={stats.submitted + stats.underReview ? 'amber' : 'emerald'} />
        <StatCard label="Approved" value={formatNumber(stats.approved)} hint="Signed off" tone="emerald" />
        <StatCard
          label="Average Score"
          value={stats.averageScore === null ? '—' : `${Number(stats.averageScore).toFixed(1)}%`}
          hint={`${formatNumber(stats.total)} submission(s) recorded`}
          tone="violet"
        />
      </div>

      {drafts.length > 0 && (
        <Card padded={false}>
          <CardHeader title="Continue where you left off" description="Drafts save automatically every three seconds while you fill a form." />
          <div className="divide-y divide-line">
            {drafts.map((draft) => (
              <div key={draft.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`${submissionsPath}/${draft.id}`} className="font-medium text-brand-600 hover:underline">
                    {truncate(draft.title || draft.submission_number, 50)}
                  </Link>
                  <span className="block text-xs text-ink-muted">
                    {draft.module_name} · {draft.form_name} · {draft.submission_number}
                  </span>
                </div>
                <Link href={`${submissionsPath}/${draft.id}`} className="btn btn-sm btn-primary">Resume</Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {modules.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No modules assigned to you yet"
              subtitle="An administrator assigns dynamic modules to your role or to you personally. Once published, they appear here with their forms ready to fill."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {modules.map((module) => (
            <Card key={module.id}>
              <CardHeader
                title={module.name}
                description={module.description ?? `${module.module_type} module`}
                action={
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone="violet">{module.module_type}</Badge>
                    <span className="text-xs text-ink-muted">v{module.version}</span>
                  </div>
                }
              />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge tone="slate">{formatNumber(Number(module.published_forms))} published form(s)</Badge>
                  {Number(module.requires_verification) ? <Badge tone="info">Verification required</Badge> : null}
                  {module.default_tat_days ? <Badge tone="slate">TAT {module.default_tat_days} days</Badge> : null}
                  {module.category ? <Badge tone="slate">{module.category}</Badge> : null}
                  {module.access && !module.access.can_create ? <Badge tone="warning">Read only</Badge> : null}
                </div>

                {module.forms.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line p-3 text-sm text-ink-muted">
                    This module has no published form yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {module.forms.map((form) => (
                      <li key={form.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">{truncate(form.name, 42)}</p>
                          <p className="text-xs text-ink-muted">
                            {form.form_type} · v{String(form.version)}
                            {form.requires_signature ? ' · signature' : ''}
                            {form.requires_attachments ? ' · attachments' : ''}
                            {form.allow_draft ? ' · drafts allowed' : ' · one sitting'}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          loading={starting === form.id}
                          disabled={module.access ? !module.access.can_create : false}
                          onClick={() => start(form)}
                        >
                          {form.allow_draft ? 'Start / resume' : 'Start'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
