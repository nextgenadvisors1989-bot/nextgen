import { db } from "@/db";
import { employees, employers } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const [emp] = await db.select({ employerId: employees.employerId }).from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!emp) return apiError("Employee not found", 404);

    const [employer] = await db.select({
      companyName: employers.companyName, email: employers.email, phone: employers.phone,
      contactPersonName: employers.contactPersonName, contactPersonPhone: employers.contactPersonPhone,
    }).from(employers).where(eq(employers.id, emp.employerId)).limit(1);

    return apiResponse({ employer: employer || null });
  } catch {
    return apiError("Failed to fetch support info", 500);
  }
}
