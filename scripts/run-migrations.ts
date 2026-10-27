/**
 * Applies every SQL file in database/migrations in filename order, recording each
 * one in the schema_migrations table so re-runs are idempotent and verifiable.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { loadEnv } from '../lib/utils/env';
import { executeSqlFile } from '../lib/db/sql-file';

export async function runMigrations(): Promise<void> {
  loadEnv();
  const migrationsDir = resolve(process.cwd(), 'database/migrations');
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4_unicode_ci',
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename    VARCHAR(255) NOT NULL,
      checksum    CHAR(64) NOT NULL,
      statements  INT NOT NULL DEFAULT 0,
      duration_ms INT NOT NULL DEFAULT 0,
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [appliedRows] = await conn.query<any[]>('SELECT filename, checksum FROM schema_migrations');
  const applied = new Map<string, string>(appliedRows.map((row) => [row.filename, row.checksum]));

  let ran = 0;
  let skipped = 0;

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        console.log(`!  ${file} — applied earlier but the file has since changed (not re-running)`);
      } else {
        skipped += 1;
      }
      continue;
    }

    try {
      const result = await executeSqlFile(conn, sql, file);
      await conn.query(
        'INSERT INTO schema_migrations (filename, checksum, statements, duration_ms) VALUES (?, ?, ?, ?)',
        [file, checksum, result.statements, result.durationMs]
      );
      console.log(`✓  ${file}  (${result.statements} statements, ${result.durationMs}ms)`);
      ran += 1;
    } catch (error) {
      console.error(`✗  ${(error as Error).message}`);
      await conn.end();
      process.exit(1);
    }
  }

  const [tables] = await conn.query<any[]>(
    'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = ?',
    [process.env.DB_NAME]
  );
  console.log(`\nMigrations applied: ${ran}   already up-to-date: ${skipped}`);
  console.log(`Tables in ${process.env.DB_NAME}: ${tables[0].total}`);
  await conn.end();
}

/**
 * Runs only when this file is the entry point, so `reset-database.ts` can import
 * the same routine without triggering a second run.
 */
const invokedDirectly = process.argv.some((arg) => arg.includes('run-migrations'));
if (invokedDirectly) {
  runMigrations().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
