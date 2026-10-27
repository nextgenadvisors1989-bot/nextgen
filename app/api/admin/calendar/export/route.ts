/**
 * GET /api/admin/calendar/export — the register as CSV.
 *
 * The screen exports what it is showing, but the payroll and compliance teams
 * want the whole year, so this endpoint streams every event matching the same
 * filters the register accepts.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { calendarEventListQuerySchema, EVENT_TYPE_LABELS } from '@/lib/validations/calendar.validation';
import { listEvents } from '@/services/calendar.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  try {
    await requireAdminApi(['calendar.export']);
    const params = parseSearchParams(request);
    const filters = calendarEventListQuerySchema.parse(Object.fromEntries(params));
    const result = await listEvents({
      page: 1,
      limit: 100,
      search: filters.search ?? null,
      sortBy: 'start_datetime',
      sortDir: 'asc',
      eventType: filters.event_type,
      status: filters.status,
      priority: filters.priority,
      visibility: filters.visibility,
      employerId: filters.employer_id ?? null,
      unitId: filters.unit_id ?? null,
      auditorId: filters.auditor_id ?? null,
      fromDate: filters.from_date || null,
      toDate: filters.to_date || null,
      window: filters.window,
    });

    const header = ['Reference', 'Title', 'Type', 'Starts', 'Ends', 'All day', 'Status', 'Priority', 'Employer', 'Unit', 'Audit', 'Location', 'Visibility'];
    const lines = [header.join(',')];
    for (const event of result.data) {
      const row = event as unknown as Record<string, unknown>;
      lines.push([
        `EVT-${row.id}`,
        row.title,
        EVENT_TYPE_LABELS[String(row.event_type)] ?? row.event_type,
        row.start_datetime,
        row.end_datetime ?? '',
        Number(row.all_day) ? 'Yes' : 'No',
        row.status,
        row.priority,
        row.company_name ?? '',
        row.unit_name ?? '',
        row.assignment_number ?? '',
        row.location ?? '',
        row.visibility,
      ].map(csvCell).join(','));
    }

    const body = `\ufeff${lines.join('\n')}\n`;
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="complianceos-calendar-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/calendar/export', method: 'GET' });
  }
}
