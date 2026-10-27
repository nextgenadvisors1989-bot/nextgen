/** Consistent JSON envelope + error translation for every route handler. */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthorizationError } from '@/lib/auth/permission-check';
import { logError } from '@/lib/logger/error-log';
import type { Pagination } from '@/types/api';

/** Service-raised business-rule codes → HTTP status. */
const SERVICE_ERROR_STATUS: Record<string, number> = {
  VALIDATION_FAILED: 422,
  NO_TARGETS: 422,
  NO_CHANGE: 409,
  // Services raise this after an explicit duplicate check (a register cannot hold
  // the same licence number, gazette notification or act twice).
  DUPLICATE: 409,
  INVALID_STATE: 409,
  IN_USE: 409,
  PACK_REQUIRED: 409,
  CAPACITY_EXCEEDED: 409,
  INVALID_REFERENCE: 400,
  NOT_FOUND: 404,
  // Payroll's own refusals: a run with nobody to pay, a leave request beyond the
  // balance in the ledger, an employer with no leave types configured. Each is a
  // business rule the operator has to fix, not a server fault.
  NO_EMPLOYEES: 409,
  NO_LEAVE_TYPES: 409,
  INSUFFICIENT_BALANCE: 409,
  // The document vault's own refusals: a blocked file type, an empty file, a
  // file past the size limit, or an upload that carried no file at all. These
  // are the caller's problem, not a server fault — without them a refused upload
  // would answer 500 and read as a crash.
  INVALID_FILE_TYPE: 422,
  EMPTY_FILE: 422,
  NO_FILES: 422,
  FILE_TOO_LARGE: 413,
  // Raised when a record exists but belongs to somebody else (an auditor opening
  // an audit that is not theirs, a verifier reviewing another verifier's queue).
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
};

export function ok<T>(data: T, options: { message?: string; status?: number; pagination?: Pagination; extra?: Record<string, unknown> } = {}) {
  return NextResponse.json(
    { success: true, message: options.message, ...(options.pagination ? { pagination: options.pagination } : {}), ...(options.extra ?? {}), ...normalize(data) },
    { status: options.status ?? 200 }
  );
}

/** Wraps arrays as `data` and objects as-is, matching the documented API shapes. */
function normalize<T>(data: T): Record<string, unknown> {
  if (Array.isArray(data)) return { data };
  if (data && typeof data === 'object' && !(data instanceof Date)) return data as Record<string, unknown>;
  return { data };
}

export function created<T>(data: T, message = 'Record created successfully') {
  return ok(data, { message, status: 201 });
}

export function fail(message: string, status = 400, extra: { code?: string; errors?: unknown } = {}) {
  return NextResponse.json({ success: false, message, ...extra }, { status });
}

export function notFound(resource = 'Record') {
  return fail(`${resource} not found`, 404, { code: 'NOT_FOUND' });
}

export function validationFailed(errors: Record<string, string[]> | { field: string; message: string }[]) {
  return fail('Validation failed. Please correct the highlighted fields.', 422, { errors });
}

/** Converts thrown errors (Zod, auth, MySQL) into the documented JSON contract. */
export async function handleRouteError(error: unknown, context: { route?: string; method?: string; body?: unknown; userId?: number; ip?: string }) {
  if (error instanceof ZodError) {
    const errors = error.issues.map((issue) => ({
      field: issue.path.join('.') || 'form',
      message: issue.message,
    }));
    return validationFailed(errors);
  }

  if (error instanceof AuthorizationError) {
    return fail(error.message, error.status, { code: 'FORBIDDEN' });
  }

  /**
   * Services raise `Object.assign(new Error('…'), { code: '…' })` for business
   * rule violations. Those codes are mapped here so the API answers with the
   * right status instead of a blanket 500. MySQL driver codes (ER_*) are
   * handled separately below.
   */
  // Malformed JSON bodies, and other client-side shape errors, are the caller's
  // problem — answer 400 instead of logging a 500.
  if (error instanceof SyntaxError) {
    return fail('The request body is not valid JSON', 400, { code: 'INVALID_JSON' });
  }

  const raised = error as {
    code?: string;
    message?: string;
    issues?: { field: string; message: string }[];
    details?: { issues?: { field: string; message: string }[] };
  };
  if (raised?.code && !raised.code.startsWith('ER_') && SERVICE_ERROR_STATUS[raised.code]) {
    // Field-level issues raised by a service (scoring, required answers, unique
    // answers, conditional rules, settings validation) travel with the envelope
    // so the client can highlight the offending field instead of showing a bare
    // message. Services attach them either directly or inside `details`.
    const issues = Array.isArray(raised.issues) && raised.issues.length > 0
      ? { errors: raised.issues }
      : Array.isArray(raised.details?.issues) && raised.details!.issues!.length > 0
        ? { errors: raised.details.issues }
        : {};
    return fail(raised.message ?? 'The request could not be completed', SERVICE_ERROR_STATUS[raised.code], {
      code: raised.code,
      ...issues,
    });
  }

  const mysqlError = error as { code?: string; errno?: number; sqlMessage?: string };
  if (mysqlError?.code === 'ER_DUP_ENTRY') {
    // Services raise ER_DUP_ENTRY with a human sentence ("An auditor with the
    // email … already exists"); only raw driver messages get the generic text.
    const raised = (error as Error).message;
    if (raised && !/^Duplicate entry/i.test(raised)) {
      return fail(raised, 409, { code: 'DUPLICATE' });
    }
    const field = /for key '([^']+)'/.exec(mysqlError.sqlMessage ?? '')?.[1] ?? 'value';
    return fail(`A record with this ${field.split('.').pop()?.replace(/_/g, ' ') ?? 'value'} already exists`, 409, { code: 'DUPLICATE' });
  }
  if (mysqlError?.code === 'ER_NO_REFERENCED_ROW_2') {
    return fail('A referenced record does not exist or was removed', 400, { code: 'INVALID_REFERENCE' });
  }
  if (mysqlError?.code === 'ER_ROW_IS_REFERENCED_2') {
    return fail('This record is referenced by other data and cannot be deleted. Deactivate it instead.', 409, { code: 'REFERENCED' });
  }

  await logError({
    error,
    route: context.route,
    requestMethod: context.method,
    requestBody: context.body,
    userId: context.userId,
    ipAddress: context.ip,
  });

  const message = process.env.NODE_ENV === 'production'
    ? 'Something went wrong on our side. The error has been logged.'
    : (error as Error).message;
  return fail(message, 500, { code: 'INTERNAL_ERROR' });
}

/** Reads and validates pagination-ish query params. */
export function parseSearchParams(request: Request) {
  const url = new URL(request.url);
  return url.searchParams;
}

export function clientIp(request: Request): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null
  );
}

export function userAgent(request: Request): string | null {
  return request.headers.get('user-agent');
}

/** Serialises plain MySQL rows for JSON responses (dates -> ISO strings). */
export function serialize<T>(rows: T): T {
  return JSON.parse(JSON.stringify(rows, (_key, value) => (typeof value === 'bigint' ? Number(value) : value)));
}
