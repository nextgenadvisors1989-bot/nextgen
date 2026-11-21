/** GET /api/data-management/export?register&from&to&employer_id — a register's records of a period as a CSV file. */
import { fail } from '@/lib/utils/api-response';
import { withDataManagement } from '@/lib/api/data-management-route';
import { exportRows } from '@/services/data-management.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  // a leading = + - @ would be run as a formula by a spreadsheet
  const safe = /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(request: Request) {
  return withDataManagement(request, { route: '/api/data-management/export', method: 'GET' }, async ({ actor, url, employerId }) => {
    const code = url.searchParams.get('register') ?? '';
    if (!code) return fail('Choose a register', 422, { code: 'VALIDATION_FAILED' });
    const { register, rows, period, scope } = await exportRows(actor.user, employerId, code, { from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined });
    const fields = register.fields;
    const head = ['Date', ...(register.shift ? ['Shift'] : []), ...fields.map((field) => `${field.label}${field.unit ? ` (${field.unit})` : ''}`), 'Remarks', 'Status', 'Entered by'];
    const lines = [head.map(cell).join(',')];
    for (const row of rows) {
      lines.push([row.entry_date, ...(register.shift ? [row.shift] : []), ...fields.map((field) => row.data[field.key]), row.remarks, row.status, row.entered_by_name].map(cell).join(','));
    }
    const company = scope.companyName.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30);
    return new Response('﻿' + lines.join('\r\n'), {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${register.code}_${company}_${period.from}_${period.to}.csv"`, 'Cache-Control': 'private, no-store' },
    });
  });
}
