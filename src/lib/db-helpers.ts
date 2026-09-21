import { db } from "@/db";
import { eq, inArray, type SQL } from "drizzle-orm";
import type { AnyMySqlTable } from "drizzle-orm/mysql-core";

/**
 * Insert a row and return it, replacing Postgres' `.insert(...).values(...).returning()`.
 * MySQL has no RETURNING clause, so we grab the auto-increment id from the insert
 * result and immediately re-select that row.
 *
 * Usage: replace
 *   const [row] = await db.insert(table).values(values).returning();
 * with
 *   const row = await insertReturning(table, values);
 */
export async function insertReturning<T extends AnyMySqlTable & { id: unknown }>(
  table: T,
  values: T["$inferInsert"]
): Promise<T["$inferSelect"]> {
  const [result] = (await db.insert(table).values(values)) as unknown as [{ insertId: number }];
  const [row] = await db
    .select()
    .from(table)
    .where(eq(table.id as never, result.insertId));
  return row as T["$inferSelect"];
}

/**
 * Update row(s) matching `whereClause` and return the (single) updated row,
 * replacing Postgres' `.update(...).set(...).where(...).returning()`.
 * Assumes `whereClause` identifies exactly one row (true everywhere this is used
 * in this codebase — always an `eq(table.id, ...)` style condition).
 *
 * Usage: replace
 *   const [row] = await db.update(table).set(values).where(whereClause).returning();
 * with
 *   const row = await updateReturning(table, values, whereClause);
 */
export async function updateReturning<T extends AnyMySqlTable>(
  table: T,
  values: Partial<T["$inferInsert"]>,
  whereClause: SQL
): Promise<T["$inferSelect"]> {
  await db.update(table).set(values).where(whereClause);
  const [row] = await db.select().from(table).where(whereClause);
  return row as T["$inferSelect"];
}

/**
 * Bulk-insert multiple rows and return all of them, replacing Postgres'
 * `.insert(...).values([...]).returning()` for multi-row inserts.
 * Relies on MySQL's auto_increment IDs being contiguous for the batch
 * (safe for sequential seed/setup scripts; do not use under concurrent writes).
 *
 * Usage: replace
 *   const rows = await db.insert(table).values([v1, v2, ...]).returning();
 * with
 *   const rows = await insertManyReturning(table, [v1, v2, ...]);
 */
export async function insertManyReturning<T extends AnyMySqlTable & { id: unknown }>(
  table: T,
  valuesArray: T["$inferInsert"][]
): Promise<T["$inferSelect"][]> {
  const [result] = (await db.insert(table).values(valuesArray)) as unknown as [
    { insertId: number; affectedRows: number }
  ];
  const ids = Array.from({ length: result.affectedRows }, (_, i) => result.insertId + i);
  return db.select().from(table).where(inArray(table.id as never, ids)) as Promise<T["$inferSelect"][]>;
}
