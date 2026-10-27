import { requireAdminApi } from '@/lib/auth/api-guards';
import { employerOptionsBySearch } from '@/services/employer-options';
import { handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

/** GET /api/admin/employers/options?search= — autocomplete source for employer pickers. */
export async function GET(request: Request) {
  try {
    await requireAdminApi([]);
    const search = parseSearchParams(request).get('search') ?? undefined;
    const options = await employerOptionsBySearch(search);
    return ok(options);
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/employers/options', method: 'GET' });
  }
}
