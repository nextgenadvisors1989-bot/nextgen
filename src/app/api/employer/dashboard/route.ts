import { NextRequest } from "next/server";
import { db } from "@/db";
import { employees, attendance, leaveRequests, payrollRuns, permissionRequests, auditorAssignments } from "@/db/schema";
import { requireRole, getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, count, sql, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    if (!["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated with this account", 400);

    const [
      totalEmployees, activeEmployees, pendingLeave,
      pendingPermissions, thisMonthPayroll, auditAssignments,
    ] = await Promise.all([
      db.select({ count: count() }).from(employees).where(eq(employees.employerId, employerId)),
      db.select({ count: count() }).from(employees).where(and(eq(employees.employerId, employerId), eq(employees.status, "active"))),
      db.select({ count: count() }).from(leaveRequests).where(and(eq(leaveRequests.employerId, employerId), eq(leaveRequests.status, "pending"))),
      db.select({ count: count() }).from(permissionRequests).where(and(eq(permissionRequests.employerId, employerId), sql`${permissionRequests.status} = 'pending'`)),
      db.select({ count: count() }).from(payrollRuns).where(and(eq(payrollRuns.employerId, employerId), sql`${payrollRuns.status} IN ('draft', 'calculated')`)),
      db.select({ count: count() }).from(auditorAssignments).where(and(eq(auditorAssignments.employerId, employerId), eq(auditorAssignments.isActive, true))),
    ]);

    return apiResponse({
      stats: {
        totalEmployees: totalEmployees[0]?.count || 0,
        activeEmployees: activeEmployees[0]?.count || 0,
        pendingLeave: pendingLeave[0]?.count || 0,
        pendingPermissions: pendingPermissions[0]?.count || 0,
        openPayrolls: thisMonthPayroll[0]?.count || 0,
        activeAuditors: auditAssignments[0]?.count || 0,
      },
    });
  } catch (err) {
    console.error("Employer dashboard error:", err);
    return apiError("Failed to fetch dashboard data", 500);
  }
}
