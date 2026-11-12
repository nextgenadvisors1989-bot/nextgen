/**
 * Reading side of the Act library (Acts with their Chapters, Sections, Sub Sections, Schedules and Amendments), for the public website and the auditor panel.
 * The audience decides which Acts are visible: the public sees active Acts an administrator has not hidden; an auditor sees every active or amended Act.
 * An Act is read one chapter (or schedule) at a time, so even the Tamil Nadu Factories Rules (hundreds of pages) open quickly.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { htmlToPlain } from '@/lib/utils/sanitize-html';
import type { ActAudience, LibraryAct, ReaderAmendment, ReaderData, ReaderHit, ReaderPart, ReaderProvision } from '@/types/acts';

const VISIBLE = (audience: ActAudience, alias = 'a') =>
  `${alias}.deleted_at IS NULL AND ${alias}.status IN ('active', 'amended')${audience === 'public' ? ` AND ${alias}.show_on_public = 1` : ''}`;

const date = (value: unknown) => (value ? String(value).slice(0, 10) : null);

/** Acts that have a text to read (at least one section). */
export async function listLibraryActs(audience: ActAudience, filters: { search?: string; limit?: number } = {}): Promise<LibraryAct[]> {
  const params: unknown[] = [];
  let search = '';
  if (filters.search?.trim()) {
    search = ' AND (a.act_name LIKE ? OR a.short_name LIKE ? OR a.act_number LIKE ? OR a.subtitle LIKE ?)';
    params.push(...Array(4).fill(`%${filters.search.trim()}%`));
  }
  const rows = await query<RowDataPacket>(
    `SELECT a.id, a.act_name, a.short_name, a.subtitle, a.act_number, a.act_year, a.jurisdiction, a.state_name, a.summary,
            (SELECT COUNT(*) FROM act_provisions p WHERE p.act_id = a.id AND p.deleted_at IS NULL AND p.kind IN ('Chapter', 'Schedule')) AS part_count,
            (SELECT COUNT(*) FROM act_provisions p WHERE p.act_id = a.id AND p.deleted_at IS NULL AND p.kind = 'Section') AS section_count
       FROM compliance_acts a
      WHERE ${VISIBLE(audience)}${search}
     HAVING section_count > 0
      ORDER BY a.act_name ASC
      LIMIT ${Math.min(filters.limit ?? 200, 500)}`, params);
  return rows.map((r) => ({
    id: Number(r.id), act_name: String(r.act_name), short_name: r.short_name ?? null, subtitle: r.subtitle ?? null, act_number: r.act_number ?? null,
    act_year: r.act_year === null ? null : Number(r.act_year), jurisdiction: String(r.jurisdiction), state_name: r.state_name ?? null, summary: r.summary ?? null,
    part_count: Number(r.part_count), section_count: Number(r.section_count),
  }));
}

async function amendmentsFor(ids: number[]): Promise<Map<number, ReaderAmendment[]>> {
  const map = new Map<number, ReaderAmendment[]>();
  if (!ids.length) return map;
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = await query<RowDataPacket>(
      `SELECT provision_id, amended_on, reference, description FROM act_provision_amendments WHERE provision_id IN (${chunk.map(() => '?').join(',')}) ORDER BY sort_order, id`, chunk);
    for (const row of rows) {
      const list = map.get(Number(row.provision_id)) ?? [];
      list.push({ amended_on: date(row.amended_on), reference: row.reference ?? null, description: String(row.description) });
      map.set(Number(row.provision_id), list);
    }
  }
  return map;
}

/** Chapters and schedules in order, each with its sections; sections that sit directly under the Act are gathered in one group (id 0) where the first of them stands. */
function buildParts(rows: RowDataPacket[]): ReaderPart[] {
  const top = rows.filter((r) => r.parent_id === null);
  const kids = new Map<number, RowDataPacket[]>();
  for (const r of rows) if (r.parent_id !== null) (kids.get(Number(r.parent_id)) ?? kids.set(Number(r.parent_id), []).get(Number(r.parent_id))!).push(r);
  const parts: ReaderPart[] = [];
  let loose: ReaderPart | null = null;
  const brief = (r: RowDataPacket) => ({ id: Number(r.id), number: r.number ?? null, title: String(r.title), status: String(r.status) });
  for (const r of top) {
    if (r.kind === 'Section') {
      if (!loose) { loose = { id: 0, kind: 'Act', number: null, title: 'Sections', sections: [] }; parts.push(loose); }
      loose.sections.push(brief(r));
    } else {
      parts.push({ id: Number(r.id), kind: r.kind === 'Schedule' ? 'Schedule' : 'Chapter', number: r.number ?? null, title: String(r.title), sections: (kids.get(Number(r.id)) ?? []).filter((k) => k.kind === 'Section').map(brief) });
    }
  }
  return parts;
}

async function provisionsOf(actId: number, part: ReaderPart): Promise<ReaderProvision[]> {
  const sectionIds = part.sections.map((s) => s.id);
  if (!sectionIds.length) return [];
  const rows: RowDataPacket[] = [];
  for (let i = 0; i < sectionIds.length; i += 500) {
    const chunk = sectionIds.slice(i, i + 500);
    rows.push(...await query<RowDataPacket>(
      `SELECT id, parent_id, kind, number, title, status, body_html, explanation, sort_order FROM act_provisions
        WHERE act_id = ? AND deleted_at IS NULL AND (id IN (${chunk.map(() => '?').join(',')}) OR parent_id IN (${chunk.map(() => '?').join(',')}))
        ORDER BY sort_order, id`, [actId, ...chunk, ...chunk]));
  }
  const amendments = await amendmentsFor(rows.map((r) => Number(r.id)));
  const node = (r: RowDataPacket): ReaderProvision => ({
    id: Number(r.id), kind: String(r.kind), number: r.number ?? null, title: String(r.title), status: String(r.status), body_html: r.body_html ?? null,
    explanation: r.explanation ?? null, amendments: amendments.get(Number(r.id)) ?? [], children: [],
  });
  const byId = new Map<number, ReaderProvision>();
  for (const r of rows) byId.set(Number(r.id), node(r));
  const out: ReaderProvision[] = [];
  const order = new Map(sectionIds.map((id, i) => [id, i]));
  for (const r of rows) {
    const me = byId.get(Number(r.id)) as ReaderProvision;
    if (r.kind === 'Section') out.push(me);
    else if (r.parent_id !== null) byId.get(Number(r.parent_id))?.children.push(me);
  }
  return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** The text written on the chapter or schedule itself, with its notes (null when it has none). */
async function partIntro(actId: number, part: ReaderPart): Promise<ReaderProvision | null> {
  if (part.id === 0) return null;
  const row = await queryOne<RowDataPacket>('SELECT id, kind, number, title, status, body_html, explanation FROM act_provisions WHERE id = ? AND act_id = ? AND deleted_at IS NULL', [part.id, actId]);
  if (!row) return null;
  const amendments = (await amendmentsFor([part.id])).get(part.id) ?? [];
  if (!row.body_html && !row.explanation && !amendments.length) return null;
  return { id: part.id, kind: String(row.kind), number: row.number ?? null, title: String(row.title), status: String(row.status), body_html: row.body_html ?? null, explanation: row.explanation ?? null, amendments, children: [] };
}

async function searchAct(actId: number, term: string): Promise<ReaderHit[]> {
  const like = `%${term}%`;
  const rows = await query<RowDataPacket>(
    `SELECT p.id, p.kind, p.number, p.title, p.explanation,
            CASE p.kind WHEN 'Chapter' THEN p.id WHEN 'Schedule' THEN p.id WHEN 'Section' THEN COALESCE(p1.id, 0) ELSE COALESCE(p2.id, 0) END AS part_id
       FROM act_provisions p
       LEFT JOIN act_provisions p1 ON p1.id = p.parent_id
       LEFT JOIN act_provisions p2 ON p2.id = p1.parent_id
      WHERE p.act_id = ? AND p.deleted_at IS NULL AND (p.title LIKE ? OR p.number = ? OR p.explanation LIKE ?)
      ORDER BY p.sort_order, p.id LIMIT 60`, [actId, like, term, like]);
  const lower = term.toLowerCase();
  return rows.map((r) => {
    const text = htmlToPlain(r.explanation ?? '');
    const at = text.toLowerCase().indexOf(lower);
    const snippet = at < 0 ? text.slice(0, 160) : `${at > 60 ? '…' : ''}${text.slice(Math.max(0, at - 60), at + term.length + 100)}…`;
    return { id: Number(r.id), kind: String(r.kind), number: r.number ?? null, title: String(r.title), snippet: snippet.replace(/\s+/g, ' ').trim(), part_id: Number(r.part_id) };
  });
}

/** One Act for reading: the arrangement of its chapters and sections, one chapter (or schedule) in full, or the hits of a search. Null when the audience may not see it. */
export async function readAct(actId: number, audience: ActAudience, options: { part?: number | null; q?: string; outline?: boolean } = {}): Promise<ReaderData | null> {
  const act = await queryOne<RowDataPacket>(
    `SELECT a.id, a.act_name, a.short_name, a.subtitle, a.act_number, a.act_year, a.jurisdiction, a.state_name, a.ministry, a.department, a.effective_date,
            a.last_amended_date, a.summary, a.official_source_url
       FROM compliance_acts a WHERE a.id = ? AND ${VISIBLE(audience)}`, [actId]);
  if (!act) return null;
  const rows = await query<RowDataPacket>(
    `SELECT id, parent_id, kind, number, title, status, sort_order FROM act_provisions
      WHERE act_id = ? AND deleted_at IS NULL AND kind IN ('Chapter', 'Schedule', 'Section') ORDER BY sort_order, id`, [actId]);
  const parts = buildParts(rows);
  const q = (options.q ?? '').trim().slice(0, 120);
  const index = options.part === null || options.part === undefined ? 0 : Math.max(0, parts.findIndex((p) => p.id === options.part));
  const part = parts[index] ?? null;
  return {
    act: {
      id: Number(act.id), act_name: String(act.act_name), short_name: act.short_name ?? null, subtitle: act.subtitle ?? null, act_number: act.act_number ?? null,
      act_year: act.act_year === null ? null : Number(act.act_year), jurisdiction: String(act.jurisdiction), state_name: act.state_name ?? null, ministry: act.ministry ?? null,
      department: act.department ?? null, effective_date: date(act.effective_date), last_amended_date: date(act.last_amended_date), summary: act.summary ?? null,
      official_source_url: act.official_source_url ?? null,
    },
    parts,
    selected: part ? { part, intro: options.outline ? null : await partIntro(actId, part), provisions: options.outline ? [] : await provisionsOf(actId, part), previous: index > 0 ? parts[index - 1].id : null, next: index < parts.length - 1 ? parts[index + 1].id : null } : null,
    totals: { parts: parts.filter((p) => p.id !== 0).length, sections: parts.reduce((n, p) => n + p.sections.length, 0) },
    hits: q.length >= 2 ? await searchAct(actId, q) : null,
    query: q,
  };
}
