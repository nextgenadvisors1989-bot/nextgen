'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatCurrency } from '@/lib/utils/formatting';
import { FINDING_SEVERITIES, FINDING_STATUSES, REPORT_TYPES } from '@/lib/validations/audit-report.validation';

export interface ReportLookups {
  employers: { id: number; company_name: string; employer_code: string; city: string | null }[];
  units: { id: number; employer_id: number; unit_name: string }[];
  auditors: { id: number; name: string; auditor_code: string; email: string }[];
  verifiers: { id: number; name: string; email: string; pending_reviews: number }[];
  assignments: {
    id: number; assignment_number: string; audit_title: string; employer_id: number;
    unit_id: number | null; auditor_id: number | null; status: string; assignment_type: string; has_report: boolean;
  }[];
  modules: { id: number; name: string; code: string }[];
}

interface FindingRow {
  reference: string; severity: string; clause: string; description: string;
  evidence: string; recommendation: string; employer_response: string; status: string; due_date: string;
}
interface ScoreRow { section: string; max_score: string; obtained_score: string; remarks: string }

const EMPTY_FINDING: FindingRow = {
  reference: '', severity: 'Minor', clause: '', description: '', evidence: '',
  recommendation: '', employer_response: '', status: 'Open', due_date: '',
};
const EMPTY_SCORE: ScoreRow = { section: '', max_score: '', obtained_score: '', remarks: '' };

/**
 * Report composer.
 *
 * The headline block (title, period, score, next audit due) plus the document
 * body: executive summary, methodology, a section-wise scorecard with live
 * totals, the findings register and the observation / recommendation /
 * regulation lists. Scorecard totals drive the headline score automatically, so
 * the auditor never has to add up by hand — and every save that touches the body
 * becomes a new report version.
 */
export function ReportForm({
  mode, report, initialBody, lookups, canSubmit = true,
}: {
  mode: 'create' | 'edit';
  report?: Record<string, unknown>;
  initialBody?: {
    executive_summary: string | null; methodology: string | null;
    findings: FindingRow[]; scorecard: ScoreRow[];
    observations: string[]; regulatory_references: string[]; recommendations: string[];
  };
  lookups: ReportLookups;
  canSubmit?: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();

  const [form, setForm] = useState<Record<string, string>>(() => {
    const empty: Record<string, string> = {
      assignment_id: '', employer_id: '', unit_id: '', auditor_id: '', verifier_id: '',
      audit_title: '', report_type: 'AUDIT', audit_period_from: '', audit_period_to: '',
      audit_date: '', next_audit_due: '', score_obtained: '', score_max: '', score_percentage: '',
      executive_summary: '', methodology: '', verification_due_date: '',
    };
    if (mode === 'edit' && report) {
      for (const key of Object.keys(empty)) {
        const value = report[key];
        empty[key] = value === null || value === undefined ? '' : String(value);
      }
    }
    return empty;
  });
  const [findings, setFindings] = useState<FindingRow[]>(initialBody?.findings?.length ? initialBody.findings : []);
  const [scorecard, setScorecard] = useState<ScoreRow[]>(initialBody?.scorecard?.length ? initialBody.scorecard : []);
  const [observations, setObservations] = useState<string>(() => (initialBody?.observations ?? []).join('\n'));
  const [recommendations, setRecommendations] = useState<string>(() => (initialBody?.recommendations ?? []).join('\n'));
  const [references, setReferences] = useState<string>(() => (initialBody?.regulatory_references ?? []).join('\n'));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitAfterSave, setSubmitAfterSave] = useState(false);
  const [createVersion, setCreateVersion] = useState(false);
  const [regeneratePdf, setRegeneratePdf] = useState(false);

  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));
  const setSelect = (key: string) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const selectedEmployer = form.employer_id ? Number(form.employer_id) : null;
  const units = useMemo(
    () => lookups.units.filter((unit) => unit.employer_id === selectedEmployer),
    [lookups.units, selectedEmployer]
  );
  // Assignments that can still take a report for the chosen employer.
  const assignmentOptions = useMemo(
    () => lookups.assignments.filter((assignment) =>
      (!selectedEmployer || assignment.employer_id === selectedEmployer) && (!assignment.has_report || String(assignment.id) === form.assignment_id)
    ),
    [lookups.assignments, selectedEmployer, form.assignment_id]
  );

  const totals = useMemo(() => {
    const max = scorecard.reduce((sum, row) => sum + Number(row.max_score || 0), 0);
    const obtained = scorecard.reduce((sum, row) => sum + Number(row.obtained_score || 0), 0);
    const explicitMax = Number(form.score_max || 0);
    const explicitObtained = Number(form.score_obtained || 0);
    const useScorecard = scorecard.some((row) => row.section.trim());
    const finalMax = useScorecard && max > 0 ? max : explicitMax;
    const finalObtained = useScorecard && max > 0 ? obtained : explicitObtained;
    const percentage = finalMax > 0 ? (finalObtained / finalMax) * 100 : Number(form.score_percentage || 0);
    return { max: finalMax, obtained: finalObtained, percentage: Number.isFinite(percentage) ? percentage : 0, useScorecard };
  }, [scorecard, form.score_max, form.score_obtained, form.score_percentage]);

  const findingCounts = useMemo(() => {
    const counts = { Critical: 0, Major: 0, Minor: 0, Observation: 0 } as Record<string, number>;
    for (const finding of findings) if (finding.description.trim()) counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    return counts;
  }, [findings]);

  /** Choosing an assignment pre-fills the identity block from the audit. */
  function applyAssignment(assignmentId: string) {
    const assignment = lookups.assignments.find((entry) => String(entry.id) === assignmentId);
    setForm((current) => {
      if (!assignment) return { ...current, assignment_id: '' };
      return {
        ...current,
        assignment_id: assignmentId,
        audit_title: current.audit_title || assignment.audit_title,
        employer_id: String(assignment.employer_id),
        unit_id: assignment.unit_id ? String(assignment.unit_id) : '',
        auditor_id: assignment.auditor_id ? String(assignment.auditor_id) : '',
        report_type: assignment.assignment_type,
      };
    });
  }

  function buildPayload() {
    const payload: Record<string, unknown> = {
      assignment_id: form.assignment_id ? Number(form.assignment_id) : null,
      employer_id: form.employer_id ? Number(form.employer_id) : null,
      unit_id: form.unit_id ? Number(form.unit_id) : null,
      auditor_id: form.auditor_id ? Number(form.auditor_id) : null,
      audit_title: form.audit_title,
      report_type: form.report_type,
      audit_period_from: form.audit_period_from || null,
      audit_period_to: form.audit_period_to || null,
      audit_date: form.audit_date || null,
      next_audit_due: form.next_audit_due || null,
      score_obtained: totals.useScorecard ? totals.obtained : form.score_obtained === '' ? null : Number(form.score_obtained),
      score_max: totals.useScorecard ? totals.max : form.score_max === '' ? null : Number(form.score_max),
      score_percentage: totals.useScorecard ? Math.round(totals.percentage * 100) / 100 : form.score_percentage === '' ? null : Number(form.score_percentage),
      body: {
        executive_summary: form.executive_summary || null,
        methodology: form.methodology || null,
        findings: findings
          .filter((finding) => finding.description.trim().length >= 10)
          .map((finding) => ({
            reference: finding.reference || null,
            severity: finding.severity,
            clause: finding.clause || null,
            description: finding.description,
            evidence: finding.evidence || null,
            recommendation: finding.recommendation || null,
            employer_response: finding.employer_response || null,
            status: finding.status,
            due_date: finding.due_date || null,
          })),
        scorecard: scorecard
          .filter((row) => row.section.trim())
          .map((row) => ({
            section: row.section,
            max_score: Number(row.max_score || 0),
            obtained_score: Number(row.obtained_score || 0),
            remarks: row.remarks || null,
          })),
        observations: observations.split('\n').map((line) => line.trim()).filter(Boolean),
        recommendations: recommendations.split('\n').map((line) => line.trim()).filter(Boolean),
        regulatory_references: references.split('\n').map((line) => line.trim()).filter(Boolean),
      },
    };

    if (mode === 'create') {
      payload.verifier_id = form.verifier_id ? Number(form.verifier_id) : null;
      payload.verification_due_date = form.verification_due_date || null;
      payload.submit = submitAfterSave;
    } else {
      payload.change_summary = `Edited by the administrator${totals.useScorecard ? ' (scorecard totals recalculated)' : ''}`;
      payload.create_version = createVersion;
      payload.regenerate_pdf = regeneratePdf;
    }
    return payload;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const payload = buildPayload();

    const result = mode === 'create'
      ? await api.post<{ reportId: number; reportNumber: string; version: number; warnings: string[] }>('/api/admin/audit-reports', payload)
      : await api.put<{ version: { version: number } | null; warnings: string[] }>(`/api/admin/audit-reports/${report?.id}`, payload);

    setSaving(false);

    if (!result.ok) {
      setErrors(fieldErrors(result));
      errorToast('Could not save report', result.message);
      return;
    }

    if (mode === 'create') {
      const created = result.raw as { reportId: number; reportNumber: string; submitted: boolean; warnings: string[] };
      success(
        created.submitted ? 'Report submitted' : 'Report created',
        created.submitted
          ? `${created.reportNumber} was submitted, the PDF attached and the verifier notified.`
          : `${created.reportNumber} was saved as a draft with version 1.`
      );
      for (const warning of created.warnings ?? []) errorToast('Heads up', warning);
      router.push(`/admin/audit-reports/${created.reportId}`);
    } else {
      const updated = result.raw as { version: { version: number } | null; warnings: string[] };
      success(
        'Report saved',
        updated.version ? `Saved as version ${updated.version.version}, which the approval history keeps.` : 'The report details were updated.'
      );
      for (const warning of updated.warnings ?? []) errorToast('Heads up', warning);
      router.push(`/admin/audit-reports/${report?.id}`);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card padded={false}>
        <CardHeader
          title="What is being reported"
          description="Link the audit assignment to inherit its scope, dates and auditor — or record a report manually"
        />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2">
            <Select
              label="Audit Assignment" searchable clearable
              value={form.assignment_id}
              onChange={applyAssignment}
              error={errors.assignment_id}
              placeholder={selectedEmployer ? 'No assignment — record the report manually' : 'Select an employer first, or leave blank'}
              options={assignmentOptions.map((assignment) => ({
                value: String(assignment.id),
                label: `${assignment.assignment_number} — ${assignment.audit_title}`,
                hint: `${assignment.status} · ${assignment.assignment_type}`,
              }))}
              helper="Assignments that already have a report are hidden — open that report and create a new version instead."
            />
          </div>
          <Select label="Report Type" value={form.report_type} onChange={setSelect('report_type')} error={errors.report_type}
            options={REPORT_TYPES.map((type) => ({ value: type, label: type.replace('_', ' ') }))} />
          <div className="md:col-span-2 xl:col-span-3">
            <Input label="Report Title" requiredMark value={form.audit_title} onChange={set('audit_title')} error={errors.audit_title}
              placeholder="e.g. Annual Factories Act 1948 compliance audit — Spinning Unit" />
          </div>
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Who and where" description="Employer, unit, auditor and the verifier who will review this report" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Select label="Employer" required searchable value={form.employer_id} error={errors.employer_id}
            placeholder="Select employer"
            onChange={(value) => setForm((current) => ({ ...current, employer_id: value, unit_id: '', assignment_id: '' }))}
            options={lookups.employers.map((employer) => ({
              value: String(employer.id), label: employer.company_name,
              hint: [employer.employer_code, employer.city].filter(Boolean).join(' · '),
            }))} />
          <Select label="Unit" clearable value={form.unit_id} error={errors.unit_id} disabled={!form.employer_id}
            placeholder={form.employer_id ? 'All units' : 'Select an employer first'}
            onChange={setSelect('unit_id')}
            options={units.map((unit) => ({ value: String(unit.id), label: unit.unit_name }))} />
          <Select label="Auditor" searchable clearable value={form.auditor_id} error={errors.auditor_id}
            placeholder="Select auditor" onChange={setSelect('auditor_id')}
            options={lookups.auditors.map((auditor) => ({
              value: String(auditor.id), label: `${auditor.name} (${auditor.auditor_code})`, hint: auditor.email,
            }))} />
          {mode === 'create' && (
            <>
              <Select label="Verifier" searchable clearable value={form.verifier_id} error={errors.verifier_id}
                placeholder="Send to a verifier on submit"
                onChange={setSelect('verifier_id')}
                options={lookups.verifiers.map((verifier) => ({
                  value: String(verifier.id), label: verifier.name,
                  hint: `${verifier.pending_reviews} pending · ${verifier.email}`,
                }))} />
              <Input label="Verification Due" type="date" value={form.verification_due_date}
                onChange={set('verification_due_date')} error={errors.verification_due_date} />
            </>
          )}
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Audit period and score" description="Scorecard totals recalculate the headline score automatically" />
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input label="Period From" type="date" value={form.audit_period_from} onChange={set('audit_period_from')} error={errors.audit_period_from} />
          <Input label="Period To" type="date" value={form.audit_period_to} onChange={set('audit_period_to')} error={errors.audit_period_to} />
          <Input label="Audit Date" type="date" value={form.audit_date} onChange={set('audit_date')} error={errors.audit_date} />
          <Input label="Next Audit Due" type="date" value={form.next_audit_due} onChange={set('next_audit_due')} error={errors.next_audit_due}
            helper="Drives the re-audit reminders once the report is approved." />
          <Input label="Score Obtained" type="number" step="0.01" min={0} value={form.score_obtained}
            onChange={set('score_obtained')} error={errors.score_obtained}
            disabled={totals.useScorecard} helper={totals.useScorecard ? 'From the scorecard below' : undefined} />
          <Input label="Maximum Score" type="number" step="0.01" min={0} value={form.score_max}
            onChange={set('score_max')} error={errors.score_max}
            disabled={totals.useScorecard} helper={totals.useScorecard ? 'From the scorecard below' : undefined} />
          <div className="md:col-span-2">
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Compliance score</p>
              <p className="text-lg font-semibold text-ink">
                {totals.max > 0 ? `${totals.percentage.toFixed(2)}%` : 'Not scored'}
              </p>
              <p className="text-xs text-ink-muted">
                {totals.max > 0
                  ? `${totals.obtained.toFixed(2)} of ${totals.max.toFixed(2)} points${totals.useScorecard ? ' (from the scorecard)' : ''}`
                  : 'Enter the scorecard below, or the headline score above.'}
              </p>
              {totals.max > 0 && <div className="mt-2"><ProgressBar value={totals.percentage} height={6} /></div>}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Executive summary & methodology" description="Two or three paragraphs each — these print at the top of the PDF" />
        <CardBody className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Textarea label="Executive Summary" rows={7} value={form.executive_summary} onChange={set('executive_summary')}
            error={errors.executive_summary}
            placeholder="Overall compliance position, what was examined, and the headline conclusion." />
          <Textarea label="Scope & Methodology" rows={7} value={form.methodology} onChange={set('methodology')}
            error={errors.methodology}
            placeholder="Statutes covered, records inspected, sampling approach, people interviewed." />
        </CardBody>
      </Card>

      {/* ------------------------------------------------------------ scorecard */}
      <Card padded={false}>
        <CardHeader
          title="Section-wise scorecard"
          description="Each row is a statute, department or checklist section. Totals roll straight into the headline score."
          action={<Button type="button" variant="outline" size="sm" onClick={() => setScorecard((rows) => [...rows, { ...EMPTY_SCORE }])}>Add Section</Button>}
        />
        <CardBody className="space-y-3">
          {scorecard.length === 0 && (
            <p className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-4 text-sm text-ink-muted">
              No sections yet. Add one per statute or department, or use the headline score block above.
            </p>
          )}
          {scorecard.map((row, index) => (
            <div key={index} className="grid grid-cols-1 gap-3 rounded-lg border border-line p-3 md:grid-cols-12">
              <div className="md:col-span-5">
                <Input label="Section" value={row.section}
                  onChange={(event) => setScorecard((rows) => rows.map((item, i) => i === index ? { ...item, section: event.target.value } : item))} />
              </div>
              <div className="md:col-span-2">
                <Input label="Max" type="number" step="0.01" min={0} value={row.max_score}
                  onChange={(event) => setScorecard((rows) => rows.map((item, i) => i === index ? { ...item, max_score: event.target.value } : item))} />
              </div>
              <div className="md:col-span-2">
                <Input label="Obtained" type="number" step="0.01" min={0} value={row.obtained_score}
                  onChange={(event) => setScorecard((rows) => rows.map((item, i) => i === index ? { ...item, obtained_score: event.target.value } : item))} />
              </div>
              <div className="md:col-span-2">
                <Input label="Remarks" value={row.remarks}
                  onChange={(event) => setScorecard((rows) => rows.map((item, i) => i === index ? { ...item, remarks: event.target.value } : item))} />
              </div>
              <div className="flex items-end md:col-span-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setScorecard((rows) => rows.filter((_, i) => i !== index))}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {totals.max > 0 && (
            <p className="text-sm text-ink-soft">
              <Badge tone="brand">Total {totals.obtained.toFixed(2)} / {totals.max.toFixed(2)}</Badge>{' '}
              <span className="text-ink-muted">= {totals.percentage.toFixed(2)}% compliance</span>
            </p>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------------------- findings */}
      <Card padded={false}>
        <CardHeader
          title={`Findings register (${findings.filter((finding) => finding.description.trim()).length})`}
          description="Every non-conformity with the clause it breaches and the action the employer must take"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={findingCounts.Critical ? 'danger' : 'slate'}>{findingCounts.Critical} critical</Badge>
              <Badge tone={findingCounts.Major ? 'warning' : 'slate'}>{findingCounts.Major} major</Badge>
              <Badge tone="slate">{findingCounts.Minor} minor</Badge>
              <Button type="button" variant="outline" size="sm" onClick={() => setFindings((rows) => [...rows, { ...EMPTY_FINDING }])}>
                Add Finding
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4">
          {findings.length === 0 && (
            <p className="rounded-lg border border-dashed border-line bg-slate-50 px-4 py-4 text-sm text-ink-muted">
              No findings recorded. Add one for every observation that needs the employer to act.
            </p>
          )}
          {findings.map((finding, index) => (
            <div key={index} className="rounded-lg border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Finding {index + 1}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setFindings((rows) => rows.filter((_, i) => i !== index))}>
                  Remove
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Select label="Severity" value={finding.severity}
                  onChange={(value) => setFindings((rows) => rows.map((item, i) => i === index ? { ...item, severity: value } : item))}
                  options={FINDING_SEVERITIES.map((severity) => ({ value: severity, label: severity }))} />
                <Select label="Status" value={finding.status}
                  onChange={(value) => setFindings((rows) => rows.map((item, i) => i === index ? { ...item, status: value } : item))}
                  options={FINDING_STATUSES.map((status) => ({ value: status, label: status }))} />
                <Input label="Reference" value={finding.reference} placeholder="e.g. F-01"
                  onChange={(event) => setFindings((rows) => rows.map((item, i) => i === index ? { ...item, reference: event.target.value } : item))} />
                <Input label="Due Date" type="date" value={finding.due_date}
                  onChange={(event) => setFindings((rows) => rows.map((item, i) => i === index ? { ...item, due_date: event.target.value } : item))} />
                <div className="md:col-span-2 xl:col-span-4">
                  <Input label="Statutory reference" value={finding.clause}
                    placeholder="e.g. Rule 61 of the Tamil Nadu Factories Rules, 1950"
                    onChange={(event) => setFindings((rows) => rows.map((item, i) => i === index ? { ...item, clause: event.target.value } : item))} />
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <Textarea label="Finding" required rows={3} value={finding.description}
                    error={errors[`body.findings.${index}.description`]}
                    placeholder="What was observed, on which machine/register/bay, and why it is a non-conformity (min 10 characters)."
                    onChange={(event) => setFindings((rows) => rows.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} />
                </div>
                <div className="md:col-span-2">
                  <Textarea label="Evidence" rows={2} value={finding.evidence}
                    placeholder="Register page, photograph reference, interview note."
                    onChange={(event) => setFindings((rows) => rows.map((item, i) => i === index ? { ...item, evidence: event.target.value } : item))} />
                </div>
                <div className="md:col-span-2">
                  <Textarea label="Action required" rows={2} value={finding.recommendation}
                    placeholder="What the employer must do, by when."
                    onChange={(event) => setFindings((rows) => rows.map((item, i) => i === index ? { ...item, recommendation: event.target.value } : item))} />
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <Textarea label="Employer response" rows={2} value={finding.employer_response}
                    placeholder="Filled in when the employer replies, or after a corrective-action review."
                    onChange={(event) => setFindings((rows) => rows.map((item, i) => i === index ? { ...item, employer_response: event.target.value } : item))} />
                </div>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Observations, recommendations and references" description="One entry per line — they print as bullet lists in the PDF" />
        <CardBody className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Textarea label="Observations" rows={6} value={observations} onChange={(event) => setObservations(event.target.value)}
            placeholder={'Statutory registers are current\nCanteen hygiene improved since the last audit'} />
          <Textarea label="Recommendations" rows={6} value={recommendations} onChange={(event) => setRecommendations(event.target.value)}
            placeholder={'Service the fire hydrant pump quarterly\nDigitise the Form 12 register'} />
          <Textarea label="Regulatory References" rows={6} value={references} onChange={(event) => setReferences(event.target.value)}
            placeholder={'Factories Act, 1948 — s.38\nTamil Nadu Factories Rules, 1950 — Rule 61'} />
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title={mode === 'create' ? 'Finish' : 'Save as a new version'} description={mode === 'create'
          ? 'Submitting here generates the PDF, files version 1 and queues the verifier.'
          : 'Any change to the body creates a new revision so the approved version stays intact.'} />
        <CardBody className="space-y-3">
          {mode === 'create' ? (
            <>
              <Checkbox label="Submit to the verifier immediately (generates the PDF and notifies them)" checked={submitAfterSave}
                onChange={(event) => setSubmitAfterSave((event.target as HTMLInputElement).checked)} />
              {!form.verifier_id && submitAfterSave && (
                <p className="text-xs text-amber-600">
                  No verifier selected — the audit assignment&apos;s verifier will be used if one is set, otherwise the report is
                  submitted without a reviewer and you will be told so.
                </p>
              )}
            </>
          ) : (
            <>
              <Checkbox label="Keep the current body as a separate version (recommended once approved)" checked={createVersion}
                onChange={(event) => setCreateVersion((event.target as HTMLInputElement).checked)} />
              <Checkbox label="Regenerate the report PDF now" checked={regeneratePdf}
                onChange={(event) => setRegeneratePdf((event.target as HTMLInputElement).checked)} />
            </>
          )}
          <p className="text-xs text-ink-muted">
            Scorecard total: <strong>{formatCurrency(totals.obtained)}</strong> of {formatCurrency(totals.max)} points
            {totals.max > 0 ? ` — ${totals.percentage.toFixed(2)}%` : ''}.
            Fields that must be complete before submission: report title, employer, audit period, and at least one scorecard
            section or a headline score.
          </p>
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <LinkButton href={mode === 'edit' && report ? `/admin/audit-reports/${report.id}` : '/admin/audit-reports'} variant="outline">
          Cancel
        </LinkButton>
        <Button type="submit" loading={saving} disabled={mode === 'create' && !canSubmit}>
          {mode === 'create' ? (submitAfterSave ? 'Save & Submit' : 'Save Draft') : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
