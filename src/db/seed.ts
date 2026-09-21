import "dotenv/config";
import { db } from "./index";
import {
  users, employers, employees, auditors, auditorRoleTypes, auditorRoles,
  auditorAssignments, departments, designations, grades, auditTypes, auditTypeRoles,
  audits, legalActs, complianceCalendar, attendance, leaveRequests, leaveBalances,
  payrollRuns, payrollLines, salarySlips, wageConfigs, notifications, systemAuditLog,
  digitalCredentials, roles, modules, rolePermissions,
} from "./schema";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { insertReturning, insertManyReturning } from "@/lib/db-helpers";

const asDate = (value: string) => new Date(`${value}T00:00:00`);

async function hashPwd(password: string) {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log("Starting seed...");

  // Clear existing data (MySQL: disable FK checks, truncate each table individually, re-enable)
  const tablesToClear = [
    "salary_slips", "payroll_lines", "payroll_runs", "wage_configs",
    "leave_requests", "leave_balances", "attendance",
    "corrective_actions", "audit_findings", "audit_revisions", "audits",
    "audit_type_roles", "audit_types",
    "auditor_assignments", "auditor_scopes", "auditor_roles", "auditors",
    "document_uploads", "registration_documents", "registrations",
    "digital_credentials",
    "employees", "departments", "employers",
    "compliance_calendar", "legal_acts",
    "system_audit_log", "notifications",
    "role_permissions", "modules", "roles",
    "email_verification_tokens", "password_reset_tokens", "sessions",
    "users", "auditor_role_types", "grades", "designations",
  ];

  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of tablesToClear) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${table}`));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);

  console.log("Tables cleared");

  // Seed Auditor Role Types
  const roleTypeNames = [
    "Electrical Safety Auditor", "Fire Safety Auditor", "Environmental Auditor",
    "Water Audit Auditor", "Waste Management Auditor", "Energy Auditor",
    "GHG and Carbon Auditor", "Chemical Safety Auditor",
    "Occupational Health and Safety Auditor", "Factory Safety Auditor",
    "Labour and Social Compliance Auditor", "Payroll and Wage Compliance Auditor",
    "Food Safety Auditor", "ETP / STP Assessment Auditor", "Risk Assessment Auditor",
    "HAZOP Auditor", "HACCP Auditor", "Work Permit System Auditor",
    "ESG and Sustainability Auditor", "General Compliance Auditor",
  ];

  const insertedRoleTypes = await insertManyReturning(auditorRoleTypes,
    roleTypeNames.map(name => ({ name, isActive: true }))
  );
  console.log(`Seeded ${insertedRoleTypes.length} auditor role types`);

  // Seed Grades
  const gradeNames = ["Grade A", "Grade B", "Grade C", "Grade D", "Management", "Executive"];
  const insertedGrades = await insertManyReturning(grades, gradeNames.map(name => ({ name })));

  // Seed Designations
  const designationNames = [
    "Manager", "Senior Engineer", "Engineer", "Technician", "Supervisor",
    "HR Manager", "HR Executive", "Accountant", "Operator", "Helper",
    "Director", "CEO", "CFO", "Factory Manager", "Production Manager",
  ];
  const insertedDesignations = await insertManyReturning(designations,
    designationNames.map(name => ({ name }))
  );

  // Create Users
  const superAdminHash = await hashPwd("Admin@123456");
  const adminHash = await hashPwd("Admin@123456");
  const auditorHash = await hashPwd("Audit@123456");
  const employerHash = await hashPwd("Employer@123456");
  const hrHash = await hashPwd("Hr@123456");
  const empHash = await hashPwd("Employee@123456");

  // Super Admin
  const superAdminUser = await insertReturning(users, {
    email: "superadmin@compliancehub.com",
    username: "superadmin",
    passwordHash: superAdminHash,
    role: "super_admin",
    status: "active",
    firstName: "Super",
    lastName: "Admin",
    phone: "9000000001",
    emailVerifiedAt: new Date(),
  });

  // Admin
  const adminUser = await insertReturning(users, {
    email: "admin@compliancehub.com",
    username: "admin",
    passwordHash: adminHash,
    role: "admin",
    status: "active",
    firstName: "Platform",
    lastName: "Admin",
    phone: "9000000002",
    emailVerifiedAt: new Date(),
  });

  console.log("Created admin users");

  // Create Employer
  const employer1 = await insertReturning(employers, {
    registrationId: "COMP-2026-000001",
    companyName: "TechCorp Industries Pvt Ltd",
    tradeName: "TechCorp",
    email: "employer@techcorp.com",
    phone: "9100000001",
    address: "123 Industrial Area, Phase 1",
    state: "Tamil Nadu",
    district: "Chennai",
    pincode: "600001",
    industry: "Manufacturing",
    gstNumber: "33AABCT1234A1Z1",
    panNumber: "AABCT1234A",
    cinNumber: "U72200TN2010PTC12345",
    epfRegNumber: "TN/CHN/1234567",
    esiRegNumber: "53000012345",
    totalEmployees: 6,
    status: "active",
    contactPersonName: "Rajesh Kumar",
    contactPersonPhone: "9100000001",
    createdBy: adminUser.id,
  });

  // Employer Admin User
  const employerUser = await insertReturning(users, {
    email: "employer@techcorp.com",
    passwordHash: employerHash,
    role: "employer_admin",
    status: "active",
    firstName: "Rajesh",
    lastName: "Kumar",
    phone: "9100000001",
    employerId: employer1.id,
    emailVerifiedAt: new Date(),
    createdBy: adminUser.id,
  });

  // HR Manager User
  const hrUser = await insertReturning(users, {
    email: "hr@techcorp.com",
    passwordHash: hrHash,
    role: "hr_manager",
    status: "active",
    firstName: "Priya",
    lastName: "Sharma",
    phone: "9100000002",
    employerId: employer1.id,
    emailVerifiedAt: new Date(),
    createdBy: adminUser.id,
  });

  console.log("Created employer and HR users");

  // Create Departments
  const deptNames = ["Production", "Quality", "HR & Admin", "Accounts", "Maintenance", "Safety"];
  const insertedDepts = await insertManyReturning(departments,
    deptNames.map(name => ({ employerId: employer1.id, name }))
  );

  // Create Employees
  const empData = [
    { firstName: "Arun", lastName: "Murugan", email: "emp001@techcorp.com", phone: "9200000001", employeeType: "regular" as const, gender: "male" as const, joiningDate: asDate("2022-01-15"), pfNumber: "TN0123456789", esiNumber: "5300012301" },
    { firstName: "Deepa", lastName: "Krishnan", email: "emp002@techcorp.com", phone: "9200000002", employeeType: "regular" as const, gender: "female" as const, joiningDate: asDate("2022-03-01"), pfNumber: "TN0123456790", esiNumber: "5300012302" },
    { firstName: "Suresh", lastName: "Babu", email: "emp003@techcorp.com", phone: "9200000003", employeeType: "regular" as const, gender: "male" as const, joiningDate: asDate("2021-06-10"), pfNumber: "TN0123456791", esiNumber: "5300012303" },
    { firstName: "Kamala", lastName: "Devi", email: "emp004@techcorp.com", phone: "9200000004", employeeType: "temporary" as const, gender: "female" as const, joiningDate: asDate("2023-04-01") },
    { firstName: "Ravi", lastName: "Shankar", email: "emp005@techcorp.com", phone: "9200000005", employeeType: "temporary" as const, gender: "male" as const, joiningDate: asDate("2023-07-15") },
    { firstName: "Abdul", lastName: "Rahman", email: "emp006@techcorp.com", phone: "9200000006", employeeType: "contractor" as const, gender: "male" as const, joiningDate: asDate("2024-01-01") },
  ];

  const insertedEmployees = [];
  for (let i = 0; i < empData.length; i++) {
    const emp = empData[i];
    const newEmp = await insertReturning(employees, {
      ...emp,
      employeeNumber: `EMP${String(i + 1).padStart(5, "0")}`,
      registrationId: `EMP-2026-${String(i + 1).padStart(6, "0")}`,
      employerId: employer1.id,
      departmentId: insertedDepts[i % insertedDepts.length].id,
      designationId: insertedDesignations[i % 5].id,
      gradeId: insertedGrades[i % insertedGrades.length].id,
      workLocation: "Chennai Plant 1",
      weeklyOff: "sunday",
      workingHours: "8",
      bankAccount: `1234567890${i}`,
      bankName: "State Bank of India",
      ifsc: "SBIN0001234",
      status: "active",
      createdBy: employerUser.id,
    });
    insertedEmployees.push(newEmp);

    // Create user for each employee
    const empUser = await insertReturning(users, {
      email: emp.email,
      passwordHash: empHash,
      role: "employee",
      status: "active",
      firstName: emp.firstName,
      lastName: emp.lastName,
      phone: emp.phone,
      employerId: employer1.id,
      employeeId: newEmp.id,
      emailVerifiedAt: new Date(),
      createdBy: employerUser.id,
    });

    await db.update(employees as typeof employees).set({ userId: empUser.id } as Partial<typeof employees.$inferInsert>).where(sql`id = ${newEmp.id}`);
  }

  console.log(`Created ${insertedEmployees.length} employees`);

  // Create Wage Configs for employees
  const wageData = [
    { basic: "15000", da: "3000", hra: "4500", ta: "1500" },
    { basic: "18000", da: "3600", hra: "5400", ta: "1800" },
    { basic: "20000", da: "4000", hra: "6000", ta: "2000" },
    { basic: "12000", da: "2400", hra: "3600", ta: "1200" },
    { basic: "10000", da: "2000", hra: "3000", ta: "1000" },
    { basic: "14000", da: "2800", hra: "4200", ta: "1400" },
  ];

  for (let i = 0; i < insertedEmployees.length; i++) {
    const w = wageData[i];
    const gross = parseFloat(w.basic) + parseFloat(w.da) + parseFloat(w.hra) + parseFloat(w.ta);
    await db.insert(wageConfigs).values({
      employerId: employer1.id,
      employeeId: insertedEmployees[i].id,
      name: `Wage Config - ${insertedEmployees[i].firstName}`,
      basic: w.basic,
      da: w.da,
      hra: w.hra,
      ta: w.ta,
      grossWage: gross.toString(),
      pfPercentage: "12",
      esiPercentage: "0.75",
      ptAmount: "200",
      effectiveFrom: asDate("2024-01-01"),
      isActive: true,
      createdBy: employerUser.id,
    });
  }

  // Create Attendance Records
  const today = new Date();
  for (const emp of insertedEmployees.slice(0, 3)) {
    await db.insert(attendance).values({
      employeeId: emp.id,
      employerId: employer1.id,
      date: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      clockIn: new Date(today.setHours(9, 0, 0)),
      clockOut: new Date(today.setHours(18, 0, 0)),
      method: "manual",
      status: "present",
      hoursWorked: "8",
      createdBy: hrUser.id,
    });
  }

  // Create Leave Balances
  const currentYear = new Date().getFullYear();
  const leaveTypes = ["casual", "earned", "sick", "festival"] as const;
  for (const emp of insertedEmployees) {
    for (const lt of leaveTypes) {
      await db.insert(leaveBalances).values({
        employeeId: emp.id,
        employerId: employer1.id,
        leaveType: lt,
        year: currentYear,
        openingBalance: "12",
        accrued: "6",
        used: "2",
        balance: "16",
      });
    }
  }

  // Create Leave Request
  await db.insert(leaveRequests).values({
    employeeId: insertedEmployees[0].id,
    employerId: employer1.id,
    leaveType: "casual",
    fromDate: asDate("2026-07-15"),
    toDate: asDate("2026-07-16"),
    days: "2",
    reason: "Family function",
    status: "pending",
  });

  console.log("Created attendance and leave data");

  // Create Auditors
  const auditor1 = await insertReturning(auditors, {
    registrationId: "AUD-2026-000001",
    firstName: "Ravi",
    lastName: "Kumar",
    email: "auditor@compliancehub.com",
    phone: "9300000001",
    organization: "SafeAudit Consultants",
    assessorNumber: "NABL-2024-001",
    experience: 10,
    qualification: "B.E. Electrical Engineering, PGDIS",
    certification: "NEBOSH IGC, NFPA Certified",
    state: "Tamil Nadu",
    district: "Chennai",
    languages: ["English", "Tamil"],
    validityStart: asDate("2026-01-01"),
    validityEnd: asDate("2027-12-31"),
    maxActiveAssignments: 10,
    status: "active",
    createdBy: adminUser.id,
  });

  const auditor1User = await insertReturning(users, {
    email: "auditor@compliancehub.com",
    passwordHash: auditorHash,
    role: "auditor",
    status: "active",
    firstName: "Ravi",
    lastName: "Kumar",
    phone: "9300000001",
    auditorId: auditor1.id,
    emailVerifiedAt: new Date(),
    createdBy: adminUser.id,
  });

  await db.update(auditors as typeof auditors).set({ userId: auditor1User.id } as Partial<typeof auditors.$inferInsert>).where(sql`id = ${auditor1.id}`);

  // Assign roles to auditor 1
  const electricalRole = insertedRoleTypes.find(r => r.name === "Electrical Safety Auditor");
  const fireRole = insertedRoleTypes.find(r => r.name === "Fire Safety Auditor");
  const waterRole = insertedRoleTypes.find(r => r.name === "Water Audit Auditor");
  const envRole = insertedRoleTypes.find(r => r.name === "Environmental Auditor");
  const payrollRole = insertedRoleTypes.find(r => r.name === "Payroll and Wage Compliance Auditor");

  const rolesToAssign = [electricalRole, fireRole, waterRole].filter(Boolean);
  if (rolesToAssign.length > 0) {
    await db.insert(auditorRoles).values(
      rolesToAssign.map(rt => ({ auditorId: auditor1.id, roleTypeId: rt!.id, assignedBy: adminUser.id }))
    );
  }

  // Create more auditors
  const auditor2 = await insertReturning(auditors, {
    registrationId: "AUD-2026-000002",
    firstName: "Preethi",
    lastName: "Nair",
    email: "auditor2@compliancehub.com",
    phone: "9300000002",
    organization: "EnviroCheck Solutions",
    assessorNumber: "NABL-2024-002",
    experience: 7,
    qualification: "B.E. Environmental Engineering",
    state: "Kerala",
    validityStart: asDate("2026-01-01"),
    validityEnd: asDate("2027-12-31"),
    status: "active",
    createdBy: adminUser.id,
  });

  const envAuditorHash = await hashPwd("Audit@123456");
  const auditor2User = await insertReturning(users, {
    email: "auditor2@compliancehub.com",
    passwordHash: envAuditorHash,
    role: "auditor",
    status: "active",
    firstName: "Preethi",
    lastName: "Nair",
    auditorId: auditor2.id,
    emailVerifiedAt: new Date(),
    createdBy: adminUser.id,
  });

  if (envRole) {
    await db.insert(auditorRoles).values({ auditorId: auditor2.id, roleTypeId: envRole.id, assignedBy: adminUser.id });
  }

  console.log("Created auditors");

  // Create Auditor Assignment
  const assignment1 = await insertReturning(auditorAssignments, {
    auditorId: auditor1.id,
    employerId: employer1.id,
    assignedBy: adminUser.id,
    startDate: asDate("2026-01-01"),
    endDate: asDate("2026-12-31"),
    isActive: true,
    notes: "Annual electrical and fire safety audits",
  });

  console.log("Created auditor assignments");

  // Create Audit Types
  const electricalAuditType = await insertReturning(auditTypes, {
    name: "Electrical Safety Audit",
    category: "Safety",
    description: "Comprehensive electrical safety assessment including installation, protection and maintenance checks",
    formSchema: {
      sections: [
        {
          key: "general",
          title: "General Details",
          fields: [
            { key: "company", label: "Company", type: "text", required: true },
            { key: "siteLocation", label: "Site Location", type: "text", required: true },
            { key: "auditDate", label: "Audit Date", type: "date", required: true },
            { key: "auditScope", label: "Audit Scope", type: "textarea", required: true },
            { key: "contactPerson", label: "Contact Person", type: "text" },
            { key: "previousAuditDate", label: "Previous Audit Date", type: "date" },
            { key: "numberOfEmployees", label: "Number of Employees", type: "number" },
          ],
        },
        {
          key: "electrical_installation",
          title: "Electrical Installation",
          fields: [
            { key: "incomingSupplyVoltage", label: "Incoming Supply Voltage (V)", type: "number" },
            { key: "transformerCapacity", label: "Transformer Capacity (KVA)", type: "number" },
            { key: "numberOfTransformers", label: "Number of Transformers", type: "number" },
            { key: "dgCapacity", label: "DG Capacity (KVA)", type: "number" },
            { key: "htLtPanels", label: "HT/LT Panels Condition", type: "select", options: ["Good", "Fair", "Poor", "NA"] },
            { key: "earthResistanceTestDate", label: "Earth Resistance Test Date", type: "date" },
            { key: "earthResistanceValue", label: "Earth Resistance Value (Ohm)", type: "number" },
            { key: "lightningProtection", label: "Lightning Protection Available", type: "toggle" },
            { key: "surgeProtection", label: "Surge Protection Available", type: "toggle" },
            { key: "singleLineDiagram", label: "Single Line Diagram Available", type: "toggle" },
            { key: "thermalScanning", label: "Thermal Scanning Completed", type: "toggle" },
            { key: "panelLabeling", label: "Panel Labeling Done", type: "toggle" },
            { key: "dangerBoards", label: "Danger Boards Displayed", type: "toggle" },
          ],
        },
        {
          key: "protection_maintenance",
          title: "Protection and Maintenance",
          fields: [
            { key: "overloadProtection", label: "Overload Protection", type: "select", options: ["Available", "Not Available", "Defective"] },
            { key: "elcbRccbAvailability", label: "ELCB/RCCB Availability", type: "select", options: ["All Areas", "Partial", "Not Available"] },
            { key: "lockouttTagout", label: "Lockout/Tagout System", type: "select", options: ["Implemented", "Partial", "Not Implemented"] },
            { key: "electricalPermitSystem", label: "Electrical Permit System", type: "toggle" },
            { key: "ppeAvailability", label: "PPE Availability", type: "toggle" },
            { key: "trainingRecords", label: "Training Records Available", type: "toggle" },
            { key: "preventiveMaintenanceRecords", label: "Preventive Maintenance Records", type: "toggle" },
          ],
        },
        {
          key: "findings",
          title: "Findings",
          fields: [
            { key: "findings", label: "Findings", type: "table", columns: ["Finding", "Risk Category", "Severity", "Corrective Action", "Target Date"] },
            { key: "overallRating", label: "Overall Rating", type: "select", options: ["Excellent", "Good", "Satisfactory", "Needs Improvement", "Critical"] },
            { key: "auditorRemarks", label: "Auditor Remarks", type: "textarea" },
          ],
        },
      ],
    },
    isActive: true,
    validityDays: 365,
    createdBy: adminUser.id,
  });

  if (electricalRole) {
    await db.insert(auditTypeRoles).values({ auditTypeId: electricalAuditType.id, roleTypeId: electricalRole.id });
  }

  const waterAuditType = await insertReturning(auditTypes, {
    name: "Water Conservation Audit",
    category: "Environment",
    description: "Comprehensive water audit covering sources, consumption, treatment and reuse",
    formSchema: {
      sections: [
        {
          key: "general",
          title: "General Details",
          fields: [
            { key: "company", label: "Company", type: "text", required: true },
            { key: "auditDate", label: "Audit Date", type: "date", required: true },
            { key: "contactPerson", label: "Contact Person", type: "text" },
          ],
        },
        {
          key: "water_sources",
          title: "Water Sources",
          fields: [
            { key: "borewell", label: "Borewell", type: "toggle" },
            { key: "municipalWater", label: "Municipal Water", type: "toggle" },
            { key: "tanker", label: "Tanker", type: "toggle" },
            { key: "rainwaterHarvesting", label: "Rainwater Harvesting", type: "toggle" },
            { key: "recycledWater", label: "Recycled Water", type: "toggle" },
          ],
        },
        {
          key: "water_balance",
          title: "Water Balance",
          fields: [
            { key: "totalConsumption", label: "Total Monthly Consumption (KL)", type: "number" },
            { key: "procesConsumption", label: "Process Consumption (KL)", type: "number" },
            { key: "domesticConsumption", label: "Domestic Consumption (KL)", type: "number" },
            { key: "reuseQuantity", label: "Reuse Quantity (KL)", type: "number" },
            { key: "dischargeQuantity", label: "Discharge Quantity (KL)", type: "number" },
          ],
        },
        {
          key: "treatment",
          title: "Treatment and Reuse",
          fields: [
            { key: "etpAvailable", label: "ETP Available", type: "toggle" },
            { key: "stpAvailable", label: "STP Available", type: "toggle" },
            { key: "zldApplicable", label: "ZLD Applicable", type: "toggle" },
            { key: "outletCod", label: "Outlet COD (mg/L)", type: "number" },
            { key: "outletBod", label: "Outlet BOD (mg/L)", type: "number" },
            { key: "outletPh", label: "Outlet pH", type: "number" },
          ],
        },
      ],
    },
    isActive: true,
    validityDays: 365,
    createdBy: adminUser.id,
  });

  if (waterRole) {
    await db.insert(auditTypeRoles).values({ auditTypeId: waterAuditType.id, roleTypeId: waterRole.id });
  }

  const envAuditType = await insertReturning(auditTypes, {
    name: "Environmental Compliance Audit",
    category: "Environment",
    description: "Environmental audit covering consent, emissions, waste management and compliance",
    formSchema: {
      sections: [
        {
          key: "general",
          title: "General Details",
          fields: [
            { key: "company", label: "Company", type: "text", required: true },
            { key: "auditDate", label: "Audit Date", type: "date", required: true },
            { key: "consentToEstablish", label: "Consent to Establish Valid", type: "toggle" },
            { key: "consentToOperate", label: "Consent to Operate Valid", type: "toggle" },
          ],
        },
        {
          key: "air_quality",
          title: "Air Emissions",
          fields: [
            { key: "stackMonitoring", label: "Stack Monitoring Done", type: "toggle" },
            { key: "ambientAirQuality", label: "Ambient Air Quality Monitored", type: "toggle" },
            { key: "particulateMatter", label: "Particulate Matter (mg/Nm3)", type: "number" },
            { key: "sox", label: "SOx (mg/Nm3)", type: "number" },
            { key: "nox", label: "NOx (mg/Nm3)", type: "number" },
          ],
        },
        {
          key: "waste_management",
          title: "Waste Management",
          fields: [
            { key: "hazardousWasteManifest", label: "Hazardous Waste Manifest", type: "toggle" },
            { key: "eWasteManagement", label: "E-Waste Management", type: "toggle" },
            { key: "plasticWasteManagement", label: "Plastic Waste Management", type: "toggle" },
            { key: "wasteDisposalRoute", label: "Waste Disposal Route", type: "text" },
          ],
        },
        {
          key: "findings",
          title: "Non-Compliances",
          fields: [
            { key: "nonCompliances", label: "Non-Compliances", type: "table", columns: ["Item", "Requirement", "Status", "Corrective Action", "Due Date"] },
            { key: "overallCompliance", label: "Overall Compliance", type: "select", options: ["Compliant", "Partially Compliant", "Non-Compliant"] },
          ],
        },
      ],
    },
    isActive: true,
    validityDays: 365,
    createdBy: adminUser.id,
  });

  if (envRole) {
    await db.insert(auditTypeRoles).values({ auditTypeId: envAuditType.id, roleTypeId: envRole.id });
  }

  const payrollAuditType = await insertReturning(auditTypes, {
    name: "Payroll and Wage Compliance Audit",
    category: "Compliance",
    description: "Audit of payroll processing, wage compliance, statutory deductions and records",
    formSchema: {
      sections: [
        {
          key: "general",
          title: "General Details",
          fields: [
            { key: "company", label: "Company", type: "text", required: true },
            { key: "wageMonth", label: "Wage Month", type: "text", required: true },
            { key: "auditDate", label: "Audit Date", type: "date", required: true },
          ],
        },
        {
          key: "wage_records",
          title: "Wage Records",
          fields: [
            { key: "wageRegisterMaintained", label: "Wage Register Maintained", type: "toggle" },
            { key: "salarySlipsIssued", label: "Salary Slips Issued", type: "toggle" },
            { key: "minimumWageCompliance", label: "Minimum Wage Compliance", type: "toggle" },
            { key: "otCompliance", label: "Overtime Compliance", type: "toggle" },
            { key: "pfCompliance", label: "PF Compliance", type: "toggle" },
            { key: "esiCompliance", label: "ESI Compliance", type: "toggle" },
          ],
        },
        {
          key: "employee_sample",
          title: "Sample Employee Records",
          fields: [
            { key: "sampleRecords", label: "Sample Records", type: "table", columns: ["Emp No", "Name", "Days Worked", "Gross", "PF", "ESI", "Net", "Status"] },
          ],
        },
      ],
    },
    isActive: true,
    validityDays: 365,
    createdBy: adminUser.id,
  });

  if (payrollRole) {
    await db.insert(auditTypeRoles).values({ auditTypeId: payrollAuditType.id, roleTypeId: payrollRole.id });
  }

  console.log("Created audit types");

  // Create a sample audit
  await db.insert(audits).values({
    auditTypeId: electricalAuditType.id,
    auditorId: auditor1.id,
    employerId: employer1.id,
    assignmentId: assignment1.id,
    status: "draft",
    auditDate: asDate("2026-07-20"),
    formData: {
      general: {
        company: "TechCorp Industries Pvt Ltd",
        siteLocation: "Chennai Plant 1",
        auditDate: "2026-07-20",
        numberOfEmployees: 150,
        auditScope: "Annual electrical safety assessment",
      },
    },
    createdBy: auditor1User.id,
  });

  // Create Payroll Run
  const payrollRun = await insertReturning(payrollRuns, {
    employerId: employer1.id,
    month: 6,
    year: 2026,
    status: "locked",
    totalGross: "123000",
    totalDeductions: "18000",
    totalNet: "105000",
    totalEmployerPf: "14760",
    totalEmployerEsi: "4022",
    processedAt: new Date(),
    approvedAt: new Date(),
    lockedAt: new Date(),
    createdBy: hrUser.id,
    approvedBy: employerUser.id,
  });

  // Create Payroll Lines and Salary Slips
  for (let i = 0; i < insertedEmployees.length; i++) {
    const emp = insertedEmployees[i];
    const w = wageData[i];
    const gross = parseFloat(w.basic) + parseFloat(w.da) + parseFloat(w.hra) + parseFloat(w.ta);
    const pf = parseFloat(w.basic) * 0.12;
    const esi = gross <= 21000 ? gross * 0.0075 : 0;
    const pt = 200;
    const total_ded = pf + esi + pt;
    const net = gross - total_ded;

    const line = await insertReturning(payrollLines, {
      payrollRunId: payrollRun.id,
      employeeId: emp.id,
      employerId: employer1.id,
      month: 6,
      year: 2026,
      daysInMonth: 30,
      daysWorked: "30",
      daysLop: "0",
      basic: w.basic,
      da: w.da,
      hra: w.hra,
      ta: w.ta,
      grossEarnings: gross.toString(),
      pfDeduction: pf.toString(),
      esiDeduction: esi.toString(),
      ptDeduction: pt.toString(),
      totalDeductions: total_ded.toString(),
      netWage: net.toString(),
      employerPf: (parseFloat(w.basic) * 0.13).toString(),
      employerEsi: (gross * 0.0325).toString(),
    });

    await db.insert(salarySlips).values({
      payrollLineId: line.id,
      employeeId: emp.id,
      employerId: employer1.id,
      month: 6,
      year: 2026,
      generatedAt: new Date(),
    });
  }

  console.log("Created payroll data");

  // Create Legal Acts
  await db.insert(legalActs).values([
    { name: "Factories Act, 1948", shortName: "Factories Act", description: "Regulation of factories and safety of workers", isActive: true, createdBy: adminUser.id },
    { name: "Minimum Wages Act, 1948", shortName: "MWA", description: "Fixing minimum wages for certain employments", isActive: true, createdBy: adminUser.id },
    { name: "Employees Provident Fund Act, 1952", shortName: "EPF Act", description: "Provident fund for employees in certain industries", isActive: true, createdBy: adminUser.id },
    { name: "Employees State Insurance Act, 1948", shortName: "ESI Act", description: "State insurance for workers", isActive: true, createdBy: adminUser.id },
    { name: "Environment Protection Act, 1986", shortName: "EPA", description: "Protection and improvement of environment", isActive: true, createdBy: adminUser.id },
  ]);

  // Create Compliance Calendar
  await insertManyReturning(complianceCalendar, [
    { employerId: employer1.id, title: "Monthly PF Return Filing", description: "File monthly PF return with EPFO", dueDate: asDate("2026-07-15"), frequency: "monthly", status: "pending", createdBy: adminUser.id },
    { employerId: employer1.id, title: "Monthly ESI Return Filing", description: "File monthly ESI return", dueDate: asDate("2026-07-21"), frequency: "monthly", status: "pending", createdBy: adminUser.id },
    { employerId: employer1.id, title: "Annual Electrical Safety Audit", description: "Mandatory annual electrical audit", dueDate: asDate("2026-08-01"), frequency: "annual", status: "pending", createdBy: adminUser.id },
    { employerId: employer1.id, title: "Water Discharge Compliance Report", description: "Quarterly water discharge report to TNPCB", dueDate: asDate("2026-09-30"), frequency: "quarterly", status: "pending", createdBy: adminUser.id },
  ]);

  // Create Notifications
  await db.insert(notifications).values([
    { userId: employerUser.id, title: "Payroll Ready", message: "June 2026 payroll has been finalized. 6 salary slips generated.", type: "info" },
    { userId: employerUser.id, title: "Leave Request", message: "Arun Murugan has applied for 2 days casual leave from July 15-16.", type: "warning" },
    { userId: auditor1User.id, title: "New Assignment", message: "You have been assigned to audit TechCorp Industries.", type: "info" },
  ]);

  // Create Digital Credentials
  await insertManyReturning(digitalCredentials, [
    {
      credentialId: "CRED-AUD-2026-001",
      ownerType: "auditor",
      ownerId: auditor1.id,
      userId: auditor1User.id,
      digitalVerificationNumber: "DVN-AUD-2026-RAVI-001",
      qrPayload: JSON.stringify({ id: "CRED-AUD-2026-001", type: "auditor", name: "Ravi Kumar" }),
      validFrom: asDate("2026-01-01"),
      validTo: asDate("2027-12-31"),
      status: "active",
      issuedBy: adminUser.id,
    },
  ]);

  // System Audit Log entries
  await db.insert(systemAuditLog).values([
    { userId: adminUser.id, action: "Created employer TechCorp Industries", entityType: "employer", entityId: employer1.id },
    { userId: adminUser.id, action: "Created auditor Ravi Kumar", entityType: "auditor", entityId: auditor1.id },
    { userId: adminUser.id, action: "Assigned auditor to TechCorp Industries", entityType: "auditor_assignment", entityId: assignment1.id },
  ]);

  console.log("Seed completed successfully!");
  console.log("\n=== DEMO CREDENTIALS ===");
  console.log("Super Admin: superadmin@compliancehub.com / Admin@123456");
  console.log("Admin: admin@compliancehub.com / Admin@123456");
  console.log("Auditor: auditor@compliancehub.com / Audit@123456");
  console.log("Employer: employer@techcorp.com / Employer@123456");
  console.log("HR Manager: hr@techcorp.com / Hr@123456");
  console.log("Employee: emp001@techcorp.com / Employee@123456");
  console.log("========================");
}

main().catch(console.error).finally(() => process.exit(0));
