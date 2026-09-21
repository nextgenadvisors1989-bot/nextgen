import { NextRequest } from "next/server";
import { db } from "@/db";
import { employees, users, departments, designations } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getEmployerFromAuth() {
  const authUser = await getAuthUser();
  if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) {
    throw new Error("Forbidden");
  }
  return authUser;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getEmployerFromAuth();
    const { id } = await params;
    const employerId = authUser.employerId;

    const query = db.select({
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
      deptName: departments.name,
      desigName: designations.name,
    }).from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(designations, eq(employees.designationId, designations.id));

    let result;
    if (employerId && !["super_admin", "admin"].includes(authUser.role)) {
      const rows = await query.where(and(eq(employees.id, parseInt(id)), eq(employees.employerId, employerId))).limit(1);
      result = rows[0];
    } else {
      const rows = await query.where(eq(employees.id, parseInt(id))).limit(1);
      result = rows[0];
    }

    if (!result) return apiError("Employee not found", 404);
    return apiResponse({ employee: result });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to fetch employee", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getEmployerFromAuth();
    const { id } = await params;
    const body = await request.json();

    // Prevent changing employer or role
    const { employerId: _, role: __, ...updateData } = body;

    const empId = parseInt(id);
    const employerId = authUser.employerId;

    // Verify ownership
    if (employerId && !["super_admin", "admin"].includes(authUser.role)) {
      const [emp] = await db.select({ id: employees.id }).from(employees)
        .where(and(eq(employees.id, empId), eq(employees.employerId, employerId))).limit(1);
      if (!emp) return apiError("Employee not found", 404);
    }

    await db.update(employees).set({ ...updateData, updatedAt: new Date() }).where(eq(employees.id, empId));
    return apiResponse({ message: "Employee updated" });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to update employee", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getEmployerFromAuth();
    const { id } = await params;
    const empId = parseInt(id);
    const employerId = authUser.employerId;

    const query = db.select().from(employees);
    let emp;
    if (employerId && !["super_admin", "admin"].includes(authUser.role)) {
      const rows = await query.where(and(eq(employees.id, empId), eq(employees.employerId, employerId))).limit(1);
      emp = rows[0];
    } else {
      const rows = await query.where(eq(employees.id, empId)).limit(1);
      emp = rows[0];
    }

    if (!emp) return apiError("Employee not found", 404);

    await db.update(employees).set({ deletedAt: new Date(), status: "inactive" }).where(eq(employees.id, empId));
    if (emp.userId) await db.update(users).set({ status: "inactive" }).where(eq(users.id, emp.userId));

    return apiResponse({ message: "Employee deactivated" });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to deactivate employee", 500);
  }
}
