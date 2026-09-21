import { NextRequest } from "next/server";
import { db } from "@/db";
import { employees, users, departments, designations, employers } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;
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
      emergencyContact: employees.emergencyContact,
      employeeType: employees.employeeType,
      departmentId: employees.departmentId,
      designationId: employees.designationId,
      gradeId: employees.gradeId,
      joiningDate: employees.joiningDate,
      confirmationDate: employees.confirmationDate,
      workLocation: employees.workLocation,
      weeklyOff: employees.weeklyOff,
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
      employerId: employees.employerId,
      createdAt: employees.createdAt,
      companyName: employers.companyName,
    }).from(employees)
      .leftJoin(employers, eq(employees.employerId, employers.id))
      .where(eq(employees.id, parseInt(id))).limit(1);
    if (!emp) return apiError("Employee not found", 404);
    return apiResponse({ employee: emp });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to fetch employee", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;
    const body = await request.json();
    const { employerId: _, ...updateData } = body; // Prevent employer change

    await db.update(employees).set({ ...updateData, updatedAt: new Date() }).where(eq(employees.id, parseInt(id)));
    return apiResponse({ message: "Employee updated" });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to update employee", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;
    const empId = parseInt(id);
    const [emp] = await db.select().from(employees).where(eq(employees.id, empId)).limit(1);
    if (!emp) return apiError("Employee not found", 404);

    await db.update(employees).set({ deletedAt: new Date(), status: "inactive" }).where(eq(employees.id, empId));
    if (emp.userId) await db.update(users).set({ status: "inactive" }).where(eq(users.id, emp.userId));

    return apiResponse({ message: "Employee deactivated" });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to deactivate employee", 500);
  }
}
