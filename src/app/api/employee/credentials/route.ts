import { db } from "@/db";
import { digitalCredentials, employees, employers, departments, designations } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const [emp] = await db.select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employeeType: employees.employeeType,
      status: employees.status,
      companyName: employers.companyName,
      deptName: departments.name,
      desigName: designations.name,
    }).from(employees)
      .leftJoin(employers, eq(employees.employerId, employers.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(designations, eq(employees.designationId, designations.id))
      .where(eq(employees.id, employeeId))
      .limit(1);

    const [credential] = await db.select().from(digitalCredentials)
      .where(and(eq(digitalCredentials.ownerType, "employee"), eq(digitalCredentials.ownerId, employeeId)))
      .limit(1);

    return apiResponse({ employee: emp || null, credential: credential || null });
  } catch {
    return apiError("Failed to fetch credentials", 500);
  }
}
