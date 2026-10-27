/**
 * POST /api/admin/payroll/jobs/run
 *
 * Runs the payroll month reminder now. The cron owns the first-of-the-month
 * schedule; this endpoint lets an administrator who has just created the missing
 * run confirm the nudge is silent, and lets a support engineer prove the job is
 * wired. The dispatch ledger keeps it idempotent.
 */
import { requireAdminApi } from '@/lib/auth/api-guards';
import { handleRouteError, ok } from '@/lib/utils/api-response';
import { runPayrollMonthReminders } from '@/lib/notifications/reminder-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  try {
    await requireAdminApi(['payroll.update']);
    const result = await runPayrollMonthReminders();
    return ok(result, {
      message: result.dispatched
        ? `${result.dispatched} reminder(s) dispatched across ${result.candidates} company/companies`
        : result.candidates
          ? `All ${result.candidates} company/companies had already been reminded`
          : 'Every company has a payroll run for the closed month — nothing to remind',
    });
  } catch (error) {
    return handleRouteError(error, { route: '/api/admin/payroll/jobs/run', method: 'POST' });
  }
}
