/**
 * GET    /api/admin/notifications/templates — every notification template, the
 *        shipped wording included, with its variables and any override.
 * PUT    /api/admin/notifications/templates — saves one template's wording for a
 *        (code, channel, locale). A body that drops one of the template's
 *        variables is refused (422) and the missing names are listed.
 * DELETE /api/admin/notifications/templates — restores the shipped wording.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { fail, handleRouteError, ok, parseSearchParams } from '@/lib/utils/api-response';
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { TEMPLATES, getTemplate } from '@/lib/notifications/notification-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TemplateRow extends RowDataPacket {
  template_code: string;
  channel: string;
  locale: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  is_active: number;
  updated_at: string;
}

/** The shipped wording for a template code. */
function shipped(code: string) {
  const definition = getTemplate(code);
  if (!definition) return null;
  return {
    name: definition.name,
    channel: definition.channel,
    category: definition.category,
    variables: definition.variables ?? [],
    subject: definition.subject ?? null,
    body: definition.body ?? null,
  };
}

export async function GET(request: Request) {
  try {
    await requireAdminApi(['settings.read']);
    const params = parseSearchParams(request);
    const search = (params.get('search') ?? '').trim().toLowerCase();
    const channel = params.get('channel') ?? '';

    const overrides = await query<TemplateRow>('SELECT * FROM notification_templates WHERE deleted_at IS NULL');
    const overrideKey = new Map(overrides.map((row) => [`${row.template_code}|${row.channel}|${row.locale}`, row]));

    const rows: Record<string, unknown>[] = [];
    for (const [code, definition] of Object.entries(TEMPLATES)) {
      const entry = definition.channel;
      if (channel && channel !== 'all' && entry !== channel) continue;
      const override = overrideKey.get(`${code}|${entry}|en`);
      const base = shipped(code);
      if (!base) continue;

      if (search && !`${code} ${base.name}`.toLowerCase().includes(search)) continue;
      rows.push({
        template_code: code,
        template_name: base.name,
        channel: entry,
        category: base.category,
        locale: 'en',
        variables: base.variables,
        subject: override?.subject ?? base.subject,
        body: (entry === 'email' ? override?.body_html : override?.body_text) ?? base.body,
        shipped_subject: base.subject,
        shipped_body: base.body,
        is_active: override ? Number(override.is_active) : 1,
        customised: Boolean(override),
        updated_at: override?.updated_at ?? null,
      });
    }

    const stats = {
      total: rows.length,
      customised: rows.filter((row) => row.customised).length,
      channels: Array.from(new Set(rows.map((row) => String(row.channel)))),
      categories: Array.from(new Set(rows.map((row) => String(row.category)))),
      variables: Array.from(new Set(rows.flatMap((row) => (row.variables as string[]) ?? []))).length,
    };

    return ok(rows, { extra: { stats } });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/notifications/templates', method: 'GET' });
  }
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const user = await requireAdminApi(['settings.update']);
    const code = String(body.template_code ?? body.code ?? '').trim();
    const channel = String(body.channel ?? '').trim();
    const locale = String(body.locale ?? 'en').trim() || 'en';

    const definition = getTemplate(code);
    if (!definition) return fail(`Unknown template "${code}"`, 404, { code: 'NOT_FOUND' });
    if (!['email', 'sms', 'whatsapp', 'in_app'].includes(channel)) {
      return fail('Choose one of: email, sms, whatsapp, in_app', 422, { code: 'VALIDATION_FAILED' });
    }

    const subject = body.subject === undefined ? null : String(body.subject ?? '').trim() || null;
    const text = String(body.body ?? body.body_text ?? body.body_html ?? '').trim();
    if (!text) {
      return fail('Validation failed. Please correct the highlighted fields.', 422, {
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'body', message: 'The wording cannot be empty' }],
      });
    }

    const variables = (definition.variables ?? []) as string[];
    const dropped = variables.filter((name) => !text.includes(`{{${name}}}`));
    if (dropped.length) {
      return fail('Validation failed. Please correct the highlighted fields.', 422, {
        code: 'VALIDATION_FAILED',
        errors: [{
          field: 'body',
          message: `The wording must still carry: ${dropped.map((name) => `{{${name}}}`).join(', ')}`,
        }],
      });
    }

    const email = channel === 'email';
    await execute(
      `INSERT INTO notification_templates
         (template_code, template_name, channel, subject, body_html, body_text, variables_json, locale, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE template_name = VALUES(template_name), subject = VALUES(subject),
                               body_html = VALUES(body_html), body_text = VALUES(body_text),
                               variables_json = VALUES(variables_json), is_active = 1, updated_at = NOW()`,
      [
        code, definition.name, channel, subject,
        email ? text : null, email ? null : text,
        JSON.stringify(variables), locale, user.id,
      ]
    );

    return ok({ template_code: code, channel, locale, customised: true }, { message: `${definition.name} saved` });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/notifications/templates', method: 'PUT', body });
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    await requireAdminApi(['settings.update']);
    const params = parseSearchParams(request);
    const code = String(body.template_code ?? params.get('template_code') ?? '').trim();
    const channel = String(body.channel ?? params.get('channel') ?? '').trim();
    const locale = String(body.locale ?? params.get('locale') ?? 'en').trim() || 'en';
    if (!code || !channel) return fail('Name the template and the channel to restore', 422, { code: 'VALIDATION_FAILED' });

    const existing = await queryOne<RowDataPacket>(
      'SELECT id FROM notification_templates WHERE template_code = ? AND channel = ? AND locale = ? AND deleted_at IS NULL LIMIT 1',
      [code, channel, locale]
    );
    if (!existing) return ok({ restored: false }, { message: 'That template is already the shipped wording' });

    await execute('UPDATE notification_templates SET deleted_at = NOW() WHERE id = ?', [Number(existing.id)]);
    return ok({ restored: true }, { message: 'Shipped wording restored' });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/notifications/templates', method: 'DELETE', body });
  }
}
