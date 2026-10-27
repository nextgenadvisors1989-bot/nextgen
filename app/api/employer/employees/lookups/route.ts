/**
 * GET /api/employer/employees/lookups — everything the hiring wizard needs: the
 * establishment's own units and departments first, then the platform's
 * designations, states, wage heads and personal-file checklist.
 *
 * The employer picker is deliberately empty here. The admin register may choose
 * which company to hire into; an establishment may not — so the wizard shows no
 * picker at all rather than one with a single option.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { employeeLookups } from '@/services/employee.service';
import { listDepartments, listUnits } from '@/services/employer.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireEmployerApi(['employee.read']);
    const employerId = Number(user.employerId ?? 0);

    const [lookups, units, departments] = await Promise.all([
      employeeLookups(employerId),
      employerId ? listUnits(employerId) : Promise.resolve([]),
      employerId ? listDepartments(employerId) : Promise.resolve([]),
    ]);

    return ok({
      ...lookups,
      employers: [],
      units: (units as Record<string, unknown>[]).map((row) => ({
        id: Number(row.id),
        unit_name: String(row.unit_name),
        unit_code: row.unit_code ?? null,
      })),
      departments: (departments as Record<string, unknown>[]).map((row) => ({
        id: Number(row.id),
        unit_id: row.unit_id === null || row.unit_id === undefined ? null : Number(row.unit_id),
        department_name: String(row.department_name),
      })),
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/employees/lookups', method: 'GET' });
  }
}
