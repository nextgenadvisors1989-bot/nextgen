'use client';

import type { BadgeTone } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import type { ApiResult } from '@/lib/utils/api-client';

export const rupees = (value: unknown) => `₹${Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TONES: Record<string, BadgeTone> = {
  Draft: 'slate', Sent: 'info', Accepted: 'success', Rejected: 'danger', Expired: 'warning', Invoiced: 'brand',
  Issued: 'info', 'Part paid': 'warning', Paid: 'success', Cancelled: 'danger',
};

export function StatusPill({ status, overdue }: { status: string; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={TONES[status] ?? 'default'}>{status}</Badge>
      {overdue ? <Badge tone="danger">Overdue</Badge> : null}
    </span>
  );
}

/** Flattens the API's `errors` (list or map) into one message per field. */
export function fieldMap(result: ApiResult): Record<string, string> {
  const out: Record<string, string> = {};
  const errors = result.errors;
  if (Array.isArray(errors)) for (const item of errors) out[item.field] = item.message;
  else if (errors) for (const [key, value] of Object.entries(errors)) out[key] = value[0];
  return out;
}

/** "items.0.fee" -> the message for that row and column. */
export function itemError(errors: Record<string, string>, index: number, key: string): string | undefined {
  return errors[`items.${index}.${key}`] ?? errors[`items[${index}].${key}`];
}

export const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
