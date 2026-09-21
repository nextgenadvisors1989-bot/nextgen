import { db } from "@/db";
import { systemAuditLog } from "@/db/schema";

/** Record an entry in the system activity log. Best-effort — never throws. */
export async function logActivity(
  userId: number | null | undefined,
  action: string,
  entityType?: string,
  entityId?: number,
  newData?: unknown
) {
  try {
    await db.insert(systemAuditLog).values({
      userId: userId || null,
      action,
      entityType: entityType || null,
      entityId: entityId ?? null,
      newData: newData ? JSON.parse(JSON.stringify(newData)) : null,
    });
  } catch {
    // best-effort — never block the calling action
  }
}
