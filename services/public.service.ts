/**
 * Read-only data used by the public website. Everything here is deliberately
 * aggregate or explicitly published content — never internal records.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';

export interface PublicStatistics {
  totalEmployers: number;
  totalEmployees: number;
  completedAudits: number;
  complianceDocuments: number;
  statesCovered: number;
}

export async function getPublicStatistics(): Promise<PublicStatistics> {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM employers WHERE deleted_at IS NULL) AS totalEmployers,
       (SELECT COUNT(*) FROM employees WHERE deleted_at IS NULL) AS totalEmployees,
       (SELECT COUNT(*) FROM audit_assignments WHERE deleted_at IS NULL AND status = 'Approved') AS completedAudits,
       (SELECT COUNT(*) FROM compliance_documents WHERE deleted_at IS NULL) AS complianceDocuments,
       (SELECT COUNT(DISTINCT state) FROM employers WHERE deleted_at IS NULL AND state IS NOT NULL) AS statesCovered`
  );

  return {
    totalEmployers: Number(row?.totalEmployers ?? 0),
    totalEmployees: Number(row?.totalEmployees ?? 0),
    completedAudits: Number(row?.completedAudits ?? 0),
    complianceDocuments: Number(row?.complianceDocuments ?? 0),
    statesCovered: Number(row?.statesCovered ?? 0),
  };
}

/** Acts and rules published on the public site. */
export async function listPublicActs(filters: { search?: string; state?: string; limit?: number } = {}) {
  const where = ["status = 'active'", 'deleted_at IS NULL'];
  const params: unknown[] = [];

  if (filters.search) {
    where.push('(act_name LIKE ? OR short_name LIKE ? OR act_number LIKE ? OR summary LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }
  if (filters.state && filters.state !== 'all') {
    where.push('(state_name = ? OR jurisdiction IN (?, ?))');
    params.push(filters.state, 'Central', 'Both');
  }

  return query<RowDataPacket>(
    `SELECT id, act_name, short_name, act_number, act_year, jurisdiction, state_name, ministry, department,
            effective_date, last_amended_date, applicability_criteria, industry_applicability, summary,
            official_source_url
       FROM compliance_acts
      WHERE ${where.join(' AND ')}
      ORDER BY act_name ASC
      LIMIT ${Math.min(filters.limit ?? 200, 500)}`,
    params
  );
}

export async function listActStates() {
  const rows = await query<RowDataPacket>(
    `SELECT DISTINCT state_name FROM compliance_acts
      WHERE deleted_at IS NULL AND status = 'active' AND state_name IS NOT NULL
      ORDER BY state_name ASC`
  );
  return rows.map((row) => String(row.state_name));
}

/** CMS-driven public content (pages flagged for publication). */
export async function listPublishedCmsPages(pageType: string, limit = 60) {
  return query<RowDataPacket>(
    `SELECT id, uuid, slug, title, subtitle, meta_description, hero_image, content_html, page_type,
            published_at, view_count
       FROM cms_pages
      WHERE page_type = ? AND status = 'published' AND deleted_at IS NULL
        AND (scheduled_at IS NULL OR scheduled_at <= NOW())
      ORDER BY published_at DESC
      LIMIT ${Math.min(limit, 200)}`,
    [pageType]
  );
}

export async function getPublishedCmsPage(slug: string) {
  return queryOne<RowDataPacket>(
    `SELECT * FROM cms_pages
      WHERE slug = ? AND status = 'published' AND deleted_at IS NULL
        AND (scheduled_at IS NULL OR scheduled_at <= NOW())
      LIMIT 1`,
    [slug]
  );
}

/** Aggregated audit outcomes shown on the public reports page. */
export async function getPublishedAuditOutcomes() {
  const [totals] = await query<RowDataPacket>(
    `SELECT
       COUNT(*) AS totalReports,
       SUM(status = 'Approved') AS approvedReports,
       AVG(NULLIF(score_percentage, 0)) AS averageScore,
       MAX(approved_at) AS latestApproval
     FROM audit_reports
     WHERE deleted_at IS NULL AND status = 'Approved'`
  );

  const byType = await query<RowDataPacket>(
    `SELECT COALESCE(report_type, 'Compliance') AS report_type,
            COUNT(*) AS total,
            AVG(NULLIF(score_percentage, 0)) AS average_score
       FROM audit_reports
      WHERE deleted_at IS NULL AND status = 'Approved'
      GROUP BY report_type
      ORDER BY total DESC
      LIMIT 10`
  );

  return {
    totalReports: Number(totals?.totalReports ?? 0),
    approvedReports: Number(totals?.approvedReports ?? 0),
    averageScore: totals?.averageScore === null || totals?.averageScore === undefined ? null : Number(totals.averageScore),
    latestApproval: (totals?.latestApproval as string | null) ?? null,
    byType: byType.map((row) => ({
      report_type: String(row.report_type),
      total: Number(row.total),
      average_score: row.average_score === null ? null : Number(row.average_score),
    })),
  };
}
