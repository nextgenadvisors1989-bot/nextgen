/**
 * Administrator side of the public contact form: the inbox of enquiries that
 * `contact.service.ts` stores, with a status workflow and a recorded response.
 */
import { z } from 'zod';
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { buildPagination, parsePagination } from '@/lib/utils/pagination';
import { writeActivityLog } from '@/lib/logger/activity-log';
import type { AuthUser } from '@/types/user';

export const ENQUIRY_STATUSES = ['New', 'In Progress', 'Responded', 'Closed', 'Spam'] as const;
export const ENQUIRY_TYPES = ['General', 'Demo Request', 'Sales', 'Support', 'Partnership', 'Careers'] as const;

export const enquiryUpdateSchema = z.object({
  status: z.enum(ENQUIRY_STATUSES).optional(),
  response: z.string().trim().max(5000).optional().nullable(),
  assigned_to: z.coerce.number().int().positive().optional().nullable(),
});

export interface EnquiryFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  enquiry_type?: string;
  sortBy?: string;
  sortDir?: string;
}

const SORTABLE = ['created_at', 'name', 'status', 'enquiry_type'];

export async function listEnquiries(filters: EnquiryFilters) {
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (filters.search) {
    where.push('(ce.name LIKE ? OR ce.email LIKE ? OR ce.company_name LIKE ? OR ce.subject LIKE ? OR ce.message LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term);
  }
  if (filters.status && (ENQUIRY_STATUSES as readonly string[]).includes(filters.status)) {
    where.push('ce.status = ?');
    params.push(filters.status);
  }
  if (filters.enquiry_type && (ENQUIRY_TYPES as readonly string[]).includes(filters.enquiry_type)) {
    where.push('ce.enquiry_type = ?');
    params.push(filters.enquiry_type);
  }

  const { page, limit, offset } = parsePagination({ page: filters.page, limit: filters.limit });
  const sortBy = SORTABLE.includes(filters.sortBy ?? '') ? filters.sortBy : 'created_at';
  const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';
  const whereSql = where.join(' AND ');

  const [totalRow, rows, statRows] = await Promise.all([
    queryOne<RowDataPacket>(`SELECT COUNT(*) AS total FROM contact_enquiries ce WHERE ${whereSql}`, params),
    query<RowDataPacket>(
      `SELECT ce.id, ce.name, ce.email, ce.mobile, ce.company_name, ce.subject, ce.enquiry_type, ce.status,
              ce.created_at, ce.responded_at,
              CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_name
         FROM contact_enquiries ce
         LEFT JOIN users u ON u.id = ce.assigned_to
        WHERE ${whereSql}
        ORDER BY ce.${sortBy} ${sortDir}
        LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    query<RowDataPacket>('SELECT status, COUNT(*) AS total FROM contact_enquiries GROUP BY status'),
  ]);

  const stats: Record<string, number> = { total: 0 };
  for (const row of statRows) {
    stats[String(row.status)] = Number(row.total);
    stats.total += Number(row.total);
  }
  return { data: rows, pagination: buildPagination(Number(totalRow?.total ?? 0), page, limit), stats };
}

export async function getEnquiry(id: number) {
  return queryOne<RowDataPacket>(
    `SELECT ce.*, CONCAT_WS(' ', u.first_name, u.last_name) AS assigned_name
       FROM contact_enquiries ce
       LEFT JOIN users u ON u.id = ce.assigned_to
      WHERE ce.id = ?`,
    [id]
  );
}

export async function updateEnquiry(id: number, input: unknown, actor: { user: AuthUser; ip?: string | null }) {
  const data = enquiryUpdateSchema.parse(input);
  const existing = await getEnquiry(id);
  if (!existing) return null;

  const sets: string[] = [];
  const params: unknown[] = [];
  if (data.status !== undefined) { sets.push('status = ?'); params.push(data.status); }
  if (data.response !== undefined) {
    sets.push('response = ?');
    params.push(data.response || null);
  }
  if (data.assigned_to !== undefined) { sets.push('assigned_to = ?'); params.push(data.assigned_to); }
  // Writing a response or closing the loop stamps when the enquiry was answered.
  if ((data.response && data.response !== existing.response) || data.status === 'Responded') {
    sets.push('responded_at = COALESCE(responded_at, NOW())');
  }
  if (sets.length === 0) return existing;

  await execute(`UPDATE contact_enquiries SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    action: 'update', module: 'contact_enquiry', entityType: 'contact_enquiry', entityId: id, entityLabel: String(existing.subject ?? ''),
    description: `Enquiry #${id} updated${data.status ? ` — status ${data.status}` : ''}`,
    oldValues: { status: existing.status, response: existing.response },
    newValues: { status: data.status ?? existing.status, response: data.response ?? existing.response },
    ipAddress: actor.ip ?? null,
  });
  return getEnquiry(id);
}
