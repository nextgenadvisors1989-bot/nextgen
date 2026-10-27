/**
 * Edge middleware: cheap signature check so unauthenticated traffic never reaches
 * a protected route, plus CSRF enforcement on mutating API calls and
 * first-login password-change routing. Deep authorisation happens server-side.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'cos_session';
const CSRF_COOKIE = 'cos_csrf';

const PANEL_PREFIXES = ['/admin', '/auditor', '/employer', '/employee', '/verifier'];

const ROLE_HOME: Record<string, string> = {
  super_admin: '/admin/dashboard',
  admin: '/admin/dashboard',
  auditor: '/auditor/dashboard',
  employer: '/employer/dashboard',
  employee: '/employee/dashboard',
  verifier: '/verifier/dashboard',
};
const AUTH_PAGES = ['/login', '/forgot-password', '/reset-password', '/activate-account'];
/** Endpoints that must stay reachable without a session (and are CSRF-exempt by design). */
const PUBLIC_API = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/expired',
  '/api/public',
  '/api/health',
];

const PUBLIC_PATH_PREFIXES = [
  '/_next', '/favicon', '/images', '/fonts', '/templates',
  '/about', '/contact', '/services', '/acts-compliance', '/resources', '/reports',
  '/terms-conditions', '/privacy-policy',
];

function isPanelRoute(pathname: string) {
  return PANEL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

async function verifyEdge(token: string | undefined) {
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? '');
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    return payload as { sid?: string; uid?: number };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith('/api');
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifyEdge(token);

  if (isApi && !PUBLIC_API.some((p) => pathname.startsWith(p))) {
    // CSRF: mutating requests must echo the double-submit token.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const headerToken = request.headers.get('x-csrf-token');
      const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
      if (!headerToken || !cookieToken || headerToken !== cookieToken) {
        return NextResponse.json(
          { success: false, message: 'Invalid or missing CSRF token', code: 'CSRF_FAILED' },
          { status: 403 }
        );
      }
    }
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'Authentication required', code: 'UNAUTHENTICATED' },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Signed-in users shouldn't sit on login/forgot-password pages.
  if (AUTH_PAGES.includes(pathname) && session) {
    const role = (session as { role?: string }).role;
    const target = ROLE_HOME[role ?? ''] ?? '/';
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (isPanelRoute(pathname) && !session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf)$).*)',
  ],
};
