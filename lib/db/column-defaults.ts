/**
 * Column-default resolution for direct-SQL writes.
 *
 * A NULL written explicitly into a `NOT NULL ... DEFAULT x` column is rejected by
 * MySQL/MariaDB — the server only applies the default when the column is left out
 * of the statement entirely. Optional form fields arrive as `null` all the time,
 * so every insert/update would otherwise need per-field knowledge of the schema.
 *
 * `applyColumnDefaults()` reads the column metadata once per table (cached for the
 * process lifetime) and swaps those nulls back for the column default, coercing the
 * information_schema string into the column's own type. Nullable columns are left
 * untouched, so explicitly clearing a field keeps working.
 */
import { query, type RowDataPacket } from '@/lib/db/mysql';

interface ColumnMeta {
  name: string;
  dataType: string;
  columnDefault: string;
  isNullable: boolean;
}

const cache = new Map<string, Map<string, ColumnMeta>>();

async function columnsFor(table: string): Promise<Map<string, ColumnMeta>> {
  const cached = cache.get(table);
  if (cached) return cached;

  const rows = await query<
    { COLUMN_NAME: string; DATA_TYPE: string; COLUMN_DEFAULT: string | null; IS_NULLABLE: string } & RowDataPacket
  >(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );

  const map = new Map<string, ColumnMeta>();
  for (const row of rows) {
    map.set(row.COLUMN_NAME, {
      name: row.COLUMN_NAME,
      dataType: String(row.DATA_TYPE).toLowerCase(),
      columnDefault: row.COLUMN_DEFAULT === null ? '' : String(row.COLUMN_DEFAULT),
      isNullable: row.IS_NULLABLE === 'YES',
    });
  }
  cache.set(table, map);
  return map;
}

/** Turn an information_schema default string into a value mysql2 can bind. */
function coerceDefault(meta: ColumnMeta): unknown {
  const raw = meta.columnDefault;
  if (/^(current_timestamp|now\(\))/i.test(raw)) return new Date();

  switch (meta.dataType) {
    case 'tinyint':
    case 'smallint':
    case 'mediumint':
    case 'int':
    case 'bigint':
    case 'decimal':
    case 'float':
    case 'double':
    case 'year':
      return Number(raw);
    case 'bit':
      return raw === '1' || raw === 'b\'1\'';
    default:
      return raw;
  }
}

/**
 * Replace explicit `null`s with the column default wherever the column is
 * `NOT NULL` and a default exists. Other keys (including nulls on nullable
 * columns and undefined on optional fields) pass through unchanged.
 */
export async function applyColumnDefaults<T extends Record<string, unknown>>(
  table: string,
  values: T
): Promise<T> {
  const nulls = Object.entries(values).filter(([, value]) => value === null).map(([key]) => key);
  if (!nulls.length) return values;

  const meta = await columnsFor(table);
  const out: Record<string, unknown> = { ...values };

  for (const key of nulls) {
    const column = meta.get(key);
    if (!column || column.isNullable || column.columnDefault === '') continue;
    out[key] = coerceDefault(column);
  }

  return out as T;
}
