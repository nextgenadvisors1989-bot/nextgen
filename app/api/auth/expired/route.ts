import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/expired - where a page guard sends a visitor whose session cookie is still signed but no longer valid on the server
 * (revoked, expired, or the database was restored). It clears the cookies, then goes to the login page. Without this the edge
 * middleware (which only checks the signature) bounces /login to the dashboard and the dashboard bounces back: a redirect loop.
 */
export async function GET() {
  // A relative Location: the server listens on 0.0.0.0, so the request URL's host is not one a browser can use.
  const response = new NextResponse(null, { status: 307, headers: { Location: '/login' } });
  response.cookies.set('cos_session', '', { path: '/', maxAge: 0 });
  response.cookies.set('cos_csrf', '', { path: '/', maxAge: 0 });
  return response;
}
