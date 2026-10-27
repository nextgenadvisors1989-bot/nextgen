import { getCurrentUser, logoutUser } from '@/lib/auth/auth';
import { handleRouteError, ok } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

/** POST /api/auth/logout — revokes the session row and clears cookies. */
export async function POST() {
  try {
    const user = await getCurrentUser();
    await logoutUser(user);
    return ok({ loggedOut: true }, { message: 'Logged out successfully' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/auth/logout', method: 'POST' });
  }
}
