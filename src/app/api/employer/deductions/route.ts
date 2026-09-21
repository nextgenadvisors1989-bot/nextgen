import { NextRequest } from "next/server";
import { db } from "@/db";
import { deductions, employees } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, desc } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const rows = await db.select({
      id: deductions.id, employeeId: deductions.employeeId, name: deductions.name, type: deductions.type,
      value: deductions.value, frequency: deductions.frequency, isActive: deductions.isActive, createdAt: deductions.createdAt,
      firstName: employees.firstName, lastName: employees.lastName, employeeNumber: employees.employeeNumber,
    }).from(deductions)
      .leftJoin(employees, eq(deductions.employeeId, employees.id))
      .where(eq(deductions.employerId, employerId))
      .orderBy(desc(deductions.createdAt));

    return apiResponse({ deductions: rows });
  } catch {
    return apiError("Failed to fetch deductions", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const body = await request.json();
    const { employeeId, name, type, value, frequency } = body;
    if (!name || !value) return apiError("Name and value are required", 400);
    if (!employeeId) return apiError("Employee is required for a deduction", 400);

    const [emp] = await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.employerId, employerId))).limit(1);
    if (!emp) return apiError("Employee not found in your company", 404);

    const row = await insertReturning(deductions, {
      employerId, employeeId, name, type: type || "other", value, frequency: frequency || "one_time", isActive: true,
    });

    return apiResponse({ deduction: row }, 201);
  } catch {
    return apiError("Failed to create deduction", 500);
  }
}
