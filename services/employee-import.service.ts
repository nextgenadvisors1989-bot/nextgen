/**
 * Bulk employee import — one CSV, one establishment, as many hires as rows.
 *
 * Each row goes through the exact same `createEmployee()` path the wizard
 * uses, so numbering, duplicate refusals, wage maths and the activity trail
 * behave identically. A bad row never aborts the batch: it lands in the
 * `skipped` list with the row number and the reason, and the import carries
 * on with the next one.
 */
import { createEmployee, type ActorContext } from '@/services/employee.service';
import { csvRecords } from '@/lib/utils/csv';

/** The columns the importer understands; the template lists exactly these. */
export const EMPLOYEE_IMPORT_COLUMNS = [
  'name', 'employee_number', 'designation', 'department', 'email', 'mobile',
  'sex', 'date_of_birth', 'date_of_joining', 'basic_salary', 'da', 'hra', 'status',
] as const;

const GENDERS = ['Male', 'Female', 'Other'];
const STATUSES = ['active', 'inactive', 'resigned', 'terminated', 'retired', 'absconding'];

export interface ImportOutcome {
  created: number;
  skipped: { row: number; name: string; reason: string }[];
  total: number;
}

export async function importEmployeesCsv(
  csvText: string,
  employerId: number,
  actor: ActorContext
): Promise<ImportOutcome> {
  const records = csvRecords(csvText);
  if (!records.length) {
    throw Object.assign(new Error('The file has no data rows — the first row names the columns'), {
      code: 'VALIDATION_FAILED',
      fieldErrors: [{ field: 'file', message: 'The file has no data rows' }],
    });
  }
  if (records.length > 500) {
    throw Object.assign(new Error('At most 500 employees per import — split the file and run it twice'), {
      code: 'VALIDATION_FAILED',
      fieldErrors: [{ field: 'file', message: 'At most 500 employees per import' }],
    });
  }

  const outcome: ImportOutcome = { created: 0, skipped: [], total: records.length };

  for (const [index, record] of records.entries()) {
    const rowNumber = index + 2; // row 1 is the header
    const name = String(record.name ?? '').trim();
    try {
      if (!name || name.length < 2) throw new Error('name is required (at least 2 characters)');

      const payload: Record<string, unknown> = {
        name,
        employer_id: employerId,
        employee_number: record.employee_number || null,
        designation: record.designation || null,
        department: record.department || null,
        email: record.email || null,
        mobile: record.mobile || null,
        sex: record.sex && GENDERS.includes(record.sex) ? record.sex : null,
        date_of_birth: record.date_of_birth || null,
        date_of_joining: record.date_of_joining || null,
        basic_salary: record.basic_salary || null,
        da: record.da || null,
        hra: record.hra || null,
        status: record.status && STATUSES.includes(record.status) ? record.status : 'active',
      };

      await createEmployee(payload, actor);
      outcome.created += 1;
    } catch (error) {
      const message = error instanceof Error
        ? (error.message.includes('issues') ? error.message : error.message.split('\n')[0])
        : 'The row could not be imported';
      outcome.skipped.push({ row: rowNumber, name: name || '(no name)', reason: message });
    }
  }

  return outcome;
}
