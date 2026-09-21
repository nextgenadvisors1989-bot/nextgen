import {
  mysqlTable,
  text,
  varchar,
  int,
  boolean,
  timestamp,
  json,
  decimal,
  date,
  uniqueIndex,
  index,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleValues = [
  "super_admin",
  "admin",
  "auditor",
  "employer_admin",
  "hr_manager",
  "employee",
] as const;

export const accountStatusValues = [
  "pending_verification",
  "pending",
  "pending_activation",
  "active",
  "inactive",
  "suspended",
  "rejected",
] as const;

export const registrationStatusValues = [
  "draft",
  "pending_documents",
  "documents_verified",
  "assessed",
  "approved",
  "pending_activation",
  "active",
  "rejected",
  "suspended",
] as const;

export const documentStatusValues = [
  "pending",
  "verified",
  "rejected",
  "expired",
] as const;

export const auditStatusValues = [
  "draft",
  "submitted",
  "under_review",
  "revision_requested",
  "revised",
  "approved",
  "rejected",
  "closed",
] as const;

export const leaveTypeValues = [
  "casual",
  "earned",
  "sick",
  "lop",
  "maternity",
  "paternity",
  "festival",
  "compensatory",
  "other",
] as const;

export const leaveStatusValues = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export const attendanceMethodValues = [
  "manual",
  "biometric",
  "webcam",
  "geo_fence",
] as const;

export const payrollStatusValues = [
  "draft",
  "calculated",
  "approved",
  "locked",
  "paid",
] as const;

export const employeeTypeValues = [
  "regular",
  "temporary",
  "contractor",
] as const;

export const genderValues = ["male", "female", "other"] as const;

export const credentialStatusValues = [
  "active",
  "inactive",
  "revoked",
  "expired",
] as const;

export const permissionActionValues = [
  "none",
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "full",
] as const;

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    username: varchar("username", { length: 100 }),
    passwordHash: text("password_hash").notNull(),
    role: mysqlEnum("role", userRoleValues).notNull().default("employee"),
    status: mysqlEnum("status", accountStatusValues).notNull().default("pending_verification"),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    phone: varchar("phone", { length: 20 }),
    employerId: int("employer_id"),
    auditorId: int("auditor_id"),
    employeeId: int("employee_id"),
    forcePasswordChange: boolean("force_password_change").notNull().default(false),
    emailVerifiedAt: timestamp("email_verified_at"),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdBy: int("created_by"),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    index("users_role_idx").on(t.role),
    index("users_status_idx").on(t.status),
    index("users_employer_idx").on(t.employerId),
  ]
);

export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  refreshToken: varchar("refresh_token", { length: 512 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
});

export const passwordResetTokens = mysqlTable("password_reset_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  token: varchar("token", { length: 512 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const emailVerificationTokens = mysqlTable("email_verification_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  token: varchar("token", { length: 512 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── RBAC ─────────────────────────────────────────────────────────────────────

export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 200 }),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const modules = mysqlTable("modules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 200 }),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    roleId: int("role_id").notNull(),
    moduleId: int("module_id").notNull(),
    action: mysqlEnum("action", permissionActionValues).notNull().default("none"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedBy: int("updated_by"),
  },
  (t) => [
    index("rp_role_idx").on(t.roleId),
    index("rp_module_idx").on(t.moduleId),
  ]
);

// ─── Locations ────────────────────────────────────────────────────────────────

export const locations = mysqlTable("locations", {
  id: int("id").autoincrement().primaryKey(),
  state: varchar("state", { length: 100 }).notNull(),
  district: varchar("district", { length: 100 }),
  city: varchar("city", { length: 100 }),
  pincode: varchar("pincode", { length: 10 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const grades = mysqlTable("grades", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const designations = mysqlTable("designations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  departmentId: int("department_id"),
  gradeId: int("grade_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Employers ────────────────────────────────────────────────────────────────

export const employers = mysqlTable(
  "employers",
  {
    id: int("id").autoincrement().primaryKey(),
    registrationId: varchar("registration_id", { length: 50 }).unique(),
    companyName: varchar("company_name", { length: 300 }).notNull(),
    tradeName: varchar("trade_name", { length: 300 }),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    address: text("address"),
    state: varchar("state", { length: 100 }),
    district: varchar("district", { length: 100 }),
    pincode: varchar("pincode", { length: 10 }),
    industry: varchar("industry", { length: 200 }),
    gstNumber: varchar("gst_number", { length: 20 }),
    panNumber: varchar("pan_number", { length: 20 }),
    cinNumber: varchar("cin_number", { length: 30 }),
    epfRegNumber: varchar("epf_reg_number", { length: 50 }),
    esiRegNumber: varchar("esi_reg_number", { length: 50 }),
    totalEmployees: int("total_employees").default(0),
    status: mysqlEnum("status", accountStatusValues).notNull().default("pending"),
    logoUrl: text("logo_url"),
    website: varchar("website", { length: 300 }),
    contactPersonName: varchar("contact_person_name", { length: 200 }),
    contactPersonPhone: varchar("contact_person_phone", { length: 20 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdBy: int("created_by"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("employers_status_idx").on(t.status),
    index("employers_state_idx").on(t.state),
  ]
);

export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  employerId: int("employer_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  headEmployeeId: int("head_employee_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// ─── Employees ────────────────────────────────────────────────────────────────

export const employees = mysqlTable(
  "employees",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeNumber: varchar("employee_number", { length: 50 }),
    employerId: int("employer_id").notNull(),
    userId: int("user_id"),
    registrationId: varchar("registration_id", { length: 50 }).unique(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 20 }),
    dateOfBirth: date("date_of_birth"),
    gender: mysqlEnum("gender", genderValues),
    maritalStatus: varchar("marital_status", { length: 20 }),
    fatherSpouseName: varchar("father_spouse_name", { length: 200 }),
    presentAddress: text("present_address"),
    permanentAddress: text("permanent_address"),
    emergencyContact: json("emergency_contact"),
    employeeType: mysqlEnum("employee_type", employeeTypeValues).notNull().default("regular"),
    departmentId: int("department_id"),
    designationId: int("designation_id"),
    gradeId: int("grade_id"),
    joiningDate: date("joining_date"),
    confirmationDate: date("confirmation_date"),
    workLocation: varchar("work_location", { length: 200 }),
    shiftId: int("shift_id"),
    workingHours: decimal("working_hours", { precision: 4, scale: 2 }),
    weeklyOff: varchar("weekly_off", { length: 20 }).default("sunday"),
    pfNumber: varchar("pf_number", { length: 50 }),
    uan: varchar("uan", { length: 30 }),
    esiNumber: varchar("esi_number", { length: 30 }),
    bankAccount: varchar("bank_account", { length: 50 }),
    bankName: varchar("bank_name", { length: 100 }),
    ifsc: varchar("ifsc", { length: 20 }),
    aadhaarRef: varchar("aadhaar_ref", { length: 50 }),
    panNumber: varchar("pan_number", { length: 20 }),
    qualification: text("qualification"),
    previousExperience: text("previous_experience"),
    status: mysqlEnum("status", accountStatusValues).notNull().default("pending"),
    contractValidTo: date("contract_valid_to"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdBy: int("created_by"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("employees_employer_idx").on(t.employerId),
    index("employees_status_idx").on(t.status),
    index("employees_dept_idx").on(t.departmentId),
    index("employees_type_idx").on(t.employeeType),
  ]
);

// ─── Auditors ─────────────────────────────────────────────────────────────────

export const auditorRoleTypes = mysqlTable("auditor_role_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditors = mysqlTable(
  "auditors",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id"),
    registrationId: varchar("registration_id", { length: 50 }).unique(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    dateOfBirth: date("date_of_birth"),
    gender: mysqlEnum("gender", genderValues),
    organization: varchar("organization", { length: 300 }),
    assessorNumber: varchar("assessor_number", { length: 100 }),
    experience: int("experience"),
    qualification: text("qualification"),
    certification: text("certification"),
    state: varchar("state", { length: 100 }),
    district: varchar("district", { length: 100 }),
    languages: json("languages").$type<string[]>(),
    profilePhotoUrl: text("profile_photo_url"),
    validityStart: date("validity_start"),
    validityEnd: date("validity_end"),
    maxActiveAssignments: int("max_active_assignments").default(5),
    status: mysqlEnum("status", accountStatusValues).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdBy: int("created_by"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("auditors_status_idx").on(t.status),
    index("auditors_email_idx").on(t.email),
  ]
);

export const auditorRoles = mysqlTable("auditor_roles", {
  id: int("id").autoincrement().primaryKey(),
  auditorId: int("auditor_id").notNull(),
  roleTypeId: int("role_type_id").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: int("assigned_by"),
});

export const auditorScopes = mysqlTable("auditor_scopes", {
  id: int("id").autoincrement().primaryKey(),
  auditorId: int("auditor_id").notNull(),
  scope: varchar("scope", { length: 200 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditorAssignments = mysqlTable(
  "auditor_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    auditorId: int("auditor_id").notNull(),
    employerId: int("employer_id").notNull(),
    assignedBy: int("assigned_by"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("aa_auditor_idx").on(t.auditorId),
    index("aa_employer_idx").on(t.employerId),
  ]
);

// ─── Registrations ────────────────────────────────────────────────────────────

export const registrations = mysqlTable(
  "registrations",
  {
    id: int("id").autoincrement().primaryKey(),
    registrationNumber: varchar("registration_number", { length: 50 }).unique(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: int("entity_id"),
    status: mysqlEnum("status", registrationStatusValues).notNull().default("draft"),
    submittedAt: timestamp("submitted_at"),
    verifiedAt: timestamp("verified_at"),
    assessedAt: timestamp("assessed_at"),
    approvedAt: timestamp("approved_at"),
    rejectedAt: timestamp("rejected_at"),
    rejectionReason: text("rejection_reason"),
    notes: text("notes"),
    assessmentData: json("assessment_data"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdBy: int("created_by"),
    reviewedBy: int("reviewed_by"),
  },
  (t) => [
    index("reg_status_idx").on(t.status),
    index("reg_entity_idx").on(t.entityType, t.entityId),
  ]
);

export const registrationDocuments = mysqlTable("registration_documents", {
  id: int("id").autoincrement().primaryKey(),
  registrationId: int("registration_id").notNull(),
  documentType: varchar("document_type", { length: 100 }).notNull(),
  fileName: varchar("file_name", { length: 300 }),
  fileUrl: text("file_url"),
  fileSize: int("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  status: mysqlEnum("status", documentStatusValues).notNull().default("pending"),
  verifiedBy: int("verified_by"),
  verifiedAt: timestamp("verified_at"),
  rejectionReason: text("rejection_reason"),
  expiryDate: date("expiry_date"),
  version: int("version").notNull().default(1),
  uploadedBy: int("uploaded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Digital Credentials ──────────────────────────────────────────────────────

export const digitalCredentials = mysqlTable("digital_credentials", {
  id: int("id").autoincrement().primaryKey(),
  credentialId: varchar("credential_id", { length: 50 }).unique(),
  ownerType: varchar("owner_type", { length: 50 }).notNull(),
  ownerId: int("owner_id").notNull(),
  userId: int("user_id"),
  digitalVerificationNumber: varchar("digital_verification_number", { length: 100 }).unique(),
  qrPayload: text("qr_payload"),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  status: mysqlEnum("status", credentialStatusValues).notNull().default("active"),
  issuedBy: int("issued_by"),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  lastReissuedAt: timestamp("last_reissued_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Audit Types ──────────────────────────────────────────────────────────────

export const auditTypes = mysqlTable("audit_types", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }),
  description: text("description"),
  formSchema: json("form_schema"),
  isActive: boolean("is_active").notNull().default(true),
  validityDays: int("validity_days"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: int("created_by"),
});

export const auditTypeRoles = mysqlTable("audit_type_roles", {
  id: int("id").autoincrement().primaryKey(),
  auditTypeId: int("audit_type_id").notNull(),
  roleTypeId: int("role_type_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Audits ───────────────────────────────────────────────────────────────────

export const audits = mysqlTable(
  "audits",
  {
    id: int("id").autoincrement().primaryKey(),
    auditNumber: varchar("audit_number", { length: 50 }).unique(),
    auditTypeId: int("audit_type_id").notNull(),
    auditorId: int("auditor_id").notNull(),
    employerId: int("employer_id").notNull(),
    assignmentId: int("assignment_id"),
    status: mysqlEnum("status", auditStatusValues).notNull().default("draft"),
    formData: json("form_data"),
    auditDate: date("audit_date"),
    submittedAt: timestamp("submitted_at"),
    reviewedAt: timestamp("reviewed_at"),
    approvedAt: timestamp("approved_at"),
    signatureData: text("signature_data"),
    pdfUrl: text("pdf_url"),
    notes: text("notes"),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdBy: int("created_by"),
    reviewedBy: int("reviewed_by"),
  },
  (t) => [
    index("audits_auditor_idx").on(t.auditorId),
    index("audits_employer_idx").on(t.employerId),
    index("audits_status_idx").on(t.status),
    index("audits_type_idx").on(t.auditTypeId),
  ]
);

export const auditRevisions = mysqlTable("audit_revisions", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("audit_id").notNull(),
  revisionNumber: int("revision_number").notNull().default(1),
  formData: json("form_data"),
  notes: text("notes"),
  createdBy: int("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditFindings = mysqlTable("audit_findings", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("audit_id").notNull(),
  findingNumber: varchar("finding_number", { length: 50 }),
  description: text("description").notNull(),
  riskCategory: varchar("risk_category", { length: 50 }),
  severity: varchar("severity", { length: 50 }),
  legalRequirement: text("legal_requirement"),
  responsiblePerson: varchar("responsible_person", { length: 200 }),
  targetDate: date("target_date"),
  correctiveAction: text("corrective_action"),
  status: varchar("status", { length: 50 }).default("open"),
  evidenceUrl: text("evidence_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: int("created_by"),
});

export const correctiveActions = mysqlTable("corrective_actions", {
  id: int("id").autoincrement().primaryKey(),
  findingId: int("finding_id").notNull(),
  auditId: int("audit_id").notNull(),
  description: text("description").notNull(),
  assignedTo: varchar("assigned_to", { length: 200 }),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  status: varchar("status", { length: 50 }).default("open"),
  evidenceUrl: text("evidence_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: int("created_by"),
});

// ─── Legal Master ─────────────────────────────────────────────────────────────

export const legalActs = mysqlTable("legal_acts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 300 }).notNull(),
  shortName: varchar("short_name", { length: 50 }),
  description: text("description"),
  applicableStates: json("applicable_states").$type<string[]>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: int("created_by"),
});

export const complianceCalendar = mysqlTable("compliance_calendar", {
  id: int("id").autoincrement().primaryKey(),
  employerId: int("employer_id"),
  legalActId: int("legal_act_id"),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  dueDate: date("due_date").notNull(),
  frequency: varchar("frequency", { length: 50 }),
  status: varchar("status", { length: 50 }).default("pending"),
  assignedTo: varchar("assigned_to", { length: 200 }),
  completedAt: timestamp("completed_at"),
  reminderDays: int("reminder_days").default(7),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: int("created_by"),
});

// ─── Shifts ───────────────────────────────────────────────────────────────────

export const shifts = mysqlTable("shifts", {
  id: int("id").autoincrement().primaryKey(),
  employerId: int("employer_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  startTime: varchar("start_time", { length: 10 }).notNull(),
  endTime: varchar("end_time", { length: 10 }).notNull(),
  breakMinutes: int("break_minutes").default(30),
  workingHours: decimal("working_hours", { precision: 4, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Attendance ───────────────────────────────────────────────────────────────

export const attendance = mysqlTable(
  "attendance",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: int("employee_id").notNull(),
    employerId: int("employer_id").notNull(),
    date: date("date").notNull(),
    clockIn: timestamp("clock_in"),
    clockOut: timestamp("clock_out"),
    method: mysqlEnum("method", attendanceMethodValues).default("manual"),
    status: varchar("status", { length: 50 }).default("present"),
    hoursWorked: decimal("hours_worked", { precision: 5, scale: 2 }),
    overtimeHours: decimal("overtime_hours", { precision: 5, scale: 2 }),
    isLateArrival: boolean("is_late_arrival").default(false),
    isEarlyDeparture: boolean("is_early_departure").default(false),
    remarks: text("remarks"),
    approvedBy: int("approved_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdBy: int("created_by"),
  },
  (t) => [
    index("att_employee_idx").on(t.employeeId),
    index("att_employer_idx").on(t.employerId),
    index("att_date_idx").on(t.date),
  ]
);

export const attendanceCorrections = mysqlTable("attendance_corrections", {
  id: int("id").autoincrement().primaryKey(),
  attendanceId: int("attendance_id").notNull(),
  employeeId: int("employee_id").notNull(),
  requestedClockIn: timestamp("requested_clock_in"),
  requestedClockOut: timestamp("requested_clock_out"),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  reviewedBy: int("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Leave ────────────────────────────────────────────────────────────────────

export const leavePolicies = mysqlTable("leave_policies", {
  id: int("id").autoincrement().primaryKey(),
  employerId: int("employer_id").notNull(),
  leaveType: mysqlEnum("leave_type", leaveTypeValues).notNull(),
  annualDays: decimal("annual_days", { precision: 5, scale: 2 }).notNull(),
  carryForward: boolean("carry_forward").default(false),
  maxCarryForward: decimal("max_carry_forward", { precision: 5, scale: 2 }),
  applicableEmployeeTypes: json("applicable_employee_types").$type<string[]>(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const leaveBalances = mysqlTable("leave_balances", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id").notNull(),
  employerId: int("employer_id").notNull(),
  leaveType: mysqlEnum("leave_type", leaveTypeValues).notNull(),
  year: int("year").notNull(),
  openingBalance: decimal("opening_balance", { precision: 7, scale: 2 }).default("0"),
  accrued: decimal("accrued", { precision: 7, scale: 2 }).default("0"),
  used: decimal("used", { precision: 7, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 7, scale: 2 }).default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const leaveRequests = mysqlTable(
  "leave_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: int("employee_id").notNull(),
    employerId: int("employer_id").notNull(),
    leaveType: mysqlEnum("leave_type", leaveTypeValues).notNull(),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    days: decimal("days", { precision: 5, scale: 2 }).notNull(),
    reason: text("reason"),
    status: mysqlEnum("status", leaveStatusValues).notNull().default("pending"),
    approvedBy: int("approved_by"),
    approvedAt: timestamp("approved_at"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("lr_employee_idx").on(t.employeeId),
    index("lr_employer_idx").on(t.employerId),
    index("lr_status_idx").on(t.status),
  ]
);

export const permissionRequests = mysqlTable("permission_requests", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id").notNull(),
  employerId: int("employer_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  date: date("date").notNull(),
  fromTime: varchar("from_time", { length: 10 }),
  toTime: varchar("to_time", { length: 10 }),
  reason: text("reason"),
  status: varchar("status", { length: 50 }).default("pending"),
  approvedBy: int("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Payroll ──────────────────────────────────────────────────────────────────

export const wageConfigs = mysqlTable("wage_configs", {
  id: int("id").autoincrement().primaryKey(),
  employerId: int("employer_id").notNull(),
  employeeId: int("employee_id"),
  name: varchar("name", { length: 200 }),
  basic: decimal("basic", { precision: 12, scale: 2 }).default("0"),
  da: decimal("da", { precision: 12, scale: 2 }).default("0"),
  hra: decimal("hra", { precision: 12, scale: 2 }).default("0"),
  ta: decimal("ta", { precision: 12, scale: 2 }).default("0"),
  otherAllowances: decimal("other_allowances", { precision: 12, scale: 2 }).default("0"),
  grossWage: decimal("gross_wage", { precision: 12, scale: 2 }).default("0"),
  pfPercentage: decimal("pf_percentage", { precision: 5, scale: 2 }).default("12"),
  esiPercentage: decimal("esi_percentage", { precision: 5, scale: 2 }).default("0.75"),
  ptAmount: decimal("pt_amount", { precision: 10, scale: 2 }).default("0"),
  overtimeMultiplier: decimal("overtime_multiplier", { precision: 4, scale: 2 }).default("1.5"),
  effectiveFrom: date("effective_from"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: int("created_by"),
});

export const payrollRuns = mysqlTable(
  "payroll_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    employerId: int("employer_id").notNull(),
    month: int("month").notNull(),
    year: int("year").notNull(),
    status: mysqlEnum("status", payrollStatusValues).notNull().default("draft"),
    totalGross: decimal("total_gross", { precision: 14, scale: 2 }),
    totalDeductions: decimal("total_deductions", { precision: 14, scale: 2 }),
    totalNet: decimal("total_net", { precision: 14, scale: 2 }),
    totalEmployerPf: decimal("total_employer_pf", { precision: 14, scale: 2 }),
    totalEmployerEsi: decimal("total_employer_esi", { precision: 14, scale: 2 }),
    processedAt: timestamp("processed_at"),
    approvedAt: timestamp("approved_at"),
    lockedAt: timestamp("locked_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdBy: int("created_by"),
    approvedBy: int("approved_by"),
  },
  (t) => [
    index("pr_employer_idx").on(t.employerId),
    index("pr_status_idx").on(t.status),
  ]
);

export const payrollLines = mysqlTable("payroll_lines", {
  id: int("id").autoincrement().primaryKey(),
  payrollRunId: int("payroll_run_id").notNull(),
  employeeId: int("employee_id").notNull(),
  employerId: int("employer_id").notNull(),
  month: int("month").notNull(),
  year: int("year").notNull(),
  daysInMonth: int("days_in_month").default(30),
  daysWorked: decimal("days_worked", { precision: 5, scale: 2 }).default("0"),
  daysLop: decimal("days_lop", { precision: 5, scale: 2 }).default("0"),
  overtimeHours: decimal("overtime_hours", { precision: 5, scale: 2 }).default("0"),
  basic: decimal("basic", { precision: 12, scale: 2 }).default("0"),
  da: decimal("da", { precision: 12, scale: 2 }).default("0"),
  hra: decimal("hra", { precision: 12, scale: 2 }).default("0"),
  ta: decimal("ta", { precision: 12, scale: 2 }).default("0"),
  overtimeWage: decimal("overtime_wage", { precision: 12, scale: 2 }).default("0"),
  incentive: decimal("incentive", { precision: 12, scale: 2 }).default("0"),
  bonus: decimal("bonus", { precision: 12, scale: 2 }).default("0"),
  grossEarnings: decimal("gross_earnings", { precision: 12, scale: 2 }).default("0"),
  pfDeduction: decimal("pf_deduction", { precision: 12, scale: 2 }).default("0"),
  esiDeduction: decimal("esi_deduction", { precision: 12, scale: 2 }).default("0"),
  ptDeduction: decimal("pt_deduction", { precision: 12, scale: 2 }).default("0"),
  otherDeductions: decimal("other_deductions", { precision: 12, scale: 2 }).default("0"),
  messDeduction: decimal("mess_deduction", { precision: 12, scale: 2 }).default("0"),
  totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 }).default("0"),
  netWage: decimal("net_wage", { precision: 12, scale: 2 }).default("0"),
  employerPf: decimal("employer_pf", { precision: 12, scale: 2 }).default("0"),
  employerEsi: decimal("employer_esi", { precision: 12, scale: 2 }).default("0"),
  bankPaymentStatus: varchar("bank_payment_status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const salarySlips = mysqlTable("salary_slips", {
  id: int("id").autoincrement().primaryKey(),
  payrollLineId: int("payroll_line_id").notNull(),
  employeeId: int("employee_id").notNull(),
  employerId: int("employer_id").notNull(),
  month: int("month").notNull(),
  year: int("year").notNull(),
  pdfUrl: text("pdf_url"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Benefits and Deductions ──────────────────────────────────────────────────

export const benefits = mysqlTable("benefits", {
  id: int("id").autoincrement().primaryKey(),
  employerId: int("employer_id").notNull(),
  employeeId: int("employee_id"),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }),
  value: decimal("value", { precision: 12, scale: 2 }),
  frequency: varchar("frequency", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const deductions = mysqlTable("deductions", {
  id: int("id").autoincrement().primaryKey(),
  employerId: int("employer_id").notNull(),
  employeeId: int("employee_id"),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }),
  value: decimal("value", { precision: 12, scale: 2 }),
  frequency: varchar("frequency", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const fullFinalSettlements = mysqlTable("full_final_settlements", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id").notNull(),
  employerId: int("employer_id").notNull(),
  lastWorkingDate: date("last_working_date"),
  reasonForLeaving: text("reason_for_leaving"),
  noticePeriodDays: int("notice_period_days"),
  noticePeriodServed: int("notice_period_served"),
  noticePeriodShortfall: int("notice_period_shortfall"),
  pendingWage: decimal("pending_wage", { precision: 12, scale: 2 }),
  leaveEncashment: decimal("leave_encashment", { precision: 12, scale: 2 }),
  gratuity: decimal("gratuity", { precision: 12, scale: 2 }),
  bonus: decimal("bonus", { precision: 12, scale: 2 }),
  deductions: decimal("deductions", { precision: 12, scale: 2 }),
  netPayable: decimal("net_payable", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 50 }).default("draft"),
  approvedBy: int("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: int("created_by"),
});

// ─── Training ─────────────────────────────────────────────────────────────────

export const trainingRecords = mysqlTable("training_records", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id").notNull(),
  employerId: int("employer_id").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  trainedBy: varchar("trained_by", { length: 200 }),
  trainingDate: date("training_date"),
  expiryDate: date("expiry_date"),
  status: varchar("status", { length: 50 }).default("completed"),
  certificateUrl: text("certificate_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: int("created_by"),
});

export const healthSafetyAcknowledgements = mysqlTable("health_safety_acknowledgements", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id").notNull(),
  employerId: int("employer_id").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  acknowledgedAt: timestamp("acknowledged_at"),
  expiryDate: date("expiry_date"),
  signatureData: text("signature_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Documents ────────────────────────────────────────────────────────────────

export const documentUploads = mysqlTable(
  "document_uploads",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerType: varchar("owner_type", { length: 50 }).notNull(),
    ownerId: int("owner_id").notNull(),
    employerId: int("employer_id"),
    documentType: varchar("document_type", { length: 100 }).notNull(),
    fileName: varchar("file_name", { length: 300 }),
    fileUrl: text("file_url"),
    fileSize: int("file_size"),
    mimeType: varchar("mime_type", { length: 100 }),
    version: int("version").notNull().default(1),
    status: mysqlEnum("status", documentStatusValues).notNull().default("pending"),
    verifiedBy: int("verified_by"),
    verifiedAt: timestamp("verified_at"),
    rejectionReason: text("rejection_reason"),
    expiryDate: date("expiry_date"),
    uploadedBy: int("uploaded_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("du_owner_idx").on(t.ownerType, t.ownerId),
    index("du_employer_idx").on(t.employerId),
    index("du_status_idx").on(t.status),
  ]
);

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).default("info"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  link: varchar("link", { length: 500 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── System Audit Log ─────────────────────────────────────────────────────────

export const systemAuditLog = mysqlTable(
  "system_audit_log",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id"),
    action: varchar("action", { length: 200 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }),
    entityId: int("entity_id"),
    oldData: json("old_data"),
    newData: json("new_data"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("sal_user_idx").on(t.userId),
    index("sal_entity_idx").on(t.entityType, t.entityId),
    index("sal_created_idx").on(t.createdAt),
  ]
);

// ─── Quotations and Billing ───────────────────────────────────────────────────

export const quotations = mysqlTable("quotations", {
  id: int("id").autoincrement().primaryKey(),
  quotationNumber: varchar("quotation_number", { length: 50 }).unique(),
  employerId: int("employer_id"),
  title: varchar("title", { length: 300 }),
  description: text("description"),
  amount: decimal("amount", { precision: 14, scale: 2 }),
  status: varchar("status", { length: 50 }).default("draft"),
  validUntil: date("valid_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: int("created_by"),
});
