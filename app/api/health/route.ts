import { pingDatabase } from '@/lib/db/mysql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/health — readiness probe: process up, database reachable. */
export async function GET() {
  const database = await pingDatabase();
  const healthy = database.ok;
  return Response.json(
    {
      success: healthy,
      status: healthy ? 'healthy' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      database: { connected: database.ok, version: database.version, latencyMs: database.latencyMs, error: database.error },
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
