import { NextRequest } from "next/server";
import { db } from "@/db";
import { employees, employers, departments, designations } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile associated", 400);

    const [emp] = await db.select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      phone: employees.phone,
      dateOfBirth: employees.dateOfBirth,
      gender: employees.gender,
      maritalStatus: employees.maritalStatus,
      fatherSpouseName: employees.fatherSpouseName,
      presentAddress: employees.presentAddress,
      permanentAddress: employees.permanentAddress,
      employeeType: employees.employeeType,
      joiningDate: employees.joiningDate,
      confirmationDate: employees.confirmationDate,
      workLocation: employees.workLocation,
      pfNumber: employees.pfNumber,
      uan: employees.uan,
      esiNumber: employees.esiNumber,
      bankAccount: employees.bankAccount,
      bankName: employees.bankName,
      ifsc: employees.ifsc,
      panNumber: employees.panNumber,
      qualification: employees.qualification,
      status: employees.status,
      registrationId: employees.registrationId,
      companyName: employers.companyName,
      deptName: departments.name,
      desigName: designations.name,
    }).from(employees)
      .leftJoin(employers, eq(employees.employerId, employers.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(designations, eq(employees.designationId, designations.id))
      .where(eq(employees.id, employeeId))
      .limit(1);

    if (!emp) return apiError("Employee profile not found", 404);
    return apiResponse({ employee: emp });
  } catch (err) {
    return apiError("Failed to fetch profile", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile associated", 400);

    const body = await request.json();
    // Only allow certain fields to be updated
    const allowedFields = ["phone", "presentAddress", "permanentAddress", "bankAccount", "bankName", "ifsc"];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    await db.update(employees).set({ ...updateData, updatedAt: new Date() }).where(eq(employees.id, employeeId));
    return apiResponse({ message: "Profile updated" });
  } catch (err) {
    return apiError("Failed to update profile", 500);
  }
}
