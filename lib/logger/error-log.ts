/** Central error capture. Writes to error_logs and mirrors to the console. */
import { insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';

export interface ErrorLogInput {
  error: unknown;
  route?: string | null;
  requestMethod?: string | null;
  requestBody?: unknown;
  userId?: number | null;
  ipAddress?: string | null;
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical' | 'fatal';
  errorCode?: string | null;
}

export async function logError(input: ErrorLogInput): Promise<number> {
  const error = input.error instanceof Error ? input.error : new Error(String(input.error));
  const stack = error.stack ?? '';
  const locationMatch = stack.split('\n')[1]?.match(/\((.*):(\d+):(\d+)\)/) ?? null;

  try {
    return await insert(
      `INSERT INTO error_logs (error_code, error_type, message, stack_trace, file_path, line_number,
                               route, request_method, request_body, user_id, ip_address, severity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.errorCode ?? null,
        error.name || 'Error',
        error.message,
        stack || null,
        locationMatch?.[1] ?? null,
        locationMatch ? Number(locationMatch[2]) : null,
        input.route ?? null,
        input.requestMethod ?? null,
        input.requestBody ? JSON.stringify(sanitize(input.requestBody)) : null,
        input.userId ?? null,
        input.ipAddress ?? null,
        input.severity ?? 'error',
      ]
    );
  } catch (dbError) {
    console.error('[error-log] could not persist error:', (dbError as Error).message, error.message);
    return 0;
  }
}

function sanitize(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (/password|token|secret|otp/i.test(key)) clone[key] = '[redacted]';
  }
  return clone;
}

export async function listErrorLogs(params: { page?: number; limit?: number; severity?: string; resolved?: string }) {
  const where: string[] = ['1 = 1'];
  const values: unknown[] = [];
  if (params.severity) { where.push('severity = ?'); values.push(params.severity); }
  if (params.resolved === 'true') where.push('is_resolved = 1');
  if (params.resolved === 'false') where.push('is_resolved = 0');

  const limit = Math.min(params.limit ?? 25, 200);
  const page = Math.max(params.page ?? 1, 1);
  const offset = (page - 1) * limit;
  const whereSql = where.join(' AND ');

  const total = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS total FROM error_logs WHERE ${whereSql}`, values);
  const data = await query(
    `SELECT id, error_code, error_type, message, route, request_method, severity, is_resolved, created_at
       FROM error_logs WHERE ${whereSql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    values
  );
  const count = Number(total?.total ?? 0);
  return {
    data,
    pagination: { total: count, page, limit, totalPages: Math.max(Math.ceil(count / limit), 1), from: offset + 1, to: Math.min(offset + limit, count) },
  };
}
