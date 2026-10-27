/**
 * Splits a .sql file into individual statements and executes them one at a time.
 *
 * We deliberately avoid mysql2's `multipleStatements` option: mixing multi-result
 * execution with normal queries on the same connection can leave unread result
 * sets in the protocol buffer, which corrupts subsequent queries in subtle ways.
 * Executing statement-by-statement keeps the connection state clean and gives
 * precise error messages (file + statement index).
 */
import type { Connection } from 'mysql2/promise';

/** Character-aware splitter: ignores semicolons inside strings, comments and backticks. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        current += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (!inSingle && !inDouble && !inBacktick) {
      if (char === '-' && next === '-') {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (char === '#') {
        inLineComment = true;
        continue;
      }
      if (char === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
    }

    if (char === '\\' && (inSingle || inDouble)) {
      current += char + (next ?? '');
      i += 1;
      continue;
    }
    if (char === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (char === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (char === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;

    if (char === ';' && !inSingle && !inDouble && !inBacktick) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }
    current += char;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

export interface ExecuteFileResult {
  statements: number;
  durationMs: number;
}

export async function executeSqlFile(conn: Connection, sql: string, label: string): Promise<ExecuteFileResult> {
  const started = Date.now();
  const statements = splitStatements(sql);

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    try {
      await conn.query(statement);
    } catch (error) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 160);
      const wrapped = new Error(
        `${label}: statement ${index + 1}/${statements.length} failed — ${(error as Error).message}\n  → ${preview}`
      );
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    }
  }
  return { statements: statements.length, durationMs: Date.now() - started };
}
