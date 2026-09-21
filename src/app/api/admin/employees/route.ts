import { NextRequest } from "next/server";
import { db } from "@/db";
import { employees, users, employers, departments, designations } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError, getPagination, generateId } from "@/lib/utils";
import { eq, desc, count, sql } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = getPagination(searchParams);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const employerId = searchParams.get("employerId") || "";
    const employeeType = searchParams.get("employeeType") || "";

    let whereClause = sql`${employees.deletedAt} IS NULL`;
    if (search) whereClause = sql`${whereClause} AND (${employees.firstName} LIKE ${`%${search}%`} OR ${employees.lastName} LIKE ${`%${search}%`} OR ${employees.email} LIKE ${`%${search}%`} OR ${employees.employeeNumber} LIKE ${`%${search}%`})`;
    if (status) whereClause = sql`${whereClause} AND ${employees.status} = ${status}`;
    if (employerId) whereClause = sql`${whereClause} AND ${employees.employerId} = ${parseInt(employerId)}`;
    if (employeeType) whereClause = sql`${whereClause} AND ${employees.employeeType} = ${employeeType}`;

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
        employerId: employees.employerId,
        registrationId: employees.registrationId,
        createdAt: employees.createdAt,
        companyName: employers.companyName,
      }).from(employees)
        .leftJoin(employers, eq(employees.employerId, employers.id))
        .where(whereClause)
        .orderBy(desc(employees.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(employees).where(whereClause),
    ]);

    return apiResponse({ employees: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to fetch employees", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireRole(["super_admin", "admin"]);
    const body = await request.json();
    const { employerId: bodyEmployerId, ...rest } = body;

    if (!rest.firstName || !bodyEmployerId) {
      return apiError("First name and employer ID are required", 400);
    }

    const year = new Date().getFullYear();
    const countRow = await db.select({ count: count() }).from(employees);
    const seq = (countRow[0]?.count || 0) + 1;
    const registrationId = generateId("EMP", year, seq);
    const employeeNumber = `EMP${String(seq).padStart(5, "0")}`;

    const newEmployee = await insertReturning(employees, {
      ...rest,
      employerId: bodyEmployerId,
      registrationId,
      employeeNumber,
      status: "active",
      createdBy: authUser.userId,
    });

    // Create user if email provided
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
        employerId: bodyEmployerId,
        employeeId: newEmployee.id,
        forcePasswordChange: true,
        createdBy: authUser.userId,
      });
    }

    return apiResponse({ employee: newEmployee }, 201);
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    console.error(err);
    return apiError("Failed to create employee", 500);
  }
}
