'use client';

import { useState } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { downloadFromApi } from '@/lib/utils/export';

/** Same list as lib/pdf/employee-documents.ts (kept here so this client component does not import the PDF code). */
const DOCUMENTS: { type: string; label: string; hint: string }[] = [
  { type: 'checklist', label: 'Personal file checklist', hint: 'Cover sheet with the 16 contents and ticks' },
  { type: 'appointment-order', label: 'Appointment order', hint: 'Wages, hours, weekly off, probation (English and Tamil)' },
  { type: 'confirmation-letter', label: 'Confirmation letter', hint: 'Confirmation of service (English and Tamil)' },
  { type: 'service-record', label: 'Service record', hint: 'Designation and wage history' },
  { type: 'form-f', label: 'Gratuity Form F', hint: 'Nomination under the Payment of Gratuity (Central) Rules 1972' },
  { type: 'form-2', label: 'EPF Form 2', hint: 'Nomination and declaration, with EPF and EPS nominees' },
  { type: 'form-11', label: 'EPF Form 11', hint: 'Declaration by a person taking up employment' },
  { type: 'bank-letter', label: 'Wage acceptance through bank', hint: 'Letter agreeing to receive wages in a bank account' },
  { type: 'wage-revision', label: 'Salary and wages revision letter', hint: 'Existing and revised wage, with approvals' },
  { type: 'affirmative-statement', label: 'Affirmative statement', hint: 'Employee undertaking (Tamil)' },
];

/** Prints the client's personal-file documents, pre-filled from this employee's record. */
export function PersonalFileDocuments({ employeeId, employeeNumber }: { employeeId: number; employeeNumber: string }) {
  const { error: errorToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function download(type: string) {
    setBusy(type);
    const result = await downloadFromApi(`/api/pdf/employee-document/${employeeId}?type=${type}`, `${type}-${employeeNumber.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`);
    setBusy(null);
    if (!result.ok) errorToast('Download failed', result.message ?? 'The document could not be generated');
  }

  return (
    <Card padded={false}>
      <CardHeader title="Personal file documents" description="Print any form pre-filled from this employee's record, ready for signature." />
      <CardBody>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {DOCUMENTS.map((doc) => (
            <li key={doc.type} className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">{doc.label}</span>
                <span className="block text-xs text-ink-muted">{doc.hint}</span>
              </span>
              <Button size="sm" variant="outline" loading={busy === doc.type} onClick={() => download(doc.type)}>Download</Button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
