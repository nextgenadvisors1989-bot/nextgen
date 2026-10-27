import { requireAdminApi } from '@/lib/auth/api-guards';
import { addEmployeeRecord, resourceDefinition, type EmployeeResource } from '@/services/employee.service';
import { clientIp, created, fail, handleRouteError, notFound, ok, userAgent } from '@/lib/utils/api-response';
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ employeeId: string; resource: string }> };

/** Loads one child collection for the employee detail tabs. */
async function loadCollection(resource: EmployeeResource, employeeId: number) {
  switch (resource) {
    case 'qualifications':
      return query<RowDataPacket>('SELECT * FROM employee_qualifications WHERE employee_id = ? AND deleted_at IS NULL ORDER BY year_of_passing DESC, id DESC', [employeeId]);
    case 'experience':
      return query<RowDataPacket>('SELECT * FROM employee_experience WHERE employee_id = ? AND deleted_at IS NULL ORDER BY date_from DESC, id DESC', [employeeId]);
    case 'dependents':
      return query<RowDataPacket>('SELECT * FROM employee_dependents WHERE employee_id = ? AND deleted_at IS NULL ORDER BY id ASC', [employeeId]);
    case 'references':
      return query<RowDataPacket>('SELECT * FROM employee_references WHERE employee_id = ? AND deleted_at IS NULL ORDER BY id ASC', [employeeId]);
    case 'nominees':
      return query<RowDataPacket>('SELECT * FROM employee_nominees WHERE employee_id = ? AND deleted_at IS NULL ORDER BY form_type ASC, id ASC', [employeeId]);
    case 'service-records':
      return query<RowDataPacket>('SELECT * FROM employee_service_records WHERE employee_id = ? AND deleted_at IS NULL ORDER BY date_from DESC, id DESC', [employeeId]);
    case 'documents':
      return query<RowDataPacket>(
        `SELECT ed.*, f.original_name, f.mime_type, f.size_bytes, f.uuid AS file_uuid
           FROM employee_documents ed
           LEFT JOIN files f ON f.id = ed.file_id
          WHERE ed.employee_id = ? AND ed.deleted_at IS NULL
          ORDER BY ed.created_at DESC`,
        [employeeId]
      );
    case 'checklist':
      return query<RowDataPacket>(
        `SELECT ci.id AS item_id, ci.item_code, ci.item_label, ci.sort_order, ci.is_mandatory,
                COALESCE(fc.is_checked, 0) AS is_checked, fc.checked_at, fc.remarks
           FROM personal_file_checklist_items ci
           LEFT JOIN employee_file_checklist fc ON fc.item_id = ci.id AND fc.employee_id = ?
          ORDER BY ci.sort_order ASC`,
        [employeeId]
      );
    default:
      return [];
  }
}

/** GET /api/admin/employees/:employeeId/:resource */
export async function GET(request: Request, { params }: Params) {
  try {
    await requireAdminApi(['employee.read']);
    const { employeeId, resource } = await params;
    const definition = resourceDefinition(resource);
    if (!definition) return fail(`Unknown employee resource "${resource}"`, 404, { code: 'UNKNOWN_RESOURCE' });

    const id = Number(employeeId);
    const exists = await queryOne<RowDataPacket>('SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1', [id]);
    if (!exists) return notFound('Employee');

    const data = await loadCollection(resource as EmployeeResource, id);
    return ok(data);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees/:id/:resource', method: 'GET' });
  }
}

/** POST /api/admin/employees/:employeeId/:resource */
export async function POST(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireAdminApi(['employee.update']);
    const { employeeId, resource } = await params;
    const definition = resourceDefinition(resource);
    if (!definition) return fail(`Unknown employee resource "${resource}"`, 404, { code: 'UNKNOWN_RESOURCE' });

    const result = await addEmployeeRecord(Number(employeeId), resource as EmployeeResource, body, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    if (!result) return notFound('Employee');

    if (resource === 'checklist') {
      const checked = Boolean((body as { is_checked?: unknown } | null)?.is_checked);
      return ok(result, { message: checked ? 'Checklist item marked as complete' : 'Checklist item marked as pending' });
    }

    return created(result, `${definition.label} added successfully`);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employees/:id/:resource', method: 'POST', body });
  }
}
