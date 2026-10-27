/**
 * DESTRUCTIVE. Drops every table in the configured database and rebuilds it
 * from the migration files, then re-runs the seeds.
 *
 *   npm run db:reset -- --yes
 *
 * Refuses to run without --yes, and refuses to run against a database whose
 * name does not end in `_dev`, `_test`, `_local` or `_platform` unless
 * --force is also passed, so production can never be wiped by accident.
 */
import { loadEnv } from '../lib/utils/env';
import { closePool, execute, query, type RowDataPacket } from '../lib/db/mysql';
import { runMigrations } from './run-migrations';
import { runSeeds } from './run-seeds';

async function main() {
  loadEnv();

  const database = process.env.DB_NAME ?? 'compliance_platform';
  const confirmed = process.argv.includes('--yes');
  const forced = process.argv.includes('--force');

  if (!confirmed) {
    console.error(`Refusing to reset "${database}" without --yes.

  npm run db:reset -- --yes`);
    process.exit(1);
  }

  if (!/(_dev|_test|_local|_platform)$/.test(database) && !forced) {
    console.error(`Database name "${database}" does not look like a development or demo database.
Add --force if you are absolutely sure.`);
    process.exit(1);
  }

  console.log(`\n⚠  Resetting database "${database}"…`);

  const tables = await query<{ TABLE_NAME: string } & RowDataPacket>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
    [database]
  );

  await execute('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of tables) {
    await execute(`DROP TABLE IF EXISTS \`${table.TABLE_NAME}\``);
  }
  await execute('SET FOREIGN_KEY_CHECKS = 1');
  console.log(`   Dropped ${tables.length} table(s)`);

  await runMigrations();
  await runSeeds();

  console.log('\n✓ Database reset complete\n');
  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  await closePool().catch(() => undefined);
  process.exit(1);
});
