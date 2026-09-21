import { NextRequest } from "next/server";
import { db } from "@/db";
import { employees, users, departments, designations } from "@/db/schema";
import { getAuthUser, hashPassword } from "@/lib/auth";
import { apiResponse, apiError, getPagination, generateId } from "@/lib/utils";
import { eq, desc, count, sql, and } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) {
      return apiError("Forbidden", 403);
    }

    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = getPagination(searchParams);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const employeeType = searchParams.get("employeeType") || "";
    const departmentId = searchParams.get("departmentId") || "";

    let whereClause = sql`${employees.employerId} = ${employerId} AND ${employees.deletedAt} IS NULL`;
    if (search) whereClause = sql`${whereClause} AND (${employees.firstName} LIKE ${`%${search}%`} OR ${employees.lastName} LIKE ${`%${search}%`} OR ${employees.email} LIKE ${`%${search}%`} OR ${employees.employeeNumber} LIKE ${`%${search}%`})`;
    if (status) whereClause = sql`${whereClause} AND ${employees.status} = ${status}`;
    if (employeeType) whereClause = sql`${whereClause} AND ${employees.employeeType} = ${employeeType}`;
    if (departmentId) whereClause = sql`${whereClause} AND ${employees.departmentId} = ${parseInt(departmentId)}`;

    const [rows, totalCount] = await Promise.all([
      db.select({
        id: employees.id,
        employeeNumber: employees.employeeNumber,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        phone: employees.phone,
        employeeType: employees.employeeType,
        status: employees.status,
        departmentId: employees.departmentId,
        designationId: employees.designationId,
        joiningDate: employees.joiningDate,
        registrationId: employees.registrationId,
        createdAt: employees.createdAt,
        deptName: departments.name,
        desigName: designations.name,
      }).from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .leftJoin(designations, eq(employees.designationId, designations.id))
        .where(whereClause)
        .orderBy(desc(employees.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(employees).where(whereClause),
    ]);

    return apiResponse({ employees: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch (err) {
    console.error(err);
    return apiError("Failed to fetch employees", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) {
      return apiError("Forbidden", 403);
    }

    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const body = await request.json();

    // Security: Never accept employerId from client, always use session
    const {
      employerId: _ignoreEmployerId,
      role: _ignoreRole,
      ...rest
    } = body;

    if (!rest.firstName) return apiError("First name is required", 400);

    const year = new Date().getFullYear();
    const countRow = await db.select({ count: count() }).from(employees).where(eq(employees.employerId, employerId));
    const seq = (countRow[0]?.count || 0) + 1;
    const registrationId = generateId("EMP", year, seq);
    const employeeNumber = `EMP${String(seq).padStart(5, "0")}`;

    const newEmployee = await insertReturning(employees, {
      ...rest,
      employerId,
      registrationId,
      employeeNumber,
      status: "active",
      createdBy: authUser.userId,
    });

    if (rest.email) {
      const tempPassword = `Pass@${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const passwordHash = await hashPassword(tempPassword);
      await db.insert(users).values({
        email: rest.email.toLowerCase(),
        passwordHash,
        role: "employee",
        status: "active",
        firstName: rest.firstName,
        lastName: rest.lastName,
        phone: rest.phone,
        employerId,
        employeeId: newEmployee.id,
        forcePasswordChange: true,
        createdBy: authUser.userId,
      }).onDuplicateKeyUpdate({ set: { email: sql`email` } });
    }

    return apiResponse({ employee: newEmployee }, 201);
  } catch (err) {
    console.error(err);
    return apiError("Failed to create employee", 500);
  }
}
