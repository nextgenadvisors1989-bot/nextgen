/**
 * Regenerates database/schema-documentation/SCHEMA.md from the live database, so
 * the documentation can never drift from the applied migrations.
 *
 *   npx tsx scripts/generate-schema-docs.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from '../lib/utils/env';
import { closePool, query, type RowDataPacket } from '../lib/db/mysql';

interface ColumnRow extends RowDataPacket {
  TABLE_NAME: string; COLUMN_NAME: string; COLUMN_TYPE: string; IS_NULLABLE: string;
  COLUMN_KEY: string; COLUMN_DEFAULT: string | null; EXTRA: string; COLUMN_COMMENT: string;
}
interface TableRow extends RowDataPacket {
  TABLE_NAME: string; TABLE_COMMENT: string; TABLE_ROWS: number | null;
}
interface ConstraintRow extends RowDataPacket {
  TABLE_NAME: string; CONSTRAINT_NAME: string; COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string; REFERENCED_COLUMN_NAME: string;
}

async function main() {
  loadEnv();
  const database = process.env.DB_NAME ?? 'compliance_platform';

  const [tables, columns, constraints] = await Promise.all([
    query<TableRow>(
      `SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
      [database]
    ),
    query<ColumnRow>(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database]
    ),
    query<ConstraintRow>(
      `SELECT kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME,
              kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE kcu
        WHERE kcu.TABLE_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME`,
      [database]
    ),
  ]);

  const columnsByTable = new Map<string, ColumnRow[]>();
  for (const column of columns) {
    const list = columnsByTable.get(column.TABLE_NAME) ?? [];
    list.push(column);
    columnsByTable.set(column.TABLE_NAME, list);
  }

  const fksByTable = new Map<string, ConstraintRow[]>();
  for (const constraint of constraints) {
    const list = fksByTable.get(constraint.TABLE_NAME) ?? [];
    list.push(constraint);
    fksByTable.set(constraint.TABLE_NAME, list);
  }

  const lines: string[] = [
    '# Database schema',
    '',
    `Generated from the live \`${database}\` schema on ${new Date().toISOString()} by`,
    '`npx tsx scripts/generate-schema-docs.ts`. Regenerate after every migration.',
    '',
    `**${tables.length} tables.** All tables are InnoDB with \`utf8mb4_unicode_ci\` collation.`,
    'Migrations live in `database/migrations` (numbered, applied in order and recorded in',
    '`schema_migrations`); reference data lives in `database/seeds`.',
    '',
    '## Table index',
    '',
  ];

  for (const table of tables) {
    const rows = table.TABLE_ROWS ?? 0;
    lines.push(`- [${table.TABLE_NAME}](#${table.TABLE_NAME.replace(/_/g, '-')}) — ${rows} row(s)`);
  }

  for (const table of tables) {
    lines.push('', `## ${table.TABLE_NAME}`, '');
    if (table.TABLE_COMMENT) lines.push(`_${table.TABLE_COMMENT}_`, '');

    lines.push('| Column | Type | Null | Key | Default | Notes |');
    lines.push('|---|---|---|---|---|---|');
    for (const column of columnsByTable.get(table.TABLE_NAME) ?? []) {
      const note = [column.EXTRA, column.COLUMN_COMMENT].filter(Boolean).join(' ').trim();
      lines.push(
        `| \`${column.COLUMN_NAME}\` | \`${column.COLUMN_TYPE}\` | ${column.IS_NULLABLE} | ${column.COLUMN_KEY || '—'} | ` +
        `${column.COLUMN_DEFAULT === null ? 'NULL' : `\`${column.COLUMN_DEFAULT}\``} | ${note || '—'} |`
      );
    }

    const fks = fksByTable.get(table.TABLE_NAME) ?? [];
    if (fks.length) {
      lines.push('', '**Foreign keys**', '');
      for (const fk of fks) {
        lines.push(`- \`${fk.COLUMN_NAME}\` → \`${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}\``);
      }
    }
  }

  const outDir = resolve(process.cwd(), 'database/schema-documentation');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'SCHEMA.md'), `${lines.join('\n')}\n`);

  console.log(`\n✓ Wrote ${tables.length} table definitions to database/schema-documentation/SCHEMA.md\n`);
  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  await closePool().catch(() => undefined);
  process.exit(1);
});
