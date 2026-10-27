/**
 * GET   /api/notifications/preferences — how this account wants to be told about
 *       each category of event, one row per category and channel.
 * PATCH /api/notifications/preferences — saves the grid.
 *
 * Preferences are stored per user and category. A category with no row follows
 * the platform default, so `saved` tells the screen whether the person has ever
 * touched the grid, and the toggles are pre-filled with the defaults either way.
 */
import { requireUser } from '@/lib/auth/permission-check';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { execute, query, type RowDataPacket } from '@/lib/db/mysql';
import { getUserPreferences, type NotificationChannel } from '@/lib/notifications/notification-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATEGORIES = [
  { category: 'ACCOUNT', label: 'Account & security', description: 'Sign-ins, password changes and activation.' },
  { category: 'AUDIT', label: 'Audits', description: 'Assignments, schedules and changes to an audit.' },
  { category: 'REPORT', label: 'Audit reports', description: 'Reports filed, returned for correction or approved.' },
  { category: 'COMPLIANCE', label: 'Compliance', description: 'Licences, certificates and renewals falling due.' },
  { category: 'PAYROLL', label: 'Payroll', description: 'Runs, payslips and statutory filing reminders.' },
  { category: 'LEAVE', label: 'Leave', description: 'Applications, decisions and balances.' },
  { category: 'EMPLOYEE', label: 'Employees', description: 'Joiners, exits and document changes.' },
  { category: 'EMPLOYER', label: 'Establishment', description: 'Changes to your own company record.' },
  { category: 'REMINDER', label: 'Reminders', description: 'Due dates the platform nudges you about.' },
  { category: 'SYSTEM', label: 'System', description: 'Maintenance, imports and platform notices.' },
] as const;

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'In-app',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

/** Default routing per category, mirroring the orchestrator's own table. */
const DEFAULTS: Record<string, Record<NotificationChannel, boolean>> = {
  ACCOUNT: { in_app: true, email: true, sms: true, whatsapp: true },
  AUDIT: { in_app: true, email: true, sms: false, whatsapp: true },
  REPORT: { in_app: true, email: true, sms: false, whatsapp: false },
  COMPLIANCE: { in_app: true, email: true, sms: false, whatsapp: true },
  PAYROLL: { in_app: true, email: true, sms: true, whatsapp: false },
  LEAVE: { in_app: true, email: true, sms: true, whatsapp: false },
  EMPLOYEE: { in_app: true, email: true, sms: false, whatsapp: false },
  EMPLOYER: { in_app: true, email: true, sms: false, whatsapp: false },
  REMINDER: { in_app: true, email: true, sms: false, whatsapp: false },
  SYSTEM: { in_app: true, email: false, sms: false, whatsapp: false },
};

export async function GET() {
  try {
    const user = await requireUser();
    const saved = await getUserPreferences(user.id);

    const counts = await query<RowDataPacket>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread
         FROM notifications WHERE user_id = ? AND deleted_at IS NULL`,
      [user.id]
    );

    const preferences = CATEGORIES.map(({ category, label, description }) => {
      const row = saved.get(category);
      const fallback = DEFAULTS[category] ?? { in_app: true, email: false, sms: false, whatsapp: false };
      return {
        category,
        label,
        description,
        in_app: row ? Boolean(row.in_app) : fallback.in_app,
        email: row ? Boolean(row.email) : fallback.email,
        sms: row ? Boolean(row.sms) : fallback.sms,
        whatsapp: row ? Boolean(row.whatsapp) : fallback.whatsapp,
      };
    });

    return ok({
      preferences,
      saved: saved.size > 0,
      categories: CATEGORIES.map(({ category, label }) => ({ value: category, label })),
      channelLabels: CHANNEL_LABELS,
      stats: {
        total: Number(counts[0]?.total ?? 0),
        unread: Number(counts[0]?.unread ?? 0),
        categories: CATEGORIES.length,
        muted: preferences.filter((row) => !row.in_app && !row.email && !row.sms && !row.whatsapp).length,
      },
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/notifications/preferences', method: 'GET' });
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { preferences?: Record<string, unknown>[] };
  try {
    const user = await requireUser();
    const rows = Array.isArray(body.preferences) ? body.preferences : [];
    if (!rows.length) return ok({ saved: 0 }, { message: 'Nothing to save' });

    let applied = 0;
    for (const row of rows) {
      const category = String(row.category ?? '').toUpperCase();
      if (!CATEGORIES.some((entry) => entry.category === category)) continue;

      const flag = (value: unknown) => (value ? 1 : 0);
      await execute(
        `INSERT INTO notification_preferences (user_id, category, in_app, email, sms, whatsapp, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE in_app = VALUES(in_app), email = VALUES(email),
                                 sms = VALUES(sms), whatsapp = VALUES(whatsapp), updated_at = NOW()`,
        [user.id, category, flag(row.in_app), flag(row.email), flag(row.sms), flag(row.whatsapp)]
      );
      applied += 1;
    }

    return ok({ saved: applied }, { message: 'Notification preferences saved' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/notifications/preferences', method: 'PATCH', body });
  }
}
