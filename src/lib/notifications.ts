import { db } from "@/db";
import { notifications, users, employees, auditors } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

type NotifyOptions = { type?: string; link?: string };

/** Create a notification for a single user. Never throws — notification failures shouldn't break the calling action. */
export async function notifyUser(userId: number | null | undefined, title: string, message: string, opts: NotifyOptions = {}) {
  if (!userId) return;
  try {
    await db.insert(notifications).values({
      userId, title, message, type: opts.type || "info", link: opts.link || null,
    });
  } catch {
    // best-effort — swallow so the primary action still succeeds
  }
}

/** Notify every user account (HR/admin) belonging to an employer company. */
export async function notifyEmployer(employerId: number | null | undefined, title: string, message: string, opts: NotifyOptions = {}) {
  if (!employerId) return;
  try {
    const rows = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.employerId, employerId), inArray(users.role, ["employer_admin", "hr_manager"])));
    await Promise.all(rows.map((u) => notifyUser(u.id, title, message, opts)));
  } catch {
    // best-effort
  }
}

/** Notify the user account linked to a specific employee record. */
export async function notifyEmployee(employeeId: number | null | undefined, title: string, message: string, opts: NotifyOptions = {}) {
  if (!employeeId) return;
  try {
    const [emp] = await db.select({ userId: employees.userId }).from(employees).where(eq(employees.id, employeeId)).limit(1);
    await notifyUser(emp?.userId, title, message, opts);
  } catch {
    // best-effort
  }
}

/** Notify the user account linked to a specific auditor record. */
export async function notifyAuditor(auditorId: number | null | undefined, title: string, message: string, opts: NotifyOptions = {}) {
  if (!auditorId) return;
  try {
    const [aud] = await db.select({ userId: auditors.userId }).from(auditors).where(eq(auditors.id, auditorId)).limit(1);
    await notifyUser(aud?.userId, title, message, opts);
  } catch {
    // best-effort
  }
}

/** Notify every platform Admin / Super Admin account. */
export async function notifyAdmins(title: string, message: string, opts: NotifyOptions = {}) {
  try {
    const rows = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "super_admin"]));
    await Promise.all(rows.map((u) => notifyUser(u.id, title, message, opts)));
  } catch {
    // best-effort
  }
}
