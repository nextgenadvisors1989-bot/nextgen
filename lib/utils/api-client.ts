'use client';

/**
 * Browser fetch wrapper: injects the CSRF token, normalises error messages,
 * and returns the documented `{ success, message, ... }` envelope.
 */
export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  message: string;
  data?: T;
  pagination?: { total: number; page: number; limit: number; totalPages: number; from: number; to: number };
  errors?: { field: string; message: string }[] | Record<string, string[]>;
  raw: unknown;
}

function csrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)cos_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers);
  headers.set('X-CSRF-Token', csrfToken());
  headers.set('Accept', 'application/json');

  let body = options.body;
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }

  try {
    const response = await fetch(url, { ...options, headers, body, credentials: 'same-origin' });
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : { message: await response.text() };

    if (response.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }

    return {
      ok: response.ok && payload.success !== false,
      status: response.status,
      message: payload.message ?? (response.ok ? 'Success' : 'Request failed'),
      data: (payload.data ?? payload) as T,
      pagination: payload.pagination,
      errors: payload.errors,
      raw: payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: 'Unable to reach the server. Check your network connection.',
      raw: error,
    };
  }
}

export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: 'POST', json }),
  put: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: 'PUT', json }),
  patch: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: 'PATCH', json }),
  delete: <T>(url: string, json?: unknown) => apiFetch<T>(url, { method: 'DELETE', json }),
};

/** Flattens the documented error envelope into a per-field message map. */
export function fieldErrors(result: ApiResult): Record<string, string> {
  const output: Record<string, string> = {};
  if (!result.errors) return output;
  if (Array.isArray(result.errors)) {
    for (const issue of result.errors) output[issue.field] = issue.message;
  } else {
    for (const [field, messages] of Object.entries(result.errors)) {
      output[field] = Array.isArray(messages) ? messages[0] : String(messages);
    }
  }
  return output;
}

export { csrfToken };
