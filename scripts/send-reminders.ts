/**
 * Runs every reminder job: compliance document expiries and audit due dates.
 * Intended for cron: `0 8 * * * cd /path/to/app && npm run send:reminders`
 */
import { loadEnv } from '../lib/utils/env';
import { runAllReminderJobs } from '../lib/notifications/reminder-jobs';
import { closePool } from '../lib/db/mysql';

async function main() {
  loadEnv();
  const started = Date.now();

  const result = await runAllReminderJobs();

  console.log(`\n✓ Reminder run complete at ${result.ranAt}`);
  for (const job of result.jobs) {
    console.log(`\n  ${job.job}`);
    console.log(`    candidates evaluated : ${job.candidates}`);
    console.log(`    reminders dispatched : ${job.dispatched}`);
    console.log(`    already sent (skipped): ${job.skipped}`);
    if (job.errors.length) {
      console.log(`    errors (${job.errors.length}):`);
      for (const error of job.errors) console.log(`      - ${error}`);
    }
  }
  console.log(`\n  Duration : ${Date.now() - started}ms\n`);

  await closePool();
}

main().catch(async (error) => {
  console.error('Reminder run failed:', error);
  await closePool().catch(() => undefined);
  process.exit(1);
});
