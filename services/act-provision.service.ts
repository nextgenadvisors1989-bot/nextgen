/**
 * Act library: the Chapters, Sections and Sub Sections under an Act (compliance_acts), each with its Explain text and Amendments.
 * Administrators maintain them; auditors search them to pick the requirement a CAPAR finding falls under.
 *
 * Nesting: a Chapter or a Schedule has no parent; a Section sits under a Chapter or a Schedule (or directly under the Act); a Sub Section sits under a Section.
 * The text of a provision is written in the Word-style editor: `body_html` (sanitised) is what the readers show, `explanation` keeps its plain text for search.
 */
import { z } from 'zod';
import { execute, query, queryOne, transaction, type PoolConnection, type RowDataPacket } from '@/lib/db/mysql';
import { htmlToPlain, sanitizeActHtml } from '@/lib/utils/sanitize-html';

function fail(message: string, code: string, extra: Record<string, unknown> = {}): never {
  throw Object.assign(new Error(message), { code, ...extra });
}
const invalid = (field: string, message: string): never => fail('Validation failed. Please correct the highlighted fields.', 'VALIDATION_FAILED', { issues: [{ field, message }] });

export const PROVISION_KINDS = ['Chapter', 'Section', 'Sub Section', 'Schedule'] as const;
const TOP_LEVEL = ['Chapter', 'Schedule'];
const clean = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const provisionSchema = z.object({
  kind: z.enum(PROVISION_KINDS),
  parent_id: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive().nullable()).default(null),
  number: clean(40),
  title: z.string().trim().min(2, 'Give it a title').max(500),
  explanation: clean(60000),
  // undefined = leave the stored text alone (an older caller that only knows `explanation`); null or '' = clear it
  body_html: z.string().max(900000).optional().nullable().transform((v) => (v === undefined ? undefined : v === null ? null : sanitizeActHtml(v) || null)),
  sort_order: z.coerce.number().int().min(0).max(1000000).optional(),
  status: z.enum(['active', 'repealed', 'omitted']).default('active'),
  amendments: z.array(z.object({
    amended_on: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date'), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
    reference: clean(255),
    description: z.string().trim().min(2, 'Describe the amendment').max(4000),
  })).max(100).default([]),
});

export interface ProvisionNode {
  id: number; act_id: number; parent_id: number | null; kind: string; number: string | null; title: string; explanation: string | null; body_html: string | null; has_body: boolean;
  sort_order: number; status: string; amendments: { id: number; amended_on: string | null; reference: string | null; description: string }[]; children: ProvisionNode[];
}

async function requireAct(actId: number) {
  const act = await queryOne<RowDataPacket>('SELECT id, act_name, short_name, subtitle, act_number, act_year, status, show_on_public FROM compliance_acts WHERE id = ? AND deleted_at IS NULL', [actId]);
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

function toNode(r: RowDataPacket, actId: number, amendments: Map<number, ProvisionNode['amendments']>, bodies: boolean): ProvisionNode {
  return { id: Number(r.id), act_id: actId, parent_id: r.parent_id === null ? null : Number(r.parent_id), kind: String(r.kind), number: r.number ?? null, title: String(r.title),
    explanation: bodies ? r.explanation ?? null : null, body_html: bodies ? r.body_html ?? null : null, has_body: Boolean(Number(r.has_body ?? (r.body_html || r.explanation ? 1 : 0))),
    sort_order: Number(r.sort_order), status: String(r.status), amendments: amendments.get(Number(r.id)) ?? [], children: [] };
}

/** The whole tree of one Act. Without `bodies` the texts are left out (the builder loads a text only when it is opened), so a long Act stays light. */
export async function actTree(actId: number, options: { bodies?: boolean } = {}) {
  const act = await requireAct(actId);
  const bodies = Boolean(options.bodies);
  const rows = await query<RowDataPacket>(
    `SELECT id, act_id, parent_id, kind, number, title, ${bodies ? 'explanation, body_html,' : ''} ((body_html IS NOT NULL AND body_html <> '') OR (explanation IS NOT NULL AND explanation <> '')) AS has_body, sort_order, status
       FROM act_provisions WHERE act_id = ? AND deleted_at IS NULL ORDER BY sort_order, id`, [actId]);
  const amendments = bodies ? await amendmentsFor(rows.map((r) => Number(r.id))) : new Map<number, ProvisionNode['amendments']>();
  const nodes = new Map<number, ProvisionNode>();
  for (const r of rows) nodes.set(Number(r.id), toNode(r, actId, amendments, bodies));
  const roots: ProvisionNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : null;
    (parent ? parent.children : roots).push(node);
  }
  return {
    act: { id: Number(act.id), act_name: String(act.act_name), short_name: act.short_name ?? null, subtitle: act.subtitle ?? null, act_number: act.act_number ?? null, act_year: act.act_year ?? null,
      status: String(act.status), show_on_public: Boolean(Number(act.show_on_public)) },
    tree: roots, total: nodes.size,
  };
}

/** One provision with its text and its amendments. */
export async function getProvision(actId: number, id: number) {
  const row = await queryOne<RowDataPacket>(
    `SELECT id, act_id, parent_id, kind, number, title, explanation, body_html, sort_order, status FROM act_provisions WHERE id = ? AND act_id = ? AND deleted_at IS NULL`, [id, actId]);
  if (!row) fail('Provision not found', 'NOT_FOUND');
  const amendments = await amendmentsFor([id]);
  const node = toNode(row!, actId, amendments, true);
  node.has_body = Boolean(node.body_html || node.explanation);
  return node;
}

/** What may sit under what: Chapter and Schedule at the top; a Section under a Chapter, a Schedule or the Act; a Sub Section under a Section. */
function parentRule(kind: string): { top: boolean; parents: string[] } {
  if (TOP_LEVEL.includes(kind)) return { top: true, parents: [] };
  if (kind === 'Section') return { top: true, parents: TOP_LEVEL };
  return { top: false, parents: ['Section'] };
}

async function checkParent(actId: number, kind: string, parentId: number | null, selfId?: number) {
  const rule = parentRule(kind);
  if (TOP_LEVEL.includes(kind)) {
    if (parentId) invalid('parent_id', `A ${kind.toLowerCase()} sits directly under the Act`);
    return;
  }
  if (!rule.top && !parentId) invalid('parent_id', 'Choose the section this sub section belongs to');
  if (!parentId) return;
  if (selfId && parentId === selfId) invalid('parent_id', 'A provision cannot sit under itself');
  const parent = await queryOne<RowDataPacket>('SELECT id, kind, act_id FROM act_provisions WHERE id = ? AND deleted_at IS NULL', [parentId]);
  if (!parent || Number(parent.act_id) !== actId) invalid('parent_id', 'That parent is not in this Act');
  if (!rule.parents.includes(String(parent!.kind))) invalid('parent_id', `A ${kind.toLowerCase()} sits under a ${rule.parents.join(' or ').toLowerCase()}`);
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
    const body = input.body_html ?? null;
    const explanation = body ? htmlToPlain(body, 60000) || null : input.explanation;
    const result = await run(
      'INSERT INTO act_provisions (act_id, parent_id, kind, number, title, explanation, body_html, sort_order, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [actId, input.parent_id, input.kind, input.number, input.title, explanation, body, input.sort_order ?? Number(sibling?.m ?? 0) + 10, input.status, userId]);
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
    // a text written in the editor is stored as HTML, with its plain text beside it for the searches; an older caller that sends only `explanation` keeps the HTML as it was
    const writesBody = input.body_html !== undefined;
    const body = writesBody ? input.body_html ?? null : null;
    const explanation = writesBody ? (body ? htmlToPlain(body, 60000) || null : null) : input.explanation;
    await conn.execute(
      `UPDATE act_provisions SET parent_id = ?, kind = ?, number = ?, title = ?, explanation = ?, ${writesBody ? 'body_html = ?,' : ''} sort_order = COALESCE(?, sort_order), status = ? WHERE id = ?`,
      [input.parent_id, input.kind, input.number, input.title, explanation, ...(writesBody ? [body] : []), input.sort_order ?? null, input.status, id] as never);
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

/* ───────────────────────── typing many at once, and import ───────────────────────── */

const bulkNodeSchema = provisionSchema.omit({ parent_id: true, sort_order: true });
const bulkInputSchema = z.object({
  parent_id: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive().nullable()).default(null),
  nodes: z.array(z.unknown()).min(1, 'Type at least one line').max(6000, 'At most 6000 at a time'),
});

/**
 * Adds many provisions in one go: a typed list of chapters, or of the sections of a chapter, or a whole imported Act (each node may carry `children`).
 * `parent_id` is the chapter, schedule or section the new nodes go under (empty = directly under the Act). All or nothing.
 */
export async function bulkCreateProvisions(actId: number, payload: unknown, userId: number) {
  await requireAct(actId);
  const input = bulkInputSchema.parse(payload);
  let parentKind: string | null = null;
  if (input.parent_id) {
    const parent = await queryOne<RowDataPacket>('SELECT kind, act_id FROM act_provisions WHERE id = ? AND deleted_at IS NULL', [input.parent_id]);
    if (!parent || Number(parent.act_id) !== actId) invalid('parent_id', 'That parent is not in this Act');
    parentKind = String(parent!.kind);
  }
  type Parsed = { data: z.infer<typeof bulkNodeSchema>; children: Parsed[] };
  let count = 0;
  const parse = (raw: unknown, parent: string | null, path: string): Parsed => {
    if (!raw || typeof raw !== 'object') invalid(path, 'Not a provision');
    const node = raw as Record<string, unknown>;
    const result = bulkNodeSchema.safeParse(node);
    if (!result.success) invalid(path, result.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; '));
    const data = (result as { success: true; data: z.infer<typeof bulkNodeSchema> }).data;
    const rule = parentRule(data.kind);
    if (parent === null ? !rule.top : !rule.parents.includes(parent)) invalid(path, parent === null ? `A ${data.kind.toLowerCase()} cannot sit directly under the Act` : `A ${data.kind.toLowerCase()} cannot sit under a ${parent.toLowerCase()}`);
    count += 1;
    if (count > 6000) invalid(path, 'At most 6000 at a time');
    const kids = Array.isArray(node.children) ? node.children : [];
    return { data, children: kids.map((kid, i) => parse(kid, data.kind, `${path}.children[${i}]`)) };
  };
  const parsed = input.nodes.map((n, i) => parse(n, parentKind, `nodes[${i}]`));

  return transaction(async (conn) => {
    const run = (sql: string, params: unknown[]) => conn.execute(sql, params as never);
    const next = new Map<string, number>();
    const nextOrder = async (parentId: number | null) => {
      const key = String(parentId ?? 'root');
      if (!next.has(key)) {
        const [rows] = await run('SELECT COALESCE(MAX(sort_order), 0) AS m FROM act_provisions WHERE act_id = ? AND parent_id <=> ? AND deleted_at IS NULL', [actId, parentId]);
        next.set(key, Number((rows as unknown as RowDataPacket[])[0]?.m ?? 0));
      }
      next.set(key, (next.get(key) ?? 0) + 10);
      return next.get(key) as number;
    };
    let created = 0;
    const insertNode = async (node: Parsed, parentId: number | null): Promise<number> => {
      const d = node.data;
      const body = d.body_html ?? null;
      const explanation = body ? htmlToPlain(body, 60000) || null : d.explanation;
      const result = await run(
        'INSERT INTO act_provisions (act_id, parent_id, kind, number, title, explanation, body_html, sort_order, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [actId, parentId, d.kind, d.number, d.title, explanation, body, await nextOrder(parentId), d.status, userId]);
      const id = Number((result[0] as unknown as { insertId: number }).insertId);
      created += 1;
      await writeAmendments(id, d.amendments, conn);
      for (const child of node.children) await insertNode(child, id);
      return id;
    };
    const ids: number[] = [];
    for (const node of parsed) ids.push(await insertNode(node, input.parent_id));
    return { created, ids };
  });
}

/** Puts the given provisions (all under the same parent) in the given order. */
export async function reorderProvisions(actId: number, payload: unknown) {
  const input = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1).max(5000) }).parse(payload);
  const rows = await query<RowDataPacket>(
    `SELECT id, parent_id FROM act_provisions WHERE act_id = ? AND deleted_at IS NULL AND id IN (${input.ids.map(() => '?').join(',')})`, [actId, ...input.ids]);
  if (rows.length !== new Set(input.ids).size) invalid('ids', 'Some of these are not in this Act');
  if (new Set(rows.map((r) => String(r.parent_id ?? 'root'))).size > 1) invalid('ids', 'Only provisions under the same parent can be put in order');
  await transaction(async (conn) => {
    for (let i = 0; i < input.ids.length; i++) await conn.execute('UPDATE act_provisions SET sort_order = ? WHERE id = ?', [(i + 1) * 10, input.ids[i]] as never);
  });
  return { ordered: input.ids.length };
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
