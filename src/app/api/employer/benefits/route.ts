import { NextRequest } from "next/server";
import { db } from "@/db";
import { benefits, employees } from "@/db/schema";
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
      id: benefits.id, employeeId: benefits.employeeId, name: benefits.name, type: benefits.type,
      value: benefits.value, frequency: benefits.frequency, isActive: benefits.isActive, createdAt: benefits.createdAt,
      firstName: employees.firstName, lastName: employees.lastName, employeeNumber: employees.employeeNumber,
    }).from(benefits)
      .leftJoin(employees, eq(benefits.employeeId, employees.id))
      .where(eq(benefits.employerId, employerId))
      .orderBy(desc(benefits.createdAt));

    return apiResponse({ benefits: rows });
  } catch {
    return apiError("Failed to fetch benefits", 500);
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

    if (employeeId) {
      const [emp] = await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.employerId, employerId))).limit(1);
      if (!emp) return apiError("Employee not found in your company", 404);
    }

    const row = await insertReturning(benefits, {
      employerId, employeeId: employeeId || null, name, type: type || "other", value, frequency: frequency || "one_time", isActive: true,
    });

    return apiResponse({ benefit: row }, 201);
  } catch {
    return apiError("Failed to create benefit", 500);
  }
}
