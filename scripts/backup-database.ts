/**
 * Creates a timestamped SQL dump and prunes dumps older than the configured
 * retention window.
 *
 *   npm run backup:db                       # uses DB_* from .env
 *   npm run backup:db -- --keep 60          # override retention (days)
 *   npm run backup:db -- --output /backups  # override destination
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from '../lib/utils/env';
import { execute, query, type RowDataPacket } from '../lib/db/mysql';

const execFileAsync = promisify(execFile);

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

async function main() {
  loadEnv();

  const host = process.env.DB_HOST ?? '127.0.0.1';
  const port = process.env.DB_PORT ?? '3306';
  const user = process.env.DB_USER ?? 'root';
  const password = process.env.DB_PASSWORD ?? '';
  const database = process.env.DB_NAME ?? 'compliance_platform';
  const keepDays = Number(arg('keep', process.env.BACKUP_RETENTION_DAYS ?? '30') ?? '30');
  const outputDir = resolve(arg('output', process.env.BACKUP_PATH ?? './storage/backups') ?? './storage/backups');

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${database}-${stamp}.sql`;
  const filePath = resolve(outputDir, filename);

  // Start the run in backup_history so failures are visible in the admin panel.
  const runId = await execute(
    `INSERT INTO backup_history (backup_name, backup_type, file_path, status, triggered_by, started_at)
     VALUES (?, 'full', ?, 'running', 'manual', NOW())`,
    [filename, filePath]
  ).then((result) => result.insertId);

  try {
    const args = [`--host=${host}`, `--port=${port}`, `--user=${user}`, '--single-transaction',
      '--routines', '--triggers', '--events', '--default-character-set=utf8mb4', '--result-file=' + filePath, database];
    if (password) args.unshift(`--password=${password}`);

    await execFileAsync(process.env.MYSQLDUMP_PATH || 'mysqldump', args, { maxBuffer: 1024 * 1024 * 256 });

    const sizeBytes = statSync(filePath).size;
    const tableRows = await query<{ name: string } & RowDataPacket>(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME',
      [database, 'BASE TABLE']
    );

    await execute(
      `UPDATE backup_history SET status = 'completed', file_size_bytes = ?, tables_included = ?,
                                 completed_at = NOW(),
                                 duration_seconds = TIMESTAMPDIFF(SECOND, started_at, NOW())
       WHERE id = ?`,
      [sizeBytes, JSON.stringify(tableRows.map((row) => row.name)), runId]
    );

    // Retention: delete dumps older than keepDays.
    let pruned = 0;
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    for (const entry of readdirSync(outputDir)) {
      if (!entry.endsWith('.sql') || entry === filename) continue;
      const full = resolve(outputDir, entry);
      if (statSync(full).mtimeMs < cutoff) {
        unlinkSync(full);
        pruned += 1;
      }
    }

    console.log(`\n✓ Backup completed`);
    console.log(`  File      : ${filePath}`);
    console.log(`  Size      : ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Retention : ${keepDays} day(s) — pruned ${pruned} old dump(s)\n`);
  } catch (error) {
    const message = (error as Error).message.slice(0, 1000);
    await execute(
      `UPDATE backup_history SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?`,
      [message, runId]
    );
    console.error(`\n✗ Backup failed: ${message}`);
    console.error('  Ensure `mysqldump` is installed and the DB_* credentials in .env are correct.\n');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
