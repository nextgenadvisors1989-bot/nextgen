import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, employers, employees, auditors, audits, registrations, leaveRequests, payrollRuns, notifications, systemAuditLog } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, count, sql, and, gte, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["super_admin", "admin"]);

    const [
      totalEmployers,
      totalEmployees,
      totalAuditors,
      totalAudits,
      pendingRegistrations,
      activeEmployers,
      pendingAudits,
      totalUsers,
      recentAuditLog,
    ] = await Promise.all([
      db.select({ count: count() }).from(employers),
      db.select({ count: count() }).from(employees),
      db.select({ count: count() }).from(auditors),
      db.select({ count: count() }).from(audits),
      db.select({ count: count() }).from(registrations).where(
        sql`status IN ('pending_documents', 'documents_verified', 'assessed', 'approved')`
      ),
      db.select({ count: count() }).from(employers).where(eq(employers.status, "active")),
      db.select({ count: count() }).from(audits).where(
        sql`status IN ('submitted', 'under_review', 'revision_requested')`
      ),
      db.select({ count: count() }).from(users),
      db.select({
        id: systemAuditLog.id,
        action: systemAuditLog.action,
        entityType: systemAuditLog.entityType,
        createdAt: systemAuditLog.createdAt,
      }).from(systemAuditLog).orderBy(desc(systemAuditLog.createdAt)).limit(5),
    ]);

    return apiResponse({
      stats: {
        totalEmployers: totalEmployers[0]?.count || 0,
        totalEmployees: totalEmployees[0]?.count || 0,
        totalAuditors: totalAuditors[0]?.count || 0,
        totalAudits: totalAudits[0]?.count || 0,
        pendingRegistrations: pendingRegistrations[0]?.count || 0,
        activeEmployers: activeEmployers[0]?.count || 0,
        pendingAudits: pendingAudits[0]?.count || 0,
        totalUsers: totalUsers[0]?.count || 0,
      },
      recentAuditLog,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return apiError("Forbidden", 403);
    }
    console.error("Admin dashboard error:", err);
    return apiError("Failed to fetch dashboard data", 500);
  }
}
