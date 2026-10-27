/**
 * GET   /api/employer/profile — the signed-in establishment's own company file:
 *       its record, its units, its departments, a slice of its staff and its stats.
 * PATCH /api/employer/profile — corrects the parts of that file the establishment
 *       owns. The employer code, the lifecycle status and anything that mints a
 *       portal login belong to the platform, so a write to one of those is refused
 *       by name (422) instead of being dropped silently and leaving the screen
 *       lying about what it saved.
 */
import { requireEmployerApi } from '@/lib/auth/api-guards';
import { clientIp, handleRouteError, ok, userAgent } from '@/lib/utils/api-response';
import { getEmployerDetail, updateEmployer } from '@/services/employer.service';
import * as repo from '@/repositories/employer.repository';
import * as employeeRepo from '@/repositories/employee.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELF_EDITABLE = new Set([
  'company_name', 'gst_number', 'pan_number', 'cin_number', 'industry_type', 'company_type',
  'year_of_establishment', 'website_url', 'email', 'phone', 'mobile', 'fax',
  'address_line_1', 'address_line_2', 'city', 'state', 'pincode', 'country',
  'contact_person_name', 'contact_person_designation', 'contact_person_email', 'contact_person_mobile',
  'contact_person_alternate_mobile', 'compliance_contact_person', 'compliance_contact_email',
  'compliance_contact_phone', 'payroll_contact_person', 'payroll_contact_email', 'payroll_contact_phone',
  'notes',
]);

function refuseFields(fields: { field: string; message: string }[]): never {
  throw Object.assign(new Error('Validation failed. Please correct the highlighted fields.'), {
    code: 'VALIDATION_FAILED',
    issues: fields,
  });
}

export async function GET() {
  try {
    const user = await requireEmployerApi(['employer.read']);
    const employerId = Number(user.employerId ?? 0);
    if (!employerId) return ok({ employer: null, units: [], departments: [], employees: [], stats: null });

    const [employer, units, departments, employees, stats] = await Promise.all([
      repo.findEmployerById(employerId),
      repo.findUnits(employerId),
      repo.findDepartments(employerId),
      employeeRepo.findEmployees({ employerId, page: 1, limit: 5, sortBy: 'created_at', sortDir: 'desc' } as employeeRepo.EmployeeListFilters),
      repo.getEmployerStats(employerId),
    ]);

    return ok({
      employer,
      units,
      departments,
      employees: (employees as { data?: unknown[] } | undefined)?.data ?? [],
      // The employer picker is empty in this panel: an establishment never chooses
      // which company to act as.
      employers: [],
      stats,
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/profile', method: 'GET' });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const user = await requireEmployerApi(['employer.update']);
    const employerId = Number(user.employerId ?? 0);

    const sent = Object.keys(body as Record<string, unknown>);
    const refused = sent.filter((field) => !SELF_EDITABLE.has(field));
    if (refused.length) {
      refuseFields(refused.map((field) => ({
        field,
        message: `${field.replace(/_/g, ' ')} is maintained by the platform and cannot be changed here`,
      })));
    }

    const result = await updateEmployer(employerId, body, {
      user, ip: clientIp(request), userAgent: userAgent(request),
    });
    if (!result) return ok({ employer: null }, { message: 'No company file to update' });

    return ok({ employer: result.employer, changedFields: result.changedFields },
      { message: 'Company profile updated' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/employer/profile', method: 'PATCH', body });
  }
}
