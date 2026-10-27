/**
 * Act library: the Chapters, Sections and Sub Sections under an Act (compliance_acts), each with its Explain text and Amendments.
 * Administrators maintain them; auditors search them to pick the requirement a CAPAR finding falls under.
 *
 * Nesting: a Chapter has no parent; a Section sits under a Chapter (or directly under the Act); a Sub Section sits under a Section.
 */
import { z } from 'zod';
import { execute, query, queryOne, transaction, type PoolConnection, type RowDataPacket } from '@/lib/db/mysql';

function fail(message: string, code: string, extra: Record<string, unknown> = {}): never {
  throw Object.assign(new Error(message), { code, ...extra });
}
const invalid = (field: string, message: string): never => fail('Validation failed. Please correct the highlighted fields.', 'VALIDATION_FAILED', { issues: [{ field, message }] });

export const PROVISION_KINDS = ['Chapter', 'Section', 'Sub Section'] as const;
const clean = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const provisionSchema = z.object({
  kind: z.enum(PROVISION_KINDS),
  parent_id: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive().nullable()).default(null),
  number: clean(40),
  title: z.string().trim().min(2, 'Give it a title').max(500),
  explanation: clean(60000),
  sort_order: z.coerce.number().int().min(0).max(1000000).optional(),
  status: z.enum(['active', 'repealed', 'omitted']).default('active'),
  amendments: z.array(z.object({
    amended_on: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date'), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
    reference: clean(255),
    description: z.string().trim().min(2, 'Describe the amendment').max(4000),
  })).max(100).default([]),
});

export interface ProvisionNode {
  id: number; act_id: number; parent_id: number | null; kind: string; number: string | null; title: string; explanation: string | null;
  sort_order: number; status: string; amendments: { id: number; amended_on: string | null; reference: string | null; description: string }[]; children: ProvisionNode[];
}

async function requireAct(actId: number) {
  const act = await queryOne<RowDataPacket>('SELECT id, act_name, short_name, act_year FROM compliance_acts WHERE id = ? AND deleted_at IS NULL', [actId]);
  if (!act) fail('Act not found', 'NOT_FOUND');
  return act!;
}

async function amendmentsFor(ids: number[]) {
  if (!ids.length) return new Map<number, ProvisionNode['amendments']>();
  const rows = await query<RowDataPacket>(
    `SELECT id, provision_id, amended_on, reference, description FROM act_provision_amendments WHERE provision_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`, ids);
  const map = new Map<number, ProvisionNode['amendments']>();
  for (const row of rows) {
    const list = map.get(Number(row.provision_id)) ?? [];
    list.push({ id: Number(row.id), amended_on: row.amended_on ? String(row.amended_on).slice(0, 10) : null, reference: row.reference ?? null, description: String(row.description) });
    map.set(Number(row.provision_id), list);
  }
  return map;
}

/** The whole tree of one Act. */
export async function actTree(actId: number) {
  const act = await requireAct(actId);
  const rows = await query<RowDataPacket>(
    'SELECT id, act_id, parent_id, kind, number, title, explanation, sort_order, status FROM act_provisions WHERE act_id = ? AND deleted_at IS NULL ORDER BY sort_order, id', [actId]);
  const amendments = await amendmentsFor(rows.map((r) => Number(r.id)));
  const nodes = new Map<number, ProvisionNode>();
  for (const r of rows) {
    nodes.set(Number(r.id), { id: Number(r.id), act_id: actId, parent_id: r.parent_id === null ? null : Number(r.parent_id), kind: String(r.kind), number: r.number ?? null, title: String(r.title),
      explanation: r.explanation ?? null, sort_order: Number(r.sort_order), status: String(r.status), amendments: amendments.get(Number(r.id)) ?? [], children: [] });
  }
  const roots: ProvisionNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : null;
    (parent ? parent.children : roots).push(node);
  }
  return { act: { id: Number(act.id), act_name: String(act.act_name), short_name: act.short_name ?? null, act_year: act.act_year ?? null }, tree: roots, total: nodes.size };
}

async function checkParent(actId: number, kind: string, parentId: number | null, selfId?: number) {
  if (kind === 'Chapter') {
    if (parentId) invalid('parent_id', 'A chapter sits directly under the Act');
    return;
  }
  if (kind === 'Sub Section' && !parentId) invalid('parent_id', 'Choose the section this sub section belongs to');
  if (!parentId) return;
  if (selfId && parentId === selfId) invalid('parent_id', 'A provision cannot sit under itself');
  const parent = await queryOne<RowDataPacket>('SELECT id, kind, act_id FROM act_provisions WHERE id = ? AND deleted_at IS NULL', [parentId]);
  if (!parent || Number(parent.act_id) !== actId) invalid('parent_id', 'That parent is not in this Act');
  const expected = kind === 'Section' ? 'Chapter' : 'Section';
  if (parent!.kind !== expected) invalid('parent_id', `A ${kind.toLowerCase()} sits under a ${expected.toLowerCase()}`);
}

async function writeAmendments(provisionId: number, list: z.infer<typeof provisionSchema>['amendments'], conn: PoolConnection) {
  const run = (sql: string, params: unknown[]) => conn.execute(sql, params as never);
  await run('DELETE FROM act_provision_amendments WHERE provision_id = ?', [provisionId]);
  for (let i = 0; i < list.length; i++) {
    await run('INSERT INTO act_provision_amendments (provision_id, amended_on, reference, description, sort_order) VALUES (?, ?, ?, ?, ?)',
      [provisionId, list[i].amended_on, list[i].reference, list[i].description, i]);
  }
}

export async function createProvision(actId: number, payload: unknown, userId: number) {
  await requireAct(actId);
  const input = provisionSchema.parse(payload);
  await checkParent(actId, input.kind, input.parent_id);
  return transaction(async (conn) => {
    const run = (sql: string, params: unknown[]) => conn.execute(sql, params as never);
    const sibling = await queryOne<RowDataPacket>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM act_provisions WHERE act_id = ? AND parent_id <=> ? AND deleted_at IS NULL', [actId, input.parent_id]);
    const result = await run(
      'INSERT INTO act_provisions (act_id, parent_id, kind, number, title, explanation, sort_order, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [actId, input.parent_id, input.kind, input.number, input.title, input.explanation, input.sort_order ?? Number(sibling?.m ?? 0) + 10, input.status, userId]);
    const id = Number((result[0] as unknown as { insertId: number }).insertId);
    await writeAmendments(id, input.amendments, conn);
    return { id };
  });
}

export async function updateProvision(actId: number, id: number, payload: unknown) {
  const existing = await queryOne<RowDataPacket>('SELECT id FROM act_provisions WHERE id = ? AND act_id = ? AND deleted_at IS NULL', [id, actId]);
  if (!existing) fail('Provision not found', 'NOT_FOUND');
  const input = provisionSchema.parse(payload);
  await checkParent(actId, input.kind, input.parent_id, id);
  // A provision cannot be moved under one of its own descendants.
  if (input.parent_id) {
    let cursor: number | null = input.parent_id;
    for (let hops = 0; cursor && hops < 10; hops++) {
      if (cursor === id) invalid('parent_id', 'A provision cannot sit under its own descendant');
      cursor = Number((await queryOne<RowDataPacket>('SELECT parent_id FROM act_provisions WHERE id = ?', [cursor]))?.parent_id ?? 0) || null;
    }
  }
  await transaction(async (conn) => {
    await conn.execute('UPDATE act_provisions SET parent_id = ?, kind = ?, number = ?, title = ?, explanation = ?, sort_order = COALESCE(?, sort_order), status = ? WHERE id = ?',
      [input.parent_id, input.kind, input.number, input.title, input.explanation, input.sort_order ?? null, input.status, id] as never);
    await writeAmendments(id, input.amendments, conn);
  });
  return { id };
}

/** Removes the provision and everything beneath it. */
export async function deleteProvision(actId: number, id: number) {
  const existing = await queryOne<RowDataPacket>('SELECT id FROM act_provisions WHERE id = ? AND act_id = ? AND deleted_at IS NULL', [id, actId]);
  if (!existing) fail('Provision not found', 'NOT_FOUND');
  const removed = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS c FROM act_provisions WHERE act_id = ? AND deleted_at IS NULL AND (id = ? OR parent_id = ? OR parent_id IN (SELECT id FROM (SELECT id FROM act_provisions WHERE parent_id = ?) x))`, [actId, id, id, id]);
  await execute('DELETE FROM act_provisions WHERE id = ?', [id]);
  return { id, removed: Number(removed?.c ?? 1) };
}

/** Auditor search: provisions whose title, number or explanation match, each with its path (Act > Chapter > Section) and the text to quote. */
export async function searchProvisions(term: string, actId?: number) {
  const q = term.trim();
  const where = ['p.deleted_at IS NULL', "a.deleted_at IS NULL", "p.status = 'active'"];
  const params: unknown[] = [];
  if (actId) { where.push('p.act_id = ?'); params.push(actId); }
  if (q) { where.push('(p.title LIKE ? OR p.number LIKE ? OR p.explanation LIKE ? OR a.act_name LIKE ? OR a.short_name LIKE ?)'); params.push(...Array(5).fill(`%${q}%`)); }
  const rows = await query<RowDataPacket>(
    `SELECT p.id, p.act_id, p.kind, p.number, p.title, p.explanation, p.parent_id, a.act_name, a.short_name, a.act_year,
            pp.kind AS parent_kind, pp.number AS parent_number, pp.title AS parent_title, pp.parent_id AS grand_id
       FROM act_provisions p JOIN compliance_acts a ON a.id = p.act_id LEFT JOIN act_provisions pp ON pp.id = p.parent_id
      WHERE ${where.join(' AND ')} ORDER BY a.act_name, p.sort_order, p.id LIMIT 30`, params);
  const grandIds = [...new Set(rows.map((r) => Number(r.grand_id ?? 0)).filter(Boolean))];
  const grands = new Map<number, RowDataPacket>();
  if (grandIds.length) for (const g of await query<RowDataPacket>(`SELECT id, kind, number, title FROM act_provisions WHERE id IN (${grandIds.map(() => '?').join(',')})`, grandIds)) grands.set(Number(g.id), g);
  const name = (kind: unknown, number: unknown, title?: unknown) => [kind, number].filter(Boolean).join(' ') + (title ? ` - ${title}` : '');
  const amendments = await amendmentsFor(rows.map((r) => Number(r.id)));
  return rows.map((r) => {
    const grand = r.grand_id ? grands.get(Number(r.grand_id)) : null;
    const path = [
      [r.short_name || r.act_name, r.act_year].filter(Boolean).join(' '),
      grand ? name(grand.kind, grand.number) : null,
      r.parent_id ? name(r.parent_kind, r.parent_number) : null,
      name(r.kind, r.number),
    ].filter(Boolean) as string[];
    return { id: Number(r.id), act_id: Number(r.act_id), kind: String(r.kind), title: String(r.title), explanation: r.explanation ?? null, path, label: path.join(' > '),
      amendments: (amendments.get(Number(r.id)) ?? []).map((a) => [a.amended_on, a.reference, a.description].filter(Boolean).join(' - ')) };
  });
}
