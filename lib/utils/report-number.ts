/**
 * Human-readable, gap-free document numbering.
 * Sequences are allocated inside the caller's transaction via `nextSequence`
 * (which locks the counter row) so concurrent submissions never collide.
 */
import { randomUUID } from 'node:crypto';
import { queryOne, insert, execute, type RowDataPacket } from '@/lib/db/mysql';

export const NUMBER_PREFIXES = {
  assignment: 'AUD',
  report: 'RPT',
  submission: 'SUB',
  payslip: 'PS',
  payrollRun: 'PR',
  employee: 'EMP',
  employer: 'EMR',
  auditor: 'AUDT',
  risk: 'RSK',
  assessment: 'ASM',
  study: 'STD',
  workPermit: 'WP',
  complianceDocument: 'CD',
  settlement: 'FFS',
  leaveApplication: 'LV',
  file: 'DOC',
  capar: 'CAPAR',
  quotation: 'QTN',
  invoice: 'INV',
  receipt: 'RCT',
} as const;

export type NumberKind = keyof typeof NUMBER_PREFIXES;

/** Allocates the next value for a prefix + period, e.g. RPT/2026/000123 */
export async function nextDocumentNumber(kind: NumberKind, period = new Date()): Promise<string> {
  const prefix = NUMBER_PREFIXES[kind];
  const year = period.getFullYear();
  const scope = `${prefix}-${year}`;

  await execute(
    `INSERT INTO document_sequences (sequence_scope, last_value) VALUES (?, 0)
     ON DUPLICATE KEY UPDATE last_value = last_value`,
    [scope]
  );
  await execute('UPDATE document_sequences SET last_value = last_value + 1 WHERE sequence_scope = ?', [scope]);
  const row = await queryOne<RowDataPacket>(
    'SELECT last_value FROM document_sequences WHERE sequence_scope = ?',
    [scope]
  );
  const value = Number(row?.last_value ?? 1);
  return `${prefix}/${year}/${String(value).padStart(6, '0')}`;
}

/** Same as above but scoped to an employer (used for employer-visible documents). */
export async function nextScopedNumber(kind: NumberKind, employerCode: string, period = new Date()): Promise<string> {
  const prefix = NUMBER_PREFIXES[kind];
  const year = period.getFullYear();
  const scope = `${prefix}-${employerCode}-${year}`;

  await execute(
    `INSERT INTO document_sequences (sequence_scope, last_value) VALUES (?, 0)
     ON DUPLICATE KEY UPDATE last_value = last_value`,
    [scope]
  );
  await execute('UPDATE document_sequences SET last_value = last_value + 1 WHERE sequence_scope = ?', [scope]);
  const row = await queryOne<RowDataPacket>('SELECT last_value FROM document_sequences WHERE sequence_scope = ?', [scope]);
  const value = Number(row?.last_value ?? 1);
  return `${prefix}/${employerCode}/${year}/${String(value).padStart(5, '0')}`;
}

export function newUuid(): string {
  return randomUUID();
}

/** Employer code suggestion: first 3 consonants of the name + zero-padded id. */
export function suggestEmployerCode(companyName: string): string {
  const letters = companyName.toUpperCase().replace(/[^A-Z]/g, '');
  const stem = (letters.replace(/[AEIOU]/g, '') || letters).slice(0, 4).padEnd(4, 'X');
  const year = new Date().getFullYear().toString().slice(-2);
  return `${stem}${year}`;
}
