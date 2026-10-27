/** Dropdown option sources for employer-scoped pickers. */
import { query, type RowDataPacket } from '@/lib/db/mysql';

export async function employerOptionsBySearch(search?: string, limit = 50) {
  const params: unknown[] = ['active'];
  let where = 'deleted_at IS NULL AND status = ?';
  if (search?.trim()) {
    where += ' AND (company_name LIKE ? OR employer_code LIKE ? OR city LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }
  const rows = await query<{ id: number; company_name: string; employer_code: string; city: string | null } & RowDataPacket>(
    `SELECT id, company_name, employer_code, city FROM employers WHERE ${where} ORDER BY company_name ASC LIMIT ${Math.min(limit, 100)}`,
    params
  );
  return rows.map((row) => ({
    value: String(row.id),
    label: row.company_name,
    hint: [row.employer_code, row.city].filter(Boolean).join(' · '),
  }));
}

export async function unitOptions(employerId: number) {
  const rows = await query<{ id: number; unit_name: string; location: string | null } & RowDataPacket>(
    'SELECT id, unit_name, location FROM company_units WHERE employer_id = ? AND deleted_at IS NULL ORDER BY unit_name',
    [employerId]
  );
  return rows.map((row) => ({ value: String(row.id), label: row.unit_name, hint: row.location ?? undefined }));
}

export async function departmentOptions(employerId: number) {
  const rows = await query<{ id: number; department_name: string } & RowDataPacket>(
    'SELECT id, department_name FROM departments WHERE employer_id = ? AND deleted_at IS NULL ORDER BY department_name',
    [employerId]
  );
  return rows.map((row) => ({ value: String(row.id), label: row.department_name }));
}
