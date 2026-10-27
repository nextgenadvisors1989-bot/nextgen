# Database schema

Generated from the live `compliance_platform` schema on 2026-10-06T13:47:34.366Z by
`npx tsx scripts/generate-schema-docs.ts`. Regenerate after every migration.

**93 tables.** All tables are InnoDB with `utf8mb4_unicode_ci` collation.
Migrations live in `database/migrations` (numbered, applied in order and recorded in
`schema_migrations`); reference data lives in `database/seeds`.

## Table index

- [activity_logs](#activity-logs) — 6 row(s)
- [assessment_reports](#assessment-reports) — 0 row(s)
- [attendance](#attendance) — 0 row(s)
- [auditors](#auditors) — 0 row(s)
- [auditor_types](#auditor-types) — 8 row(s)
- [audit_assignments](#audit-assignments) — 0 row(s)
- [audit_reports](#audit-reports) — 0 row(s)
- [audit_report_comments](#audit-report-comments) — 0 row(s)
- [audit_report_versions](#audit-report-versions) — 0 row(s)
- [audit_trails](#audit-trails) — 0 row(s)
- [backup_history](#backup-history) — 2 row(s)
- [bonus_records](#bonus-records) — 0 row(s)
- [calendar_events](#calendar-events) — 0 row(s)
- [cms_media](#cms-media) — 0 row(s)
- [cms_pages](#cms-pages) — 0 row(s)
- [cms_page_sections](#cms-page-sections) — 0 row(s)
- [cms_resources](#cms-resources) — 0 row(s)
- [company_units](#company-units) — 2 row(s)
- [compliance_acts](#compliance-acts) — 0 row(s)
- [compliance_documents](#compliance-documents) — 0 row(s)
- [compliance_notifications](#compliance-notifications) — 0 row(s)
- [compliance_regulations](#compliance-regulations) — 0 row(s)
- [compliance_rules](#compliance-rules) — 0 row(s)
- [contact_enquiries](#contact-enquiries) — 0 row(s)
- [departments](#departments) — 2 row(s)
- [document_sequences](#document-sequences) — 0 row(s)
- [dynamic_field_options](#dynamic-field-options) — 0 row(s)
- [dynamic_forms](#dynamic-forms) — 0 row(s)
- [dynamic_form_fields](#dynamic-form-fields) — 0 row(s)
- [dynamic_form_sections](#dynamic-form-sections) — 0 row(s)
- [dynamic_form_submissions](#dynamic-form-submissions) — 0 row(s)
- [dynamic_form_submission_values](#dynamic-form-submission-values) — 0 row(s)
- [dynamic_modules](#dynamic-modules) — 0 row(s)
- [dynamic_module_role_assignments](#dynamic-module-role-assignments) — 0 row(s)
- [dynamic_module_user_assignments](#dynamic-module-user-assignments) — 0 row(s)
- [dynamic_tables](#dynamic-tables) — 0 row(s)
- [dynamic_table_columns](#dynamic-table-columns) — 0 row(s)
- [dynamic_table_rows](#dynamic-table-rows) — 0 row(s)
- [email_logs](#email-logs) — 0 row(s)
- [employees](#employees) — 0 row(s)
- [employee_dependents](#employee-dependents) — 0 row(s)
- [employee_documents](#employee-documents) — 0 row(s)
- [employee_experience](#employee-experience) — 0 row(s)
- [employee_file_checklist](#employee-file-checklist) — 0 row(s)
- [employee_interviews](#employee-interviews) — 0 row(s)
- [employee_nominees](#employee-nominees) — 0 row(s)
- [employee_qualifications](#employee-qualifications) — 0 row(s)
- [employee_references](#employee-references) — 0 row(s)
- [employee_service_records](#employee-service-records) — 0 row(s)
- [employers](#employers) — 1 row(s)
- [employer_compliance_mapping](#employer-compliance-mapping) — 0 row(s)
- [employer_users](#employer-users) — 0 row(s)
- [error_logs](#error-logs) — 0 row(s)
- [files](#files) — 0 row(s)
- [file_access_logs](#file-access-logs) — 0 row(s)
- [file_versions](#file-versions) — 0 row(s)
- [full_final_settlements](#full-final-settlements) — 0 row(s)
- [gratuity_records](#gratuity-records) — 0 row(s)
- [holidays](#holidays) — 0 row(s)
- [leave_applications](#leave-applications) — 0 row(s)
- [leave_ledgers](#leave-ledgers) — 0 row(s)
- [leave_types](#leave-types) — 8 row(s)
- [login_attempts](#login-attempts) — 1 row(s)
- [notifications](#notifications) — 0 row(s)
- [notification_logs](#notification-logs) — 0 row(s)
- [notification_preferences](#notification-preferences) — 0 row(s)
- [notification_templates](#notification-templates) — 0 row(s)
- [password_reset_tokens](#password-reset-tokens) — 0 row(s)
- [payroll_heads](#payroll-heads) — 25 row(s)
- [payroll_items](#payroll-items) — 0 row(s)
- [payroll_runs](#payroll-runs) — 0 row(s)
- [payslips](#payslips) — 0 row(s)
- [pdf_layouts](#pdf-layouts) — 0 row(s)
- [permissions](#permissions) — 451 row(s)
- [personal_file_checklist_items](#personal-file-checklist-items) — 16 row(s)
- [reminder_dispatches](#reminder-dispatches) — 0 row(s)
- [risk_reports](#risk-reports) — 0 row(s)
- [roles](#roles) — 6 row(s)
- [role_permissions](#role-permissions) — 785 row(s)
- [salary_structures](#salary-structures) — 0 row(s)
- [salary_structure_items](#salary-structure-items) — 0 row(s)
- [scheduled_jobs](#scheduled-jobs) — 0 row(s)
- [schema_migrations](#schema-migrations) — 19 row(s)
- [sessions](#sessions) — 1 row(s)
- [settings](#settings) — 51 row(s)
- [sms_logs](#sms-logs) — 0 row(s)
- [study_reports](#study-reports) — 0 row(s)
- [users](#users) — 1 row(s)
- [user_roles](#user-roles) — 1 row(s)
- [verifier_assignments](#verifier-assignments) — 0 row(s)
- [verifier_comments](#verifier-comments) — 0 row(s)
- [whatsapp_logs](#whatsapp-logs) — 0 row(s)
- [work_permits](#work-permits) — 0 row(s)

## activity_logs

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `user_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `user_name` | `varchar(200)` | YES | — | `NULL` | — |
| `user_role` | `varchar(100)` | YES | — | `NULL` | — |
| `employer_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `action` | `varchar(100)` | NO | MUL | NULL | created | updated | deleted | submitted | approved … |
| `module` | `varchar(100)` | NO | MUL | NULL | — |
| `entity_type` | `varchar(100)` | YES | MUL | `NULL` | — |
| `entity_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `entity_label` | `varchar(500)` | YES | — | `NULL` | — |
| `description` | `text` | YES | — | `NULL` | — |
| `old_values_json` | `longtext` | YES | — | `NULL` | — |
| `new_values_json` | `longtext` | YES | — | `NULL` | — |
| `changed_fields` | `longtext` | YES | — | `NULL` | — |
| `ip_address` | `varchar(45)` | YES | — | `NULL` | — |
| `user_agent` | `varchar(500)` | YES | — | `NULL` | — |
| `request_method` | `varchar(10)` | YES | — | `NULL` | — |
| `request_url` | `varchar(1000)` | YES | — | `NULL` | — |
| `status` | `enum('success','failed','warning')` | NO | — | `'success'` | — |
| `severity` | `enum('info','low','medium','high','critical')` | NO | — | `'info'` | — |
| `duration_ms` | `int(11)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | MUL | `current_timestamp()` | — |

**Foreign keys**

- `employer_id` → `employers.id`
- `user_id` → `users.id`

## assessment_reports

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `assessment_number` | `varchar(50)` | NO | UNI | NULL | — |
| `title` | `varchar(255)` | NO | — | NULL | — |
| `assessment_type` | `enum('HIRA','JSA','JHA','ENVIRONMENTAL','OCCUPATIONAL_HEALTH','FIRE','ERGONOMIC','OTHER')` | NO | — | `'HIRA'` | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `activity` | `varchar(500)` | YES | — | `NULL` | — |
| `process_area` | `varchar(255)` | YES | — | `NULL` | — |
| `hazard_description` | `text` | YES | — | `NULL` | — |
| `risk_category` | `enum('Physical','Chemical','Biological','Ergonomic','Mechanical','Electrical','Fire','Psychological','Other')` | YES | — | `NULL` | — |
| `likelihood` | `tinyint(4)` | YES | — | `NULL` | 1-5 |
| `severity` | `tinyint(4)` | YES | — | `NULL` | 1-5 |
| `risk_score` | `tinyint(4)` | YES | — | `NULL` | likelihood x severity |
| `risk_level` | `enum('Low','Medium','High','Extreme')` | YES | MUL | `NULL` | — |
| `existing_controls` | `text` | YES | — | `NULL` | — |
| `additional_controls` | `text` | YES | — | `NULL` | — |
| `residual_risk_score` | `tinyint(4)` | YES | — | `NULL` | — |
| `residual_risk_level` | `enum('Low','Medium','High','Extreme')` | YES | — | `NULL` | — |
| `responsible_person` | `varchar(200)` | YES | — | `NULL` | — |
| `target_date` | `date` | YES | — | `NULL` | — |
| `status` | `enum('Draft','Submitted','Under Review','Approved','Rejected','Changes Requested','Closed')` | NO | MUL | `'Draft'` | — |
| `auditor_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `assignment_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `auditor_id` → `auditors.id`
- `employer_id` → `employers.id`
- `unit_id` → `company_units.id`

## attendance

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `attendance_date` | `date` | NO | MUL | NULL | — |
| `month` | `tinyint(3) unsigned` | NO | — | NULL | — |
| `year` | `smallint(5) unsigned` | NO | — | NULL | — |
| `status` | `enum('Present','Absent','Half Day','Leave','Holiday','Weekly Off','On Duty','Late','Comp Off')` | NO | MUL | `'Present'` | — |
| `leave_type` | `varchar(50)` | YES | — | `NULL` | — |
| `shift_name` | `varchar(50)` | YES | — | `NULL` | — |
| `in_time` | `time` | YES | — | `NULL` | — |
| `out_time` | `time` | YES | — | `NULL` | — |
| `worked_hours` | `decimal(5,2)` | YES | — | `NULL` | — |
| `overtime_hours` | `decimal(5,2)` | NO | — | `0.00` | — |
| `late_minutes` | `int(11)` | NO | — | `0` | — |
| `early_minutes` | `int(11)` | NO | — | `0` | — |
| `is_paid` | `tinyint(1)` | NO | — | `1` | — |
| `remarks` | `varchar(500)` | YES | — | `NULL` | — |
| `source` | `enum('Manual','Bulk Upload','Biometric','Import')` | NO | — | `'Manual'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `department_id` → `departments.id`
- `employee_id` → `employees.id`
- `employer_id` → `employers.id`
- `unit_id` → `company_units.id`

## auditors

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `user_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `auditor_code` | `varchar(50)` | NO | UNI | NULL | — |
| `name` | `varchar(200)` | NO | MUL | NULL | — |
| `email` | `varchar(255)` | NO | MUL | NULL | — |
| `mobile` | `varchar(20)` | YES | MUL | `NULL` | — |
| `alternate_mobile` | `varchar(20)` | YES | — | `NULL` | — |
| `auditor_type_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `role_title` | `varchar(150)` | YES | — | `NULL` | — |
| `specialization` | `varchar(200)` | YES | — | `NULL` | — |
| `qualification` | `varchar(255)` | YES | — | `NULL` | — |
| `experience_years` | `decimal(4,1)` | YES | — | `NULL` | — |
| `address` | `text` | YES | — | `NULL` | — |
| `city` | `varchar(100)` | YES | — | `NULL` | — |
| `state` | `varchar(100)` | YES | — | `NULL` | — |
| `pincode` | `varchar(10)` | YES | — | `NULL` | — |
| `photo` | `varchar(500)` | YES | — | `NULL` | — |
| `signature_path` | `varchar(500)` | YES | — | `NULL` | — |
| `pan_number` | `varchar(20)` | YES | — | `NULL` | — |
| `aadhaar_number` | `varchar(20)` | YES | — | `NULL` | — |
| `bank_name` | `varchar(200)` | YES | — | `NULL` | — |
| `bank_account_number` | `varchar(50)` | YES | — | `NULL` | — |
| `ifsc_code` | `varchar(20)` | YES | — | `NULL` | — |
| `date_of_joining` | `date` | YES | — | `NULL` | — |
| `assigned_employer_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `max_concurrent_audits` | `int(11)` | NO | — | `5` | — |
| `status` | `enum('active','inactive')` | NO | MUL | `'active'` | — |
| `username` | `varchar(100)` | YES | UNI | `NULL` | — |
| `password_hash` | `varchar(255)` | YES | — | `NULL` | — |
| `is_first_login` | `tinyint(1)` | NO | — | `1` | — |
| `rating` | `decimal(3,2)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | MUL | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `assigned_employer_id` → `employers.id`
- `auditor_type_id` → `auditor_types.id`
- `updated_by` → `users.id`
- `user_id` → `users.id`

## auditor_types

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `name` | `varchar(150)` | NO | UNI | NULL | — |
| `code` | `varchar(50)` | NO | UNI | NULL | — |
| `description` | `text` | YES | — | `NULL` | — |
| `specialization` | `varchar(200)` | YES | — | `NULL` | — |
| `default_module_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

## audit_assignments

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `assignment_number` | `varchar(50)` | NO | UNI | NULL | — |
| `assignment_type` | `enum('AUDIT','ASSESSMENT','RISK','STUDY','WORK_PERMIT','INSPECTION')` | NO | MUL | `'AUDIT'` | — |
| `audit_title` | `varchar(255)` | NO | — | NULL | — |
| `module_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `form_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `auditor_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `verifier_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `assigned_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `start_date` | `date` | YES | MUL | `NULL` | — |
| `end_date` | `date` | YES | — | `NULL` | — |
| `due_date` | `date` | YES | MUL | `NULL` | — |
| `completed_at` | `datetime` | YES | — | `NULL` | — |
| `audit_end_meeting_at` | `datetime` | YES | — | `NULL` | — |
| `priority` | `enum('Low','Medium','High','Urgent')` | NO | MUL | `'Medium'` | — |
| `status` | `enum('Not Started','In Progress','Draft Saved','Submitted','Under Review','Approved','Rejected','Changes Requested','Overdue','Cancelled')` | NO | MUL | `'Not Started'` | — |
| `progress_percent` | `tinyint(3) unsigned` | NO | — | `0` | — |
| `instructions` | `text` | YES | — | `NULL` | — |
| `scope` | `text` | YES | — | `NULL` | — |
| `fee_amount` | `decimal(15,2)` | YES | — | `NULL` | — |
| `revision_count` | `int(11)` | NO | — | `0` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | MUL | `NULL` | — |

**Foreign keys**

- `assigned_by` → `users.id`
- `auditor_id` → `auditors.id`
- `department_id` → `departments.id`
- `employer_id` → `employers.id`
- `form_id` → `dynamic_forms.id`
- `module_id` → `dynamic_modules.id`
- `unit_id` → `company_units.id`
- `verifier_id` → `users.id`

## audit_reports

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `report_number` | `varchar(50)` | NO | UNI | NULL | — |
| `assignment_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `submission_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `module_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `form_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `auditor_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `audit_title` | `varchar(255)` | NO | — | NULL | — |
| `report_type` | `enum('AUDIT','ASSESSMENT','RISK','STUDY','WORK_PERMIT','INSPECTION')` | NO | MUL | `'AUDIT'` | — |
| `audit_period_from` | `date` | YES | — | `NULL` | — |
| `audit_period_to` | `date` | YES | — | `NULL` | — |
| `audit_date` | `date` | YES | — | `NULL` | — |
| `status` | `enum('Draft','Submitted','Under Review','Approved','Rejected','Changes Requested','Archived')` | NO | MUL | `'Draft'` | — |
| `current_version` | `int(11)` | NO | — | `1` | — |
| `score_obtained` | `decimal(10,2)` | YES | — | `NULL` | — |
| `score_max` | `decimal(10,2)` | YES | — | `NULL` | — |
| `score_percentage` | `decimal(6,2)` | YES | — | `NULL` | — |
| `critical_findings` | `int(11)` | NO | — | `0` | — |
| `major_findings` | `int(11)` | NO | — | `0` | — |
| `minor_findings` | `int(11)` | NO | — | `0` | — |
| `observations` | `int(11)` | NO | — | `0` | — |
| `pdf_file_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `pdf_generated_at` | `datetime` | YES | — | `NULL` | — |
| `submitted_at` | `datetime` | YES | MUL | `NULL` | — |
| `approved_at` | `datetime` | YES | — | `NULL` | — |
| `approved_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `rejected_at` | `datetime` | YES | — | `NULL` | — |
| `rejected_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `rejection_reason` | `text` | YES | — | `NULL` | — |
| `next_audit_due` | `date` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | MUL | `NULL` | — |

**Foreign keys**

- `approved_by` → `users.id`
- `assignment_id` → `audit_assignments.id`
- `auditor_id` → `auditors.id`
- `employer_id` → `employers.id`
- `form_id` → `dynamic_forms.id`
- `module_id` → `dynamic_modules.id`
- `rejected_by` → `users.id`
- `submission_id` → `dynamic_form_submissions.id`
- `unit_id` → `company_units.id`

## audit_report_comments

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `report_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `version` | `int(11)` | YES | — | `NULL` | — |
| `comment_type` | `enum('comment','correction_request','approval_note','rejection_note','auditor_reply')` | NO | MUL | `'comment'` | — |
| `comment` | `text` | NO | — | NULL | — |
| `section_ref` | `varchar(255)` | YES | — | `NULL` | — |
| `field_ref` | `varchar(150)` | YES | — | `NULL` | — |
| `severity` | `enum('info','minor','major','critical')` | NO | — | `'info'` | — |
| `is_resolved` | `tinyint(1)` | NO | — | `0` | — |
| `resolved_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `resolved_at` | `datetime` | YES | — | `NULL` | — |
| `parent_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_by` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `parent_id` → `audit_report_comments.id`
- `report_id` → `audit_reports.id`
- `resolved_by` → `users.id`

## audit_report_versions

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `report_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `version` | `int(11)` | NO | — | NULL | — |
| `snapshot_json` | `longtext` | NO | — | NULL | frozen JSON of report + form values + table rows |
| `pdf_file_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `change_summary` | `varchar(500)` | YES | — | `NULL` | — |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `created_by` → `users.id`
- `report_id` → `audit_reports.id`

## audit_trails

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `table_name` | `varchar(100)` | NO | MUL | NULL | — |
| `record_id` | `bigint(20) unsigned` | NO | — | NULL | — |
| `operation` | `enum('INSERT','UPDATE','DELETE','SOFT_DELETE','RESTORE')` | NO | — | NULL | — |
| `field_name` | `varchar(100)` | YES | — | `NULL` | — |
| `old_value` | `longtext` | YES | — | `NULL` | — |
| `new_value` | `longtext` | YES | — | `NULL` | — |
| `changed_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `changed_by_name` | `varchar(200)` | YES | — | `NULL` | — |
| `ip_address` | `varchar(45)` | YES | — | `NULL` | — |
| `reason` | `varchar(500)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | MUL | `current_timestamp()` | — |

**Foreign keys**

- `changed_by` → `users.id`

## backup_history

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `backup_name` | `varchar(255)` | NO | — | NULL | — |
| `backup_type` | `enum('full','schema','data','incremental')` | NO | — | `'full'` | — |
| `file_path` | `varchar(1000)` | YES | — | `NULL` | — |
| `file_size_bytes` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `tables_included` | `longtext` | YES | — | `NULL` | — |
| `status` | `enum('running','completed','failed')` | NO | MUL | `'running'` | — |
| `error_message` | `text` | YES | — | `NULL` | — |
| `started_at` | `datetime` | NO | MUL | `current_timestamp()` | — |
| `completed_at` | `datetime` | YES | — | `NULL` | — |
| `duration_seconds` | `int(11)` | YES | — | `NULL` | — |
| `triggered_by` | `enum('manual','scheduled')` | NO | — | `'manual'` | — |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`

## bonus_records

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `bonus_year` | `varchar(20)` | NO | MUL | NULL | — |
| `bonus_type` | `enum('Statutory Bonus','Ex-gratia','Festival Bonus','Performance Bonus')` | NO | — | `'Statutory Bonus'` | — |
| `eligible_wages` | `decimal(15,2)` | YES | — | `NULL` | — |
| `bonus_percent` | `decimal(6,2)` | YES | — | `NULL` | — |
| `bonus_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `calculation_from` | `date` | YES | — | `NULL` | — |
| `calculation_to` | `date` | YES | — | `NULL` | — |
| `paid_days` | `decimal(6,2)` | YES | — | `NULL` | — |
| `payment_date` | `date` | YES | — | `NULL` | — |
| `payment_status` | `enum('Pending','Paid','On Hold')` | NO | — | `'Pending'` | — |
| `remarks` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`
- `employer_id` → `employers.id`

## calendar_events

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `title` | `varchar(255)` | NO | — | NULL | — |
| `description` | `text` | YES | — | `NULL` | — |
| `event_type` | `enum('AUDIT','AUDIT_END_MEETING','REPORT_DUE','COMPLIANCE_EXPIRY','PAYROLL_RUN','LEAVE','HOLIDAY','TRAINING','MEETING','INSPECTION','PERMIT_VALIDITY','REMINDER','OTHER')` | NO | MUL | `'AUDIT'` | — |
| `employer_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `assignment_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `auditor_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `start_datetime` | `datetime` | NO | MUL | NULL | — |
| `end_datetime` | `datetime` | YES | MUL | `NULL` | — |
| `all_day` | `tinyint(1)` | NO | — | `0` | — |
| `location` | `varchar(500)` | YES | — | `NULL` | — |
| `meeting_url` | `varchar(500)` | YES | — | `NULL` | — |
| `attendees_json` | `longtext` | YES | — | `NULL` | array of user ids / email addresses |
| `reminder_minutes` | `int(11)` | YES | — | `NULL` | — |
| `reminder_sent` | `tinyint(1)` | NO | — | `0` | — |
| `color` | `varchar(20)` | YES | — | `NULL` | — |
| `priority` | `enum('Low','Medium','High','Urgent')` | NO | — | `'Medium'` | — |
| `status` | `enum('scheduled','completed','cancelled','rescheduled')` | NO | MUL | `'scheduled'` | — |
| `recurrence_rule` | `varchar(500)` | YES | — | `NULL` | — |
| `parent_event_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `visibility` | `enum('private','participants','employer','all')` | NO | — | `'participants'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `assignment_id` → `audit_assignments.id`
- `auditor_id` → `auditors.id`
- `created_by` → `users.id`
- `employer_id` → `employers.id`
- `parent_event_id` → `calendar_events.id`
- `unit_id` → `company_units.id`

## cms_media

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `file_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `title` | `varchar(255)` | YES | — | `NULL` | — |
| `alt_text` | `varchar(500)` | YES | — | `NULL` | — |
| `caption` | `varchar(500)` | YES | — | `NULL` | — |
| `file_name` | `varchar(500)` | NO | — | NULL | — |
| `file_path` | `varchar(1000)` | NO | — | NULL | — |
| `public_url` | `varchar(1000)` | YES | — | `NULL` | — |
| `mime_type` | `varchar(150)` | YES | — | `NULL` | — |
| `media_type` | `enum('image','video','audio','document','other')` | NO | MUL | `'image'` | — |
| `size_bytes` | `bigint(20) unsigned` | NO | — | `0` | — |
| `width` | `int(11)` | YES | — | `NULL` | — |
| `height` | `int(11)` | YES | — | `NULL` | — |
| `folder` | `varchar(255)` | YES | MUL | `NULL` | — |
| `tags` | `varchar(500)` | YES | — | `NULL` | — |
| `uploaded_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `file_id` → `files.id`

## cms_pages

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `slug` | `varchar(255)` | NO | UNI | NULL | — |
| `title` | `varchar(255)` | NO | — | NULL | — |
| `subtitle` | `varchar(500)` | YES | — | `NULL` | — |
| `meta_title` | `varchar(255)` | YES | — | `NULL` | — |
| `meta_description` | `varchar(500)` | YES | — | `NULL` | — |
| `meta_keywords` | `varchar(500)` | YES | — | `NULL` | — |
| `hero_image` | `varchar(500)` | YES | — | `NULL` | — |
| `content_html` | `longtext` | YES | — | `NULL` | — |
| `content_json` | `longtext` | YES | — | `NULL` | Structured block content for the editor |
| `page_type` | `enum('page','blog','faq','legal','landing')` | NO | MUL | `'page'` | — |
| `template` | `varchar(100)` | NO | — | `'default'` | — |
| `parent_page_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `show_in_menu` | `tinyint(1)` | NO | MUL | `0` | — |
| `menu_label` | `varchar(100)` | YES | — | `NULL` | — |
| `status` | `enum('draft','published','archived','scheduled')` | NO | MUL | `'draft'` | — |
| `is_homepage` | `tinyint(1)` | NO | — | `0` | — |
| `published_at` | `datetime` | YES | — | `NULL` | — |
| `scheduled_at` | `datetime` | YES | — | `NULL` | — |
| `view_count` | `int(11)` | NO | — | `0` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `parent_page_id` → `cms_pages.id`

## cms_page_sections

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `page_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `section_key` | `varchar(100)` | YES | — | `NULL` | — |
| `section_type` | `enum('hero','text','richtext','features','stats','cta','accordion','tabs','table','image','gallery','team','testimonials','pricing','contact_form','faq','services','custom')` | NO | — | `'text'` | — |
| `heading` | `varchar(255)` | YES | — | `NULL` | — |
| `subheading` | `varchar(500)` | YES | — | `NULL` | — |
| `content_html` | `longtext` | YES | — | `NULL` | — |
| `content_json` | `longtext` | YES | — | `NULL` | — |
| `image_url` | `varchar(500)` | YES | — | `NULL` | — |
| `background_color` | `varchar(20)` | YES | — | `NULL` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `page_id` → `cms_pages.id`

## cms_resources

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `title` | `varchar(255)` | NO | — | NULL | — |
| `slug` | `varchar(255)` | NO | UNI | NULL | — |
| `description` | `text` | YES | — | `NULL` | — |
| `resource_type` | `enum('Guide','Checklist','Template','Circular','Act','Rule','Report','Whitepaper','Video','Other')` | NO | MUL | `'Guide'` | — |
| `category` | `varchar(100)` | YES | — | `NULL` | — |
| `act_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `file_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `external_url` | `varchar(1000)` | YES | — | `NULL` | — |
| `thumbnail` | `varchar(500)` | YES | — | `NULL` | — |
| `requires_login` | `tinyint(1)` | NO | — | `0` | — |
| `download_count` | `int(11)` | NO | — | `0` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `status` | `enum('draft','published','archived')` | NO | MUL | `'draft'` | — |
| `published_at` | `datetime` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `act_id` → `compliance_acts.id`
- `file_id` → `files.id`

## company_units

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_name` | `varchar(255)` | NO | MUL | NULL | — |
| `unit_code` | `varchar(50)` | YES | — | `NULL` | — |
| `location` | `varchar(255)` | YES | — | `NULL` | — |
| `address` | `text` | YES | — | `NULL` | — |
| `contact_person_name` | `varchar(200)` | YES | — | `NULL` | — |
| `contact_person_email` | `varchar(255)` | YES | — | `NULL` | — |
| `contact_person_phone` | `varchar(20)` | YES | — | `NULL` | — |
| `employee_count` | `int(11)` | YES | — | `NULL` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employer_id` → `employers.id`

## compliance_acts

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `act_name` | `varchar(500)` | NO | MUL | NULL | — |
| `short_name` | `varchar(100)` | YES | MUL | `NULL` | — |
| `act_number` | `varchar(100)` | YES | — | `NULL` | — |
| `act_year` | `int(11)` | YES | — | `NULL` | — |
| `jurisdiction` | `enum('Central','State','International')` | NO | MUL | `'Central'` | — |
| `state_name` | `varchar(100)` | YES | — | `NULL` | — |
| `ministry` | `varchar(255)` | YES | — | `NULL` | — |
| `department` | `varchar(255)` | YES | — | `NULL` | — |
| `enactment_date` | `date` | YES | — | `NULL` | — |
| `effective_date` | `date` | YES | — | `NULL` | — |
| `last_amended_date` | `date` | YES | — | `NULL` | — |
| `applicability_criteria` | `text` | YES | — | `NULL` | — |
| `industry_applicability` | `varchar(500)` | YES | — | `NULL` | — |
| `employee_threshold` | `varchar(100)` | YES | — | `NULL` | — |
| `summary` | `text` | YES | — | `NULL` | — |
| `full_text` | `longtext` | YES | — | `NULL` | — |
| `official_source_url` | `varchar(500)` | YES | — | `NULL` | — |
| `status` | `enum('active','repealed','amended','draft')` | NO | MUL | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`

## compliance_documents

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `document_name` | `varchar(500)` | NO | — | NULL | — |
| `document_type` | `enum('Licence','Certificate','Permit','Registration','Return','Approval','Agreement','Insurance','Other')` | NO | MUL | `'Licence'` | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `act_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `rule_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `document_number` | `varchar(150)` | YES | — | `NULL` | — |
| `issuing_authority` | `varchar(255)` | YES | — | `NULL` | — |
| `issue_date` | `date` | YES | — | `NULL` | — |
| `expiry_date` | `date` | YES | MUL | `NULL` | — |
| `validity_period_days` | `int(11)` | YES | — | `NULL` | — |
| `remind_days_before` | `int(11)` | NO | — | `30` | — |
| `reminder_sent_at` | `datetime` | YES | — | `NULL` | — |
| `renewal_responsibility` | `varchar(200)` | YES | — | `NULL` | — |
| `fee_amount` | `decimal(15,2)` | YES | — | `NULL` | — |
| `compliance_status` | `enum('Valid','Expiring Soon','Expired','Applied for Renewal','Not Applicable')` | NO | MUL | `'Valid'` | — |
| `file_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `file_path` | `varchar(500)` | YES | — | `NULL` | — |
| `notes` | `text` | YES | — | `NULL` | — |
| `is_verified` | `tinyint(1)` | NO | — | `0` | — |
| `verified_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `verified_at` | `datetime` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `act_id` → `compliance_acts.id`
- `employer_id` → `employers.id`
- `rule_id` → `compliance_rules.id`
- `unit_id` → `company_units.id`
- `verified_by` → `users.id`

## compliance_notifications

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `notification_number` | `varchar(150)` | NO | — | NULL | — |
| `title` | `varchar(500)` | NO | — | NULL | — |
| `notification_date` | `date` | YES | MUL | `NULL` | — |
| `issuing_authority` | `varchar(255)` | YES | — | `NULL` | — |
| `act_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `gazette_reference` | `varchar(255)` | YES | — | `NULL` | — |
| `subject` | `text` | YES | — | `NULL` | — |
| `body` | `longtext` | YES | — | `NULL` | — |
| `effective_date` | `date` | YES | — | `NULL` | — |
| `applicability` | `text` | YES | — | `NULL` | — |
| `action_required` | `text` | YES | — | `NULL` | — |
| `status` | `enum('active','superseded','withdrawn')` | NO | MUL | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `act_id` → `compliance_acts.id`

## compliance_regulations

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `act_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `rule_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `regulation_name` | `varchar(500)` | NO | — | NULL | — |
| `regulation_number` | `varchar(100)` | YES | — | `NULL` | — |
| `issuing_authority` | `varchar(255)` | YES | — | `NULL` | — |
| `issue_date` | `date` | YES | — | `NULL` | — |
| `effective_date` | `date` | YES | — | `NULL` | — |
| `scope` | `text` | YES | — | `NULL` | — |
| `obligations` | `longtext` | YES | — | `NULL` | — |
| `reporting_authority` | `varchar(255)` | YES | — | `NULL` | — |
| `reporting_frequency` | `varchar(100)` | YES | — | `NULL` | — |
| `penalty_provision` | `text` | YES | — | `NULL` | — |
| `status` | `enum('active','superseded','withdrawn')` | NO | MUL | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `act_id` → `compliance_acts.id`
- `rule_id` → `compliance_rules.id`

## compliance_rules

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `act_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `rule_number` | `varchar(50)` | YES | — | `NULL` | — |
| `rule_title` | `varchar(500)` | NO | — | NULL | — |
| `rule_text` | `longtext` | YES | — | `NULL` | — |
| `compliance_type` | `enum('Mandatory','Recommended','Best Practice')` | NO | — | `'Mandatory'` | — |
| `frequency` | `enum('One-time','Daily','Weekly','Monthly','Quarterly','Half-Yearly','Annual','Bi-Annual','Event-based')` | YES | MUL | `NULL` | — |
| `due_day_of_month` | `int(11)` | YES | — | `NULL` | — |
| `responsible_role` | `varchar(150)` | YES | — | `NULL` | — |
| `penalty_details` | `text` | YES | — | `NULL` | — |
| `evidence_required` | `text` | YES | — | `NULL` | — |
| `applicability` | `text` | YES | — | `NULL` | — |
| `status` | `enum('active','inactive')` | NO | MUL | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `act_id` → `compliance_acts.id`

## contact_enquiries

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `name` | `varchar(200)` | NO | — | NULL | — |
| `email` | `varchar(255)` | NO | — | NULL | — |
| `mobile` | `varchar(20)` | YES | — | `NULL` | — |
| `company_name` | `varchar(255)` | YES | — | `NULL` | — |
| `subject` | `varchar(300)` | YES | — | `NULL` | — |
| `message` | `text` | NO | — | NULL | — |
| `enquiry_type` | `enum('General','Demo Request','Sales','Support','Partnership','Careers')` | NO | — | `'General'` | — |
| `source_page` | `varchar(255)` | YES | — | `NULL` | — |
| `status` | `enum('New','In Progress','Responded','Closed','Spam')` | NO | MUL | `'New'` | — |
| `assigned_to` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `response` | `text` | YES | — | `NULL` | — |
| `responded_at` | `datetime` | YES | — | `NULL` | — |
| `ip_address` | `varchar(45)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | MUL | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `assigned_to` → `users.id`

## departments

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_name` | `varchar(255)` | NO | MUL | NULL | — |
| `department_code` | `varchar(50)` | YES | — | `NULL` | — |
| `head_of_department` | `varchar(200)` | YES | — | `NULL` | — |
| `contact_email` | `varchar(255)` | YES | — | `NULL` | — |
| `contact_phone` | `varchar(20)` | YES | — | `NULL` | — |
| `employee_count` | `int(11)` | YES | — | `NULL` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employer_id` → `employers.id`
- `unit_id` → `company_units.id`

## document_sequences

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `sequence_scope` | `varchar(100)` | NO | UNI | NULL | e.g. AUD-2026 or PS-EMR2026-2026 |
| `last_value` | `bigint(20) unsigned` | NO | — | `0` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

## dynamic_field_options

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `field_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `option_key` | `varchar(100)` | NO | — | NULL | — |
| `option_label` | `varchar(255)` | NO | — | NULL | — |
| `option_label_ta` | `varchar(255)` | YES | — | `NULL` | — |
| `option_value` | `varchar(255)` | YES | — | `NULL` | — |
| `color` | `varchar(20)` | YES | — | `NULL` | — |
| `score` | `decimal(10,2)` | YES | — | `NULL` | Used for scored checklists (Yes/No/NA weighting) |
| `is_default` | `tinyint(1)` | NO | — | `0` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `field_id` → `dynamic_form_fields.id`

## dynamic_forms

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `module_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `name` | `varchar(200)` | NO | — | NULL | — |
| `slug` | `varchar(200)` | NO | — | NULL | — |
| `description` | `text` | YES | — | `NULL` | — |
| `form_type` | `enum('STANDARD','AUDIT','CHECKLIST','INSPECTION','PERMIT','ASSESSMENT')` | NO | — | `'STANDARD'` | — |
| `version` | `int(11)` | NO | — | `1` | — |
| `layout_columns` | `tinyint(4)` | NO | — | `2` | — |
| `requires_signature` | `tinyint(1)` | NO | — | `1` | — |
| `requires_attachments` | `tinyint(1)` | NO | — | `0` | — |
| `allow_draft` | `tinyint(1)` | NO | — | `1` | — |
| `auto_number_prefix` | `varchar(20)` | YES | — | `NULL` | — |
| `pdf_template_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `status` | `enum('draft','published','archived')` | NO | MUL | `'draft'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `module_id` → `dynamic_modules.id`
- `updated_by` → `users.id`

## dynamic_form_fields

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `form_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `section_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `field_key` | `varchar(100)` | NO | — | NULL | — |
| `label` | `varchar(255)` | NO | — | NULL | — |
| `label_ta` | `varchar(255)` | YES | — | `NULL` | Tamil label for bilingual PDF |
| `field_type` | `enum('text','textarea','rich_text','number','decimal','currency','date','time','datetime','email','phone','url','password','select','multi_select','radio','checkbox','switch','file','multi_file','image','signature','rating','table','heading','paragraph','divider','formula','auto_number')` | NO | MUL | NULL | — |
| `placeholder` | `varchar(255)` | YES | — | `NULL` | — |
| `help_text` | `varchar(500)` | YES | — | `NULL` | — |
| `default_value` | `text` | YES | — | `NULL` | — |
| `options_json` | `longtext` | YES | — | `NULL` | — |
| `validation_json` | `longtext` | YES | — | `NULL` | — |
| `conditional_json` | `longtext` | YES | — | `NULL` | — |
| `table_definition_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `formula_expression` | `varchar(500)` | YES | — | `NULL` | — |
| `is_required` | `tinyint(1)` | NO | — | `0` | — |
| `is_readonly` | `tinyint(1)` | NO | — | `0` | — |
| `is_unique` | `tinyint(1)` | NO | — | `0` | — |
| `show_in_pdf` | `tinyint(1)` | NO | — | `1` | — |
| `show_in_list` | `tinyint(1)` | NO | — | `0` | — |
| `column_width` | `tinyint(4)` | NO | — | `6` | 1-12 grid columns |
| `min_value` | `decimal(18,4)` | YES | — | `NULL` | — |
| `max_value` | `decimal(18,4)` | YES | — | `NULL` | — |
| `min_length` | `int(11)` | YES | — | `NULL` | — |
| `max_length` | `int(11)` | YES | — | `NULL` | — |
| `regex_pattern` | `varchar(500)` | YES | — | `NULL` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `form_id` → `dynamic_forms.id`
- `section_id` → `dynamic_form_sections.id`

## dynamic_form_sections

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `form_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `title` | `varchar(255)` | NO | — | NULL | — |
| `section_code` | `varchar(100)` | YES | — | `NULL` | — |
| `description` | `text` | YES | — | `NULL` | — |
| `layout_columns` | `tinyint(4)` | NO | — | `2` | — |
| `is_repeatable` | `tinyint(1)` | NO | — | `0` | — |
| `is_collapsible` | `tinyint(1)` | NO | — | `1` | — |
| `is_collapsed` | `tinyint(1)` | NO | — | `0` | — |
| `show_in_pdf` | `tinyint(1)` | NO | — | `1` | — |
| `page_break_before` | `tinyint(1)` | NO | — | `0` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `form_id` → `dynamic_forms.id`

## dynamic_form_submissions

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `submission_number` | `varchar(50)` | NO | UNI | NULL | — |
| `module_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `form_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `assignment_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `employer_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `submitted_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | users.id of the auditor/creator |
| `auditor_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `title` | `varchar(255)` | YES | — | `NULL` | — |
| `status` | `enum('draft','submitted','under_review','approved','rejected','changes_requested','archived')` | NO | MUL | `'draft'` | — |
| `score_obtained` | `decimal(10,2)` | YES | — | `NULL` | — |
| `score_max` | `decimal(10,2)` | YES | — | `NULL` | — |
| `score_percentage` | `decimal(6,2)` | YES | — | `NULL` | — |
| `submission_date` | `datetime` | YES | MUL | `NULL` | — |
| `period_from` | `date` | YES | — | `NULL` | — |
| `period_to` | `date` | YES | — | `NULL` | — |
| `remarks` | `text` | YES | — | `NULL` | — |
| `pdf_file_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `pdf_generated_at` | `datetime` | YES | — | `NULL` | — |
| `version` | `int(11)` | NO | — | `1` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `auditor_id` → `auditors.id`
- `department_id` → `departments.id`
- `employer_id` → `employers.id`
- `form_id` → `dynamic_forms.id`
- `module_id` → `dynamic_modules.id`
- `submitted_by` → `users.id`
- `unit_id` → `company_units.id`

## dynamic_form_submission_values

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `submission_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `form_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `section_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `field_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `field_key` | `varchar(100)` | NO | MUL | NULL | — |
| `value_text` | `longtext` | YES | — | `NULL` | — |
| `value_number` | `decimal(18,4)` | YES | — | `NULL` | — |
| `value_date` | `date` | YES | — | `NULL` | — |
| `value_datetime` | `datetime` | YES | — | `NULL` | — |
| `value_json` | `longtext` | YES | — | `NULL` | — |
| `file_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `field_id` → `dynamic_form_fields.id`
- `form_id` → `dynamic_forms.id`
- `submission_id` → `dynamic_form_submissions.id`

## dynamic_modules

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `name` | `varchar(200)` | NO | — | NULL | — |
| `slug` | `varchar(200)` | NO | UNI | NULL | — |
| `description` | `text` | YES | — | `NULL` | — |
| `icon` | `varchar(100)` | YES | — | `NULL` | — |
| `category` | `varchar(100)` | YES | — | `NULL` | — |
| `version` | `varchar(20)` | NO | — | `'1.0.0'` | — |
| `module_type` | `enum('AUDIT','ASSESSMENT','RISK','STUDY','WORK_PERMIT','INSPECTION','CUSTOM')` | NO | MUL | `'CUSTOM'` | — |
| `default_tat_days` | `int(11)` | YES | — | `NULL` | — |
| `requires_verification` | `tinyint(1)` | NO | — | `1` | — |
| `is_public` | `tinyint(1)` | NO | — | `0` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `status` | `enum('draft','published','archived')` | NO | MUL | `'draft'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `updated_by` → `users.id`

## dynamic_module_role_assignments

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `module_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `role_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `can_create` | `tinyint(1)` | NO | — | `1` | — |
| `can_read` | `tinyint(1)` | NO | — | `1` | — |
| `can_update` | `tinyint(1)` | NO | — | `0` | — |
| `can_delete` | `tinyint(1)` | NO | — | `0` | — |
| `can_approve` | `tinyint(1)` | NO | — | `0` | — |
| `granted_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `granted_by` → `users.id`
- `module_id` → `dynamic_modules.id`
- `role_id` → `roles.id`

## dynamic_module_user_assignments

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `module_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `user_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `auditor_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `assigned_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `assigned_by` → `users.id`
- `auditor_id` → `auditors.id`
- `module_id` → `dynamic_modules.id`
- `user_id` → `users.id`

## dynamic_tables

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `form_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `section_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `table_key` | `varchar(100)` | NO | — | NULL | — |
| `table_name` | `varchar(200)` | NO | — | NULL | — |
| `table_name_ta` | `varchar(200)` | YES | — | `NULL` | — |
| `description` | `text` | YES | — | `NULL` | — |
| `is_repeatable` | `tinyint(1)` | NO | — | `1` | — |
| `min_rows` | `int(11)` | NO | — | `0` | — |
| `max_rows` | `int(11)` | YES | — | `NULL` | — |
| `show_row_numbers` | `tinyint(1)` | NO | — | `1` | — |
| `show_totals` | `tinyint(1)` | NO | — | `0` | — |
| `show_in_pdf` | `tinyint(1)` | NO | — | `1` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `form_id` → `dynamic_forms.id`
- `section_id` → `dynamic_form_sections.id`

## dynamic_table_columns

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `table_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `column_key` | `varchar(100)` | NO | — | NULL | — |
| `column_label` | `varchar(255)` | NO | — | NULL | — |
| `column_label_ta` | `varchar(255)` | YES | — | `NULL` | — |
| `column_type` | `enum('text','textarea','number','decimal','currency','date','time','select','multi_select','checkbox','file','formula','auto_number')` | NO | — | `'text'` | — |
| `options_json` | `longtext` | YES | — | `NULL` | — |
| `formula_expression` | `varchar(500)` | YES | — | `NULL` | — |
| `default_value` | `text` | YES | — | `NULL` | — |
| `width_pct` | `decimal(5,2)` | YES | — | `NULL` | — |
| `is_required` | `tinyint(1)` | NO | — | `0` | — |
| `is_editable` | `tinyint(1)` | NO | — | `1` | — |
| `is_sortable` | `tinyint(1)` | NO | — | `0` | — |
| `is_total` | `tinyint(1)` | NO | — | `0` | Sum this column when show_totals=1 |
| `show_in_pdf` | `tinyint(1)` | NO | — | `1` | — |
| `validation_json` | `longtext` | YES | — | `NULL` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `table_id` → `dynamic_tables.id`

## dynamic_table_rows

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `submission_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `table_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `row_index` | `int(11)` | NO | — | `0` | — |
| `row_data` | `longtext` | NO | — | NULL | column_key -> value map |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `submission_id` → `dynamic_form_submissions.id`
- `table_id` → `dynamic_tables.id`

## email_logs

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `to_email` | `varchar(1000)` | NO | MUL | NULL | — |
| `cc_email` | `varchar(1000)` | YES | — | `NULL` | — |
| `bcc_email` | `varchar(1000)` | YES | — | `NULL` | — |
| `from_email` | `varchar(255)` | YES | — | `NULL` | — |
| `subject` | `varchar(500)` | NO | — | NULL | — |
| `body_html` | `longtext` | YES | — | `NULL` | — |
| `template_code` | `varchar(100)` | YES | — | `NULL` | — |
| `entity_type` | `varchar(50)` | YES | MUL | `NULL` | — |
| `entity_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `attachments_json` | `longtext` | YES | — | `NULL` | — |
| `status` | `enum('queued','sent','failed')` | NO | MUL | `'queued'` | — |
| `provider` | `varchar(50)` | YES | — | `'smtp'` | — |
| `message_id` | `varchar(255)` | YES | — | `NULL` | — |
| `error_message` | `text` | YES | — | `NULL` | — |
| `sent_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `sent_at` | `datetime` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | MUL | `current_timestamp()` | — |

**Foreign keys**

- `sent_by` → `users.id`

## employees

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `employee_number` | `varchar(50)` | NO | UNI | NULL | — |
| `name` | `varchar(200)` | NO | MUL | NULL | — |
| `father_name` | `varchar(200)` | YES | — | `NULL` | — |
| `mother_name` | `varchar(200)` | YES | — | `NULL` | — |
| `spouse_name` | `varchar(200)` | YES | — | `NULL` | — |
| `sex` | `enum('Male','Female','Other')` | YES | — | `NULL` | — |
| `marital_status` | `enum('Single','Married','Divorced','Widowed')` | YES | — | `NULL` | — |
| `religion` | `varchar(100)` | YES | — | `NULL` | — |
| `mother_tongue` | `varchar(100)` | YES | — | `NULL` | — |
| `blood_group` | `varchar(10)` | YES | — | `NULL` | — |
| `date_of_birth` | `date` | YES | MUL | `NULL` | — |
| `languages_known` | `text` | YES | — | `NULL` | — |
| `photo` | `varchar(500)` | YES | — | `NULL` | — |
| `aadhaar_number` | `varchar(20)` | YES | UNI | `NULL` | — |
| `pan_number` | `varchar(20)` | YES | — | `NULL` | — |
| `present_address` | `text` | YES | — | `NULL` | — |
| `permanent_address` | `text` | YES | — | `NULL` | — |
| `is_permanent_same_as_present` | `tinyint(1)` | NO | — | `0` | — |
| `state` | `varchar(100)` | YES | — | `NULL` | — |
| `pincode` | `varchar(10)` | YES | — | `NULL` | — |
| `telephone` | `varchar(20)` | YES | — | `NULL` | — |
| `mobile` | `varchar(20)` | YES | MUL | `NULL` | — |
| `email` | `varchar(255)` | YES | MUL | `NULL` | — |
| `native_place` | `varchar(200)` | YES | — | `NULL` | — |
| `staying_in` | `enum('Own','Rented')` | YES | — | `NULL` | — |
| `family_income_per_annum` | `decimal(15,2)` | YES | — | `NULL` | — |
| `date_of_joining` | `date` | YES | MUL | `NULL` | — |
| `date_of_confirmation` | `date` | YES | — | `NULL` | — |
| `post_applied_for` | `varchar(100)` | YES | — | `NULL` | — |
| `department` | `varchar(100)` | YES | — | `NULL` | — |
| `nature_of_work` | `varchar(100)` | YES | — | `NULL` | — |
| `designation` | `varchar(100)` | YES | MUL | `NULL` | — |
| `category` | `enum('Worker','Staff')` | YES | — | `NULL` | — |
| `grade` | `varchar(50)` | YES | — | `NULL` | — |
| `skill_grade` | `varchar(50)` | YES | — | `NULL` | — |
| `place_of_work` | `varchar(200)` | YES | — | `NULL` | — |
| `shift_relay` | `varchar(50)` | YES | — | `NULL` | — |
| `working_hours_from` | `time` | YES | — | `NULL` | — |
| `working_hours_to` | `time` | YES | — | `NULL` | — |
| `interval_lunch_time` | `time` | YES | — | `NULL` | — |
| `tea_break` | `time` | YES | — | `NULL` | — |
| `weekly_off` | `varchar(50)` | YES | — | `NULL` | — |
| `probation_months` | `int(11)` | NO | — | `3` | — |
| `basic_salary` | `decimal(15,2)` | YES | — | `NULL` | — |
| `da` | `decimal(15,2)` | YES | — | `NULL` | — |
| `hra` | `decimal(15,2)` | YES | — | `NULL` | — |
| `ta` | `decimal(15,2)` | YES | — | `NULL` | — |
| `pa` | `decimal(15,2)` | YES | — | `NULL` | — |
| `ea` | `decimal(15,2)` | YES | — | `NULL` | — |
| `npba` | `decimal(15,2)` | YES | — | `NULL` | — |
| `other_allowances` | `decimal(15,2)` | YES | — | `NULL` | — |
| `gross_salary` | `decimal(15,2)` | YES | — | `NULL` | — |
| `wage_type` | `enum('Per Day','Per Month')` | YES | — | `NULL` | — |
| `expected_salary` | `decimal(15,2)` | YES | — | `NULL` | — |
| `pf_number` | `varchar(50)` | YES | — | `NULL` | — |
| `pf_effective_date` | `date` | YES | — | `NULL` | — |
| `uan` | `varchar(50)` | YES | — | `NULL` | — |
| `esi_number` | `varchar(50)` | YES | — | `NULL` | — |
| `esi_dispensary` | `varchar(200)` | YES | — | `NULL` | — |
| `mediclaim_number` | `varchar(50)` | YES | — | `NULL` | — |
| `previous_pf_account_number` | `varchar(50)` | YES | — | `NULL` | — |
| `previous_employer_exit_date` | `date` | YES | — | `NULL` | — |
| `scheme_certificate_number` | `varchar(50)` | YES | — | `NULL` | — |
| `pension_payment_order_number` | `varchar(50)` | YES | — | `NULL` | — |
| `is_international_worker` | `tinyint(1)` | NO | — | `0` | — |
| `country` | `varchar(100)` | YES | — | `NULL` | — |
| `passport_number` | `varchar(50)` | YES | — | `NULL` | — |
| `passport_validity` | `date` | YES | — | `NULL` | — |
| `bank_name` | `varchar(200)` | YES | — | `NULL` | — |
| `bank_account_number` | `varchar(50)` | YES | — | `NULL` | — |
| `ifsc_code` | `varchar(20)` | YES | — | `NULL` | — |
| `user_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `username` | `varchar(100)` | YES | UNI | `NULL` | — |
| `password_hash` | `varchar(255)` | YES | — | `NULL` | — |
| `is_first_login` | `tinyint(1)` | NO | — | `1` | — |
| `status` | `enum('active','inactive','terminated','resigned')` | NO | MUL | `'active'` | — |
| `date_of_resignation` | `date` | YES | — | `NULL` | — |
| `date_of_relieving` | `date` | YES | — | `NULL` | — |
| `resignation_reason` | `text` | YES | — | `NULL` | — |
| `is_re_employment_eligible` | `tinyint(1)` | NO | — | `1` | — |
| `re_employment_remarks` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | MUL | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `department_id` → `departments.id`
- `employer_id` → `employers.id`
- `unit_id` → `company_units.id`
- `updated_by` → `users.id`
- `user_id` → `users.id`

## employee_dependents

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `dependent_name` | `varchar(200)` | NO | — | NULL | — |
| `relationship` | `varchar(100)` | YES | — | `NULL` | — |
| `date_of_birth` | `date` | YES | — | `NULL` | — |
| `age` | `int(11)` | YES | — | `NULL` | — |
| `sex` | `enum('Male','Female','Other')` | YES | — | `NULL` | — |
| `occupation` | `varchar(150)` | YES | — | `NULL` | — |
| `aadhaar_number` | `varchar(20)` | YES | — | `NULL` | — |
| `is_nominee` | `tinyint(1)` | NO | — | `0` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`

## employee_documents

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `document_type` | `varchar(100)` | NO | MUL | NULL | — |
| `document_name` | `varchar(255)` | NO | — | NULL | — |
| `file_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `file_path` | `varchar(500)` | YES | — | `NULL` | — |
| `file_size` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `mime_type` | `varchar(150)` | YES | — | `NULL` | — |
| `issue_date` | `date` | YES | — | `NULL` | — |
| `expiry_date` | `date` | YES | MUL | `NULL` | — |
| `document_number` | `varchar(100)` | YES | — | `NULL` | — |
| `is_verified` | `tinyint(1)` | NO | — | `0` | — |
| `verified_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `verified_at` | `datetime` | YES | — | `NULL` | — |
| `remarks` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`
- `verified_by` → `users.id`

## employee_experience

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `company_name` | `varchar(255)` | NO | — | NULL | — |
| `designation` | `varchar(150)` | YES | — | `NULL` | — |
| `department` | `varchar(150)` | YES | — | `NULL` | — |
| `date_from` | `date` | YES | — | `NULL` | — |
| `date_to` | `date` | YES | — | `NULL` | — |
| `total_period` | `varchar(50)` | YES | — | `NULL` | — |
| `last_salary` | `decimal(15,2)` | YES | — | `NULL` | — |
| `reason_for_leaving` | `varchar(500)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`

## employee_file_checklist

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `item_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `is_checked` | `tinyint(1)` | NO | — | `0` | — |
| `checked_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `checked_at` | `datetime` | YES | — | `NULL` | — |
| `remarks` | `varchar(500)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `checked_by` → `users.id`
- `employee_id` → `employees.id`
- `item_id` → `personal_file_checklist_items.id`

## employee_interviews

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `interview_date` | `date` | YES | — | `NULL` | — |
| `interviewer_name` | `varchar(200)` | YES | — | `NULL` | — |
| `position_applied` | `varchar(150)` | YES | — | `NULL` | — |
| `qualification_rating` | `tinyint(4)` | YES | — | `NULL` | — |
| `experience_rating` | `tinyint(4)` | YES | — | `NULL` | — |
| `communication_rating` | `tinyint(4)` | YES | — | `NULL` | — |
| `technical_rating` | `tinyint(4)` | YES | — | `NULL` | — |
| `attitude_rating` | `tinyint(4)` | YES | — | `NULL` | — |
| `overall_rating` | `decimal(3,1)` | YES | — | `NULL` | — |
| `recommendation` | `enum('Recommended','On Hold','Not Recommended')` | YES | — | `NULL` | — |
| `remarks` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`

## employee_nominees

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `form_type` | `enum('EPF_FORM_2','EPS_FORM_2','GRATUITY_FORM_F','ESI_FORM_1')` | NO | MUL | NULL | — |
| `nominee_name` | `varchar(200)` | NO | — | NULL | — |
| `relationship` | `varchar(100)` | YES | — | `NULL` | — |
| `date_of_birth` | `date` | YES | — | `NULL` | — |
| `address` | `text` | YES | — | `NULL` | — |
| `share_percentage` | `decimal(5,2)` | YES | — | `NULL` | — |
| `is_minor` | `tinyint(1)` | NO | — | `0` | — |
| `guardian_name` | `varchar(200)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`

## employee_qualifications

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `qualification` | `varchar(150)` | NO | — | NULL | — |
| `specialization` | `varchar(150)` | YES | — | `NULL` | — |
| `institution` | `varchar(255)` | YES | — | `NULL` | — |
| `board_university` | `varchar(255)` | YES | — | `NULL` | — |
| `year_of_passing` | `varchar(10)` | YES | — | `NULL` | — |
| `percentage` | `varchar(20)` | YES | — | `NULL` | — |
| `grade` | `varchar(20)` | YES | — | `NULL` | — |
| `remarks` | `varchar(255)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`

## employee_references

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `reference_name` | `varchar(200)` | NO | — | NULL | — |
| `designation` | `varchar(150)` | YES | — | `NULL` | — |
| `organization` | `varchar(255)` | YES | — | `NULL` | — |
| `address` | `text` | YES | — | `NULL` | — |
| `mobile` | `varchar(20)` | YES | — | `NULL` | — |
| `email` | `varchar(255)` | YES | — | `NULL` | — |
| `relationship` | `varchar(100)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`

## employee_service_records

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `employer_name` | `varchar(255)` | YES | — | `NULL` | — |
| `designation` | `varchar(100)` | YES | — | `NULL` | — |
| `department` | `varchar(100)` | YES | — | `NULL` | — |
| `date_from` | `date` | YES | — | `NULL` | — |
| `date_to` | `date` | YES | — | `NULL` | — |
| `total_period` | `varchar(50)` | YES | — | `NULL` | — |
| `last_drawn_salary` | `decimal(15,2)` | YES | — | `NULL` | — |
| `reason_for_leaving` | `text` | YES | — | `NULL` | — |
| `remarks` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`
- `employer_id` → `employers.id`

## employers

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `company_name` | `varchar(255)` | NO | MUL | NULL | — |
| `employer_code` | `varchar(50)` | NO | UNI | NULL | — |
| `gst_number` | `varchar(20)` | YES | — | `NULL` | — |
| `pan_number` | `varchar(20)` | YES | — | `NULL` | — |
| `cin_number` | `varchar(30)` | YES | — | `NULL` | — |
| `industry_type` | `varchar(100)` | YES | — | `NULL` | — |
| `company_type` | `varchar(100)` | YES | — | `NULL` | — |
| `year_of_establishment` | `int(11)` | YES | — | `NULL` | — |
| `website_url` | `varchar(255)` | YES | — | `NULL` | — |
| `email` | `varchar(255)` | YES | MUL | `NULL` | — |
| `phone` | `varchar(20)` | YES | — | `NULL` | — |
| `mobile` | `varchar(20)` | YES | — | `NULL` | — |
| `fax` | `varchar(20)` | YES | — | `NULL` | — |
| `address_line_1` | `varchar(255)` | YES | — | `NULL` | — |
| `address_line_2` | `varchar(255)` | YES | — | `NULL` | — |
| `city` | `varchar(100)` | YES | — | `NULL` | — |
| `state` | `varchar(100)` | YES | MUL | `NULL` | — |
| `pincode` | `varchar(10)` | YES | — | `NULL` | — |
| `country` | `varchar(100)` | NO | — | `'India'` | — |
| `contact_person_name` | `varchar(200)` | YES | — | `NULL` | — |
| `contact_person_designation` | `varchar(100)` | YES | — | `NULL` | — |
| `contact_person_email` | `varchar(255)` | YES | — | `NULL` | — |
| `contact_person_mobile` | `varchar(20)` | YES | — | `NULL` | — |
| `contact_person_alternate_mobile` | `varchar(20)` | YES | — | `NULL` | — |
| `number_of_units` | `int(11)` | NO | — | `1` | — |
| `approximate_employee_count` | `int(11)` | YES | — | `NULL` | — |
| `compliance_contact_person` | `varchar(200)` | YES | — | `NULL` | — |
| `compliance_contact_email` | `varchar(255)` | YES | — | `NULL` | — |
| `compliance_contact_phone` | `varchar(20)` | YES | — | `NULL` | — |
| `payroll_contact_person` | `varchar(200)` | YES | — | `NULL` | — |
| `payroll_contact_email` | `varchar(255)` | YES | — | `NULL` | — |
| `payroll_contact_phone` | `varchar(20)` | YES | — | `NULL` | — |
| `notes` | `text` | YES | — | `NULL` | — |
| `status` | `enum('active','inactive')` | NO | MUL | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | MUL | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `updated_by` → `users.id`

## employer_compliance_mapping

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `act_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `rule_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `is_applicable` | `tinyint(1)` | NO | — | `1` | — |
| `compliance_status` | `enum('Compliant','Partially Compliant','Non-Compliant','Under Review','Not Assessed')` | NO | — | `'Not Assessed'` | — |
| `last_assessed_at` | `datetime` | YES | — | `NULL` | — |
| `assessed_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `next_due_date` | `date` | YES | — | `NULL` | — |
| `remarks` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `act_id` → `compliance_acts.id`
- `assessed_by` → `users.id`
- `employer_id` → `employers.id`
- `rule_id` → `compliance_rules.id`

## employer_users

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `user_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `is_primary` | `tinyint(1)` | NO | — | `0` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `employer_id` → `employers.id`
- `user_id` → `users.id`

## error_logs

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `error_code` | `varchar(50)` | YES | — | `NULL` | — |
| `error_type` | `varchar(150)` | NO | — | NULL | — |
| `message` | `text` | NO | — | NULL | — |
| `stack_trace` | `longtext` | YES | — | `NULL` | — |
| `file_path` | `varchar(500)` | YES | — | `NULL` | — |
| `line_number` | `int(11)` | YES | — | `NULL` | — |
| `route` | `varchar(500)` | YES | — | `NULL` | — |
| `request_method` | `varchar(10)` | YES | — | `NULL` | — |
| `request_body` | `longtext` | YES | — | `NULL` | — |
| `user_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `ip_address` | `varchar(45)` | YES | — | `NULL` | — |
| `severity` | `enum('debug','info','warning','error','critical','fatal')` | NO | MUL | `'error'` | — |
| `is_resolved` | `tinyint(1)` | NO | MUL | `0` | — |
| `resolved_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `resolved_at` | `datetime` | YES | — | `NULL` | — |
| `resolution_note` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | MUL | `current_timestamp()` | — |

**Foreign keys**

- `user_id` → `users.id`

## files

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `original_name` | `varchar(500)` | NO | — | NULL | — |
| `stored_name` | `varchar(500)` | NO | — | NULL | — |
| `storage_driver` | `enum('local','s3','gcs','azure')` | NO | — | `'local'` | — |
| `storage_path` | `varchar(1000)` | NO | — | NULL | — |
| `mime_type` | `varchar(150)` | YES | — | `NULL` | — |
| `extension` | `varchar(20)` | YES | — | `NULL` | — |
| `size_bytes` | `bigint(20) unsigned` | NO | — | `0` | — |
| `checksum_sha256` | `char(64)` | YES | — | `NULL` | — |
| `entity_type` | `enum('EMPLOYER','EMPLOYEE','AUDITOR','AUDIT_ASSIGNMENT','AUDIT_REPORT','SUBMISSION','PAYSLIP','PAYROLL_RUN','COMPLIANCE_DOCUMENT','WORK_PERMIT','CMS_MEDIA','STUDY','RISK','ASSESSMENT','USER','OTHER')` | NO | MUL | `'OTHER'` | — |
| `entity_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `category` | `varchar(100)` | YES | — | `NULL` | — |
| `version` | `int(11)` | NO | — | `1` | — |
| `parent_file_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `is_current_version` | `tinyint(1)` | NO | — | `1` | — |
| `access_level` | `enum('private','employer','auditor','verifier','public','restricted')` | NO | MUL | `'private'` | — |
| `allowed_role_ids` | `longtext` | YES | — | `NULL` | — |
| `description` | `varchar(500)` | YES | — | `NULL` | — |
| `tags` | `varchar(500)` | YES | — | `NULL` | — |
| `download_count` | `int(11)` | NO | — | `0` | — |
| `is_archived` | `tinyint(1)` | NO | — | `0` | — |
| `expires_at` | `datetime` | YES | — | `NULL` | — |
| `uploaded_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_at` | `datetime` | NO | MUL | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `deleted_at` | `datetime` | YES | MUL | `NULL` | — |

**Foreign keys**

- `parent_file_id` → `files.id`
- `uploaded_by` → `users.id`

## file_access_logs

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `file_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `user_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `action` | `enum('view','download','upload','delete','share','version')` | NO | — | NULL | — |
| `ip_address` | `varchar(45)` | YES | — | `NULL` | — |
| `user_agent` | `varchar(500)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `file_id` → `files.id`
- `user_id` → `users.id`

## file_versions

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `file_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `version` | `int(11)` | NO | — | NULL | — |
| `storage_path` | `varchar(1000)` | NO | — | NULL | — |
| `size_bytes` | `bigint(20) unsigned` | NO | — | `0` | — |
| `checksum_sha256` | `char(64)` | YES | — | `NULL` | — |
| `change_note` | `varchar(500)` | YES | — | `NULL` | — |
| `uploaded_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `file_id` → `files.id`
- `uploaded_by` → `users.id`

## full_final_settlements

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `settlement_number` | `varchar(50)` | NO | UNI | NULL | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `resignation_date` | `date` | YES | — | `NULL` | — |
| `relieving_date` | `date` | YES | — | `NULL` | — |
| `last_working_day` | `date` | YES | — | `NULL` | — |
| `notice_period_days` | `int(11)` | YES | — | `NULL` | — |
| `notice_period_served_days` | `int(11)` | YES | — | `NULL` | — |
| `notice_pay_recovery` | `decimal(15,2)` | NO | — | `0.00` | — |
| `salary_payable` | `decimal(15,2)` | NO | — | `0.00` | — |
| `leave_encashment` | `decimal(15,2)` | NO | — | `0.00` | — |
| `bonus_payable` | `decimal(15,2)` | NO | — | `0.00` | — |
| `gratuity_payable` | `decimal(15,2)` | NO | — | `0.00` | — |
| `arrears_payable` | `decimal(15,2)` | NO | — | `0.00` | — |
| `other_earnings` | `decimal(15,2)` | NO | — | `0.00` | — |
| `total_earnings` | `decimal(15,2)` | NO | — | `0.00` | — |
| `advance_recovery` | `decimal(15,2)` | NO | — | `0.00` | — |
| `asset_recovery` | `decimal(15,2)` | NO | — | `0.00` | — |
| `loan_recovery` | `decimal(15,2)` | NO | — | `0.00` | — |
| `tds_deduction` | `decimal(15,2)` | NO | — | `0.00` | — |
| `other_deductions` | `decimal(15,2)` | NO | — | `0.00` | — |
| `total_deductions` | `decimal(15,2)` | NO | — | `0.00` | — |
| `net_settlement_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `status` | `enum('Draft','Submitted','Approved','Paid','Cancelled')` | NO | MUL | `'Draft'` | — |
| `approved_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `approved_at` | `datetime` | YES | — | `NULL` | — |
| `payment_date` | `date` | YES | — | `NULL` | — |
| `payment_reference` | `varchar(100)` | YES | — | `NULL` | — |
| `remarks` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`
- `employer_id` → `employers.id`

## gratuity_records

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `service_from` | `date` | NO | — | NULL | — |
| `service_to` | `date` | NO | — | NULL | — |
| `total_service_years` | `decimal(5,2)` | NO | — | `0.00` | — |
| `last_drawn_wages` | `decimal(15,2)` | NO | — | `0.00` | — |
| `basic_plus_da` | `decimal(15,2)` | NO | — | `0.00` | — |
| `gratuity_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `is_statutory_eligible` | `tinyint(1)` | NO | — | `1` | — |
| `calculation_note` | `varchar(500)` | YES | — | `NULL` | — |
| `payment_date` | `date` | YES | — | `NULL` | — |
| `payment_status` | `enum('Pending','Paid','On Hold')` | NO | — | `'Pending'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`
- `employer_id` → `employers.id`

## holidays

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | NULL = platform-wide holiday calendar |
| `holiday_name` | `varchar(200)` | NO | — | NULL | — |
| `holiday_date` | `date` | NO | MUL | NULL | — |
| `year` | `smallint(5) unsigned` | NO | MUL | NULL | — |
| `holiday_type` | `enum('National','State','Festival','Company','Optional')` | NO | — | `'Company'` | — |
| `is_paid` | `tinyint(1)` | NO | — | `1` | — |
| `description` | `varchar(500)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employer_id` → `employers.id`

## leave_applications

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `application_number` | `varchar(50)` | NO | UNI | NULL | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `leave_type_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `date_from` | `date` | NO | MUL | NULL | — |
| `date_to` | `date` | NO | — | NULL | — |
| `total_days` | `decimal(6,2)` | NO | — | NULL | — |
| `is_half_day` | `tinyint(1)` | NO | — | `0` | — |
| `reason` | `text` | YES | — | `NULL` | — |
| `document_file_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `status` | `enum('Pending','Approved','Rejected','Cancelled','Withdrawn')` | NO | MUL | `'Pending'` | — |
| `approved_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `approved_at` | `datetime` | YES | — | `NULL` | — |
| `approver_comments` | `text` | YES | — | `NULL` | — |
| `applied_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `approved_by` → `users.id`
- `employee_id` → `employees.id`
- `employer_id` → `employers.id`
- `leave_type_id` → `leave_types.id`

## leave_ledgers

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `leave_type_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `year` | `smallint(5) unsigned` | NO | — | NULL | — |
| `opening_balance` | `decimal(6,2)` | NO | — | `0.00` | — |
| `accrued` | `decimal(6,2)` | NO | — | `0.00` | — |
| `availed` | `decimal(6,2)` | NO | — | `0.00` | — |
| `encashed` | `decimal(6,2)` | NO | — | `0.00` | — |
| `lapsed` | `decimal(6,2)` | NO | — | `0.00` | — |
| `closing_balance` | `decimal(6,2)` | NO | — | `0.00` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`
- `employer_id` → `employers.id`
- `leave_type_id` → `leave_types.id`

## leave_types

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | NULL = platform-wide default type |
| `code` | `varchar(20)` | NO | — | NULL | — |
| `name` | `varchar(100)` | NO | — | NULL | — |
| `name_ta` | `varchar(100)` | YES | — | `NULL` | — |
| `is_paid` | `tinyint(1)` | NO | — | `1` | — |
| `max_days_per_year` | `decimal(6,2)` | YES | — | `NULL` | — |
| `carry_forward` | `tinyint(1)` | NO | — | `0` | — |
| `max_carry_forward` | `decimal(6,2)` | YES | — | `NULL` | — |
| `encashable` | `tinyint(1)` | NO | — | `0` | — |
| `requires_document` | `tinyint(1)` | NO | — | `0` | — |
| `min_days_notice` | `int(11)` | NO | — | `0` | — |
| `allow_half_day` | `tinyint(1)` | NO | — | `1` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `employer_id` → `employers.id`

## login_attempts

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `email` | `varchar(255)` | NO | MUL | NULL | — |
| `user_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `success` | `tinyint(1)` | NO | — | `0` | — |
| `failure_reason` | `varchar(200)` | YES | — | `NULL` | — |
| `ip_address` | `varchar(45)` | YES | MUL | `NULL` | — |
| `user_agent` | `varchar(500)` | YES | — | `NULL` | — |
| `attempted_at` | `datetime` | NO | MUL | `current_timestamp()` | — |

## notifications

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `user_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `title` | `varchar(255)` | NO | — | NULL | — |
| `message` | `text` | NO | — | NULL | — |
| `type` | `enum('info','success','warning','error','action_required')` | NO | — | `'info'` | — |
| `category` | `enum('AUDIT','REPORT','PAYROLL','COMPLIANCE','EMPLOYEE','EMPLOYER','ACCOUNT','SYSTEM','REMINDER')` | NO | MUL | `'SYSTEM'` | — |
| `priority` | `enum('low','normal','high','urgent')` | NO | — | `'normal'` | — |
| `action_url` | `varchar(500)` | YES | — | `NULL` | — |
| `action_label` | `varchar(100)` | YES | — | `NULL` | — |
| `entity_type` | `varchar(50)` | YES | MUL | `NULL` | — |
| `entity_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `is_read` | `tinyint(1)` | NO | — | `0` | — |
| `read_at` | `datetime` | YES | — | `NULL` | — |
| `email_sent` | `tinyint(1)` | NO | — | `0` | — |
| `sms_sent` | `tinyint(1)` | NO | — | `0` | — |
| `whatsapp_sent` | `tinyint(1)` | NO | — | `0` | — |
| `expires_at` | `datetime` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | MUL | `current_timestamp()` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `user_id` → `users.id`

## notification_logs

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `notification_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `user_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `channel` | `enum('email','sms','whatsapp','in_app')` | NO | MUL | NULL | — |
| `template_code` | `varchar(100)` | YES | — | `NULL` | — |
| `recipient` | `varchar(255)` | NO | — | NULL | — |
| `subject` | `varchar(300)` | YES | — | `NULL` | — |
| `body` | `longtext` | YES | — | `NULL` | — |
| `status` | `enum('queued','sent','delivered','failed','bounced','read')` | NO | MUL | `'queued'` | — |
| `provider` | `varchar(50)` | YES | — | `NULL` | — |
| `provider_message_id` | `varchar(255)` | YES | — | `NULL` | — |
| `error_message` | `text` | YES | — | `NULL` | — |
| `retry_count` | `int(11)` | NO | — | `0` | — |
| `sent_at` | `datetime` | YES | — | `NULL` | — |
| `delivered_at` | `datetime` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | MUL | `current_timestamp()` | — |

**Foreign keys**

- `notification_id` → `notifications.id`
- `user_id` → `users.id`

## notification_preferences

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `user_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `category` | `varchar(50)` | NO | — | NULL | — |
| `in_app` | `tinyint(1)` | NO | — | `1` | — |
| `email` | `tinyint(1)` | NO | — | `1` | — |
| `sms` | `tinyint(1)` | NO | — | `0` | — |
| `whatsapp` | `tinyint(1)` | NO | — | `0` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `user_id` → `users.id`

## notification_templates

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `template_code` | `varchar(100)` | NO | MUL | NULL | — |
| `template_name` | `varchar(200)` | NO | — | NULL | — |
| `channel` | `enum('email','sms','whatsapp','in_app')` | NO | MUL | NULL | — |
| `subject` | `varchar(300)` | YES | — | `NULL` | — |
| `body_html` | `longtext` | YES | — | `NULL` | — |
| `body_text` | `text` | YES | — | `NULL` | — |
| `variables_json` | `longtext` | YES | — | `NULL` | Declared merge variables for validation |
| `locale` | `varchar(10)` | NO | — | `'en'` | — |
| `is_active` | `tinyint(1)` | NO | MUL | `1` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`

## password_reset_tokens

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `user_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `token_hash` | `char(64)` | NO | UNI | NULL | — |
| `expires_at` | `datetime` | NO | — | NULL | — |
| `used_at` | `datetime` | YES | — | `NULL` | — |
| `ip_address` | `varchar(45)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `user_id` → `users.id`

## payroll_heads

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `head_code` | `varchar(30)` | NO | UNI | NULL | — |
| `head_name` | `varchar(150)` | NO | — | NULL | — |
| `head_name_ta` | `varchar(150)` | YES | — | `NULL` | Tamil label for bilingual payslip |
| `head_type` | `enum('Earning','Deduction','Employer Contribution')` | NO | — | NULL | — |
| `calculation_type` | `enum('Fixed','Percent of Basic','Percent of Gross','Formula','Attendance Based')` | NO | — | `'Fixed'` | — |
| `percent_value` | `decimal(7,3)` | YES | — | `NULL` | — |
| `formula` | `varchar(500)` | YES | — | `NULL` | — |
| `is_statutory` | `tinyint(1)` | NO | — | `0` | — |
| `is_taxable` | `tinyint(1)` | NO | — | `1` | — |
| `is_pf_applicable` | `tinyint(1)` | NO | — | `0` | — |
| `is_esi_applicable` | `tinyint(1)` | NO | — | `0` | — |
| `show_on_payslip` | `tinyint(1)` | NO | — | `1` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `status` | `enum('active','inactive')` | NO | — | `'active'` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

## payroll_items

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `payslip_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `payroll_run_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `head_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `head_code` | `varchar(30)` | NO | — | NULL | — |
| `head_name` | `varchar(150)` | NO | — | NULL | — |
| `head_name_ta` | `varchar(150)` | YES | — | `NULL` | — |
| `head_type` | `enum('Earning','Deduction','Employer Contribution')` | NO | — | NULL | — |
| `amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `is_statutory` | `tinyint(1)` | NO | — | `0` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `head_id` → `payroll_heads.id`
- `payslip_id` → `payslips.id`
- `payroll_run_id` → `payroll_runs.id`

## payroll_runs

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `run_number` | `varchar(50)` | NO | UNI | NULL | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `month` | `tinyint(3) unsigned` | NO | — | NULL | — |
| `year` | `smallint(5) unsigned` | NO | MUL | NULL | — |
| `period_from` | `date` | NO | — | NULL | — |
| `period_to` | `date` | NO | — | NULL | — |
| `total_employees` | `int(11)` | NO | — | `0` | — |
| `total_gross` | `decimal(18,2)` | NO | — | `0.00` | — |
| `total_deductions` | `decimal(18,2)` | NO | — | `0.00` | — |
| `total_net` | `decimal(18,2)` | NO | — | `0.00` | — |
| `total_pf_employee` | `decimal(18,2)` | NO | — | `0.00` | — |
| `total_pf_employer` | `decimal(18,2)` | NO | — | `0.00` | — |
| `total_esi_employee` | `decimal(18,2)` | NO | — | `0.00` | — |
| `total_esi_employer` | `decimal(18,2)` | NO | — | `0.00` | — |
| `total_pt` | `decimal(18,2)` | NO | — | `0.00` | — |
| `total_lwf` | `decimal(18,2)` | NO | — | `0.00` | — |
| `total_overtime` | `decimal(18,2)` | NO | — | `0.00` | — |
| `paid_days_total` | `decimal(12,2)` | NO | — | `0.00` | — |
| `status` | `enum('Draft','Calculated','Approved','Locked','Paid','Cancelled')` | NO | MUL | `'Draft'` | — |
| `calculation_notes` | `text` | YES | — | `NULL` | — |
| `processed_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `processed_at` | `datetime` | YES | — | `NULL` | — |
| `approved_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `approved_at` | `datetime` | YES | — | `NULL` | — |
| `locked_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `locked_at` | `datetime` | YES | — | `NULL` | — |
| `bank_file_generated_at` | `datetime` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `approved_by` → `users.id`
- `department_id` → `departments.id`
- `employer_id` → `employers.id`
- `unit_id` → `company_units.id`

## payslips

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `payslip_number` | `varchar(50)` | NO | UNI | NULL | — |
| `payroll_run_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `month` | `tinyint(3) unsigned` | NO | — | NULL | — |
| `year` | `smallint(5) unsigned` | NO | MUL | NULL | — |
| `period_from` | `date` | NO | — | NULL | — |
| `period_to` | `date` | NO | — | NULL | — |
| `working_days` | `decimal(6,2)` | NO | — | `0.00` | — |
| `paid_days` | `decimal(6,2)` | NO | — | `0.00` | — |
| `lop_days` | `decimal(6,2)` | NO | — | `0.00` | — |
| `present_days` | `decimal(6,2)` | NO | — | `0.00` | — |
| `absent_days` | `decimal(6,2)` | NO | — | `0.00` | — |
| `leave_days` | `decimal(6,2)` | NO | — | `0.00` | — |
| `holiday_days` | `decimal(6,2)` | NO | — | `0.00` | — |
| `weekly_off_days` | `decimal(6,2)` | NO | — | `0.00` | — |
| `overtime_hours` | `decimal(7,2)` | NO | — | `0.00` | — |
| `basic` | `decimal(15,2)` | NO | — | `0.00` | — |
| `da` | `decimal(15,2)` | NO | — | `0.00` | — |
| `hra` | `decimal(15,2)` | NO | — | `0.00` | — |
| `ta` | `decimal(15,2)` | NO | — | `0.00` | — |
| `pa` | `decimal(15,2)` | NO | — | `0.00` | — |
| `ea` | `decimal(15,2)` | NO | — | `0.00` | — |
| `npba` | `decimal(15,2)` | NO | — | `0.00` | — |
| `other_allowances` | `decimal(15,2)` | NO | — | `0.00` | — |
| `overtime_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `bonus_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `arrears_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `gross_earnings` | `decimal(15,2)` | NO | — | `0.00` | — |
| `pf_employee` | `decimal(15,2)` | NO | — | `0.00` | — |
| `pf_employer` | `decimal(15,2)` | NO | — | `0.00` | — |
| `vpf_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `esi_employee` | `decimal(15,2)` | NO | — | `0.00` | — |
| `esi_employer` | `decimal(15,2)` | NO | — | `0.00` | — |
| `professional_tax` | `decimal(15,2)` | NO | — | `0.00` | — |
| `lwf_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `tds_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `advance_deduction` | `decimal(15,2)` | NO | — | `0.00` | — |
| `canteen_deduction` | `decimal(15,2)` | NO | — | `0.00` | — |
| `other_deductions` | `decimal(15,2)` | NO | — | `0.00` | — |
| `total_deductions` | `decimal(15,2)` | NO | — | `0.00` | — |
| `net_pay` | `decimal(15,2)` | NO | — | `0.00` | — |
| `net_pay_in_words` | `varchar(500)` | YES | — | `NULL` | — |
| `bank_name` | `varchar(200)` | YES | — | `NULL` | — |
| `bank_account_number` | `varchar(50)` | YES | — | `NULL` | — |
| `ifsc_code` | `varchar(20)` | YES | — | `NULL` | — |
| `payment_mode` | `enum('Bank Transfer','Cash','Cheque','UPI')` | NO | — | `'Bank Transfer'` | — |
| `payment_status` | `enum('Pending','Paid','Failed','On Hold')` | NO | MUL | `'Pending'` | — |
| `paid_at` | `datetime` | YES | — | `NULL` | — |
| `payment_reference` | `varchar(100)` | YES | — | `NULL` | — |
| `pdf_file_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `pdf_generated_at` | `datetime` | YES | — | `NULL` | — |
| `is_published` | `tinyint(1)` | NO | MUL | `0` | — |
| `published_at` | `datetime` | YES | — | `NULL` | — |
| `employee_viewed_at` | `datetime` | YES | — | `NULL` | — |
| `remarks` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `department_id` → `departments.id`
- `employee_id` → `employees.id`
- `employer_id` → `employers.id`
- `payroll_run_id` → `payroll_runs.id`
- `unit_id` → `company_units.id`

## pdf_layouts

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `form_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `name` | `varchar(200)` | NO | — | NULL | — |
| `page_size` | `enum('A4','A3','LETTER','LEGAL')` | NO | — | `'A4'` | — |
| `orientation` | `enum('portrait','landscape')` | NO | — | `'portrait'` | — |
| `margin_top_mm` | `int(11)` | NO | — | `20` | — |
| `margin_bottom_mm` | `int(11)` | NO | — | `20` | — |
| `margin_left_mm` | `int(11)` | NO | — | `15` | — |
| `margin_right_mm` | `int(11)` | NO | — | `15` | — |
| `header_enabled` | `tinyint(1)` | NO | — | `1` | — |
| `header_html` | `text` | YES | — | `NULL` | — |
| `footer_enabled` | `tinyint(1)` | NO | — | `1` | — |
| `footer_html` | `text` | YES | — | `NULL` | — |
| `show_page_numbers` | `tinyint(1)` | NO | — | `1` | — |
| `show_company_header` | `tinyint(1)` | NO | — | `1` | — |
| `repeat_table_headers` | `tinyint(1)` | NO | — | `1` | — |
| `watermark_text` | `varchar(100)` | YES | — | `NULL` | — |
| `sections_json` | `longtext` | YES | — | `NULL` | Ordered section/field visibility for the PDF |
| `is_default` | `tinyint(1)` | NO | — | `1` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `form_id` → `dynamic_forms.id`

## permissions

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `name` | `varchar(150)` | NO | UNI | NULL | — |
| `module` | `varchar(100)` | NO | MUL | NULL | — |
| `action` | `enum('create','read','update','delete','export','approve','reject','verify','share','download','upload')` | NO | MUL | NULL | — |
| `description` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

## personal_file_checklist_items

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `item_code` | `varchar(50)` | NO | UNI | NULL | — |
| `item_label` | `varchar(255)` | NO | — | NULL | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `is_mandatory` | `tinyint(1)` | NO | — | `1` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

## reminder_dispatches

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `reminder_key` | `varchar(255)` | NO | MUL | NULL | e.g. compliance:12:90 |
| `reminder_type` | `enum('COMPLIANCE_EXPIRY','AUDIT_DUE','PAYROLL_PENDING','LEAVE_PENDING','DOCUMENT_EXPIRY','OTHER')` | NO | MUL | NULL | — |
| `entity_type` | `varchar(50)` | YES | MUL | `NULL` | — |
| `entity_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `channel` | `enum('in_app','email','sms','whatsapp')` | NO | — | NULL | — |
| `recipient` | `varchar(255)` | YES | — | `NULL` | — |
| `sent_at` | `datetime` | NO | — | `current_timestamp()` | — |

## risk_reports

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `risk_number` | `varchar(50)` | NO | UNI | NULL | — |
| `title` | `varchar(255)` | NO | — | NULL | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `hazard_id` | `varchar(50)` | YES | — | `NULL` | — |
| `hazard_type` | `varchar(150)` | YES | — | `NULL` | — |
| `risk_description` | `text` | YES | — | `NULL` | — |
| `affected_persons` | `varchar(255)` | YES | — | `NULL` | — |
| `likelihood` | `tinyint(4)` | YES | — | `NULL` | — |
| `severity` | `tinyint(4)` | YES | — | `NULL` | — |
| `risk_score` | `tinyint(4)` | YES | — | `NULL` | — |
| `risk_level` | `enum('Low','Medium','High','Extreme')` | YES | MUL | `NULL` | — |
| `mitigation_plan` | `text` | YES | — | `NULL` | — |
| `control_hierarchy` | `enum('Elimination','Substitution','Engineering','Administrative','PPE')` | YES | — | `NULL` | — |
| `owner_name` | `varchar(200)` | YES | — | `NULL` | — |
| `review_frequency` | `enum('Monthly','Quarterly','Half-Yearly','Annual')` | YES | — | `NULL` | — |
| `next_review_date` | `date` | YES | — | `NULL` | — |
| `status` | `enum('Open','In Progress','Mitigated','Accepted','Closed')` | NO | MUL | `'Open'` | — |
| `auditor_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `auditor_id` → `auditors.id`
- `employer_id` → `employers.id`
- `unit_id` → `company_units.id`

## roles

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `name` | `varchar(100)` | NO | UNI | NULL | — |
| `slug` | `varchar(100)` | NO | UNI | NULL | — |
| `description` | `text` | YES | — | `NULL` | — |
| `is_system_role` | `tinyint(1)` | NO | — | `0` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

## role_permissions

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `role_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `permission_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `permission_id` → `permissions.id`
- `role_id` → `roles.id`

## salary_structures

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `employee_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `structure_name` | `varchar(150)` | YES | — | `NULL` | — |
| `effective_from` | `date` | NO | MUL | NULL | — |
| `effective_to` | `date` | YES | — | `NULL` | — |
| `basic` | `decimal(15,2)` | NO | — | `0.00` | — |
| `da` | `decimal(15,2)` | NO | — | `0.00` | — |
| `hra` | `decimal(15,2)` | NO | — | `0.00` | — |
| `ta` | `decimal(15,2)` | NO | — | `0.00` | — |
| `pa` | `decimal(15,2)` | NO | — | `0.00` | — |
| `ea` | `decimal(15,2)` | NO | — | `0.00` | — |
| `npba` | `decimal(15,2)` | NO | — | `0.00` | — |
| `other_allowances` | `decimal(15,2)` | NO | — | `0.00` | — |
| `gross_salary` | `decimal(15,2)` | NO | — | `0.00` | — |
| `wage_type` | `enum('Per Day','Per Month')` | NO | — | `'Per Month'` | — |
| `daily_wage` | `decimal(15,2)` | YES | — | `NULL` | — |
| `pf_applicable` | `tinyint(1)` | NO | — | `1` | — |
| `pf_employee_percent` | `decimal(6,3)` | NO | — | `12.000` | — |
| `pf_employer_percent` | `decimal(6,3)` | NO | — | `12.000` | — |
| `pf_wage_ceiling` | `decimal(15,2)` | YES | — | `15000.00` | — |
| `vpf_percent` | `decimal(6,3)` | NO | — | `0.000` | — |
| `esi_applicable` | `tinyint(1)` | NO | — | `1` | — |
| `esi_employee_percent` | `decimal(6,3)` | NO | — | `0.750` | — |
| `esi_employer_percent` | `decimal(6,3)` | NO | — | `3.250` | — |
| `esi_wage_ceiling` | `decimal(15,2)` | YES | — | `21000.00` | — |
| `pt_state` | `varchar(100)` | YES | — | `NULL` | — |
| `pt_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `lwf_applicable` | `tinyint(1)` | NO | — | `0` | — |
| `lwf_amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `is_active` | `tinyint(1)` | NO | MUL | `1` | — |
| `revision_number` | `int(11)` | NO | — | `1` | — |
| `revision_reason` | `varchar(255)` | YES | — | `NULL` | — |
| `approved_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `employee_id` → `employees.id`
- `employer_id` → `employers.id`

## salary_structure_items

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `salary_structure_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `payroll_head_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `head_code` | `varchar(30)` | NO | — | NULL | — |
| `head_name` | `varchar(150)` | NO | — | NULL | — |
| `head_type` | `enum('Earning','Deduction','Employer Contribution')` | NO | — | NULL | — |
| `amount` | `decimal(15,2)` | NO | — | `0.00` | — |
| `percent_of_basic` | `decimal(7,3)` | YES | — | `NULL` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `payroll_head_id` → `payroll_heads.id`
- `salary_structure_id` → `salary_structures.id`

## scheduled_jobs

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `job_code` | `varchar(100)` | NO | UNI | NULL | — |
| `job_name` | `varchar(200)` | NO | — | NULL | — |
| `description` | `text` | YES | — | `NULL` | — |
| `cron_expression` | `varchar(100)` | YES | — | `NULL` | — |
| `job_type` | `enum('REMINDER','REPORT','BACKUP','SYNC','CLEANUP','NOTIFICATION')` | NO | — | `'REMINDER'` | — |
| `last_run_at` | `datetime` | YES | — | `NULL` | — |
| `last_run_status` | `enum('success','failed','running','never')` | NO | — | `'never'` | — |
| `last_run_message` | `text` | YES | — | `NULL` | — |
| `next_run_at` | `datetime` | YES | — | `NULL` | — |
| `is_active` | `tinyint(1)` | NO | — | `1` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

## schema_migrations

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `int(10) unsigned` | NO | PRI | NULL | auto_increment |
| `filename` | `varchar(255)` | NO | UNI | NULL | — |
| `checksum` | `char(64)` | NO | — | NULL | — |
| `statements` | `int(11)` | NO | — | `0` | — |
| `duration_ms` | `int(11)` | NO | — | `0` | — |
| `applied_at` | `datetime` | NO | — | `current_timestamp()` | — |

## sessions

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `char(36)` | NO | PRI | NULL | — |
| `user_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `token_hash` | `char(64)` | NO | UNI | NULL | — |
| `ip_address` | `varchar(45)` | YES | — | `NULL` | — |
| `user_agent` | `varchar(500)` | YES | — | `NULL` | — |
| `expires_at` | `datetime` | NO | MUL | NULL | — |
| `revoked_at` | `datetime` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `user_id` → `users.id`

## settings

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `setting_group` | `varchar(100)` | NO | MUL | NULL | — |
| `setting_key` | `varchar(150)` | NO | — | NULL | — |
| `setting_value` | `longtext` | YES | — | `NULL` | — |
| `value_type` | `enum('string','number','boolean','json','encrypted')` | NO | — | `'string'` | — |
| `label` | `varchar(255)` | YES | — | `NULL` | — |
| `description` | `text` | YES | — | `NULL` | — |
| `is_public` | `tinyint(1)` | NO | — | `0` | — |
| `is_encrypted` | `tinyint(1)` | NO | — | `0` | — |
| `sort_order` | `int(11)` | NO | — | `0` | — |
| `updated_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `updated_by` → `users.id`

## sms_logs

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `to_mobile` | `varchar(20)` | NO | MUL | NULL | — |
| `message` | `text` | NO | — | NULL | — |
| `template_code` | `varchar(100)` | YES | — | `NULL` | — |
| `entity_type` | `varchar(50)` | YES | — | `NULL` | — |
| `entity_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `message_type` | `enum('transactional','promotional','otp')` | NO | — | `'transactional'` | — |
| `status` | `enum('queued','sent','failed','delivered')` | NO | MUL | `'queued'` | — |
| `provider` | `varchar(50)` | YES | — | `'twilio'` | — |
| `provider_message_id` | `varchar(255)` | YES | — | `NULL` | — |
| `segments` | `int(11)` | NO | — | `1` | — |
| `cost` | `decimal(10,4)` | YES | — | `NULL` | — |
| `error_message` | `text` | YES | — | `NULL` | — |
| `sent_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `sent_at` | `datetime` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | MUL | `current_timestamp()` | — |

**Foreign keys**

- `sent_by` → `users.id`

## study_reports

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `study_number` | `varchar(50)` | NO | UNI | NULL | — |
| `title` | `varchar(255)` | NO | — | NULL | — |
| `study_type` | `enum('HAZOP','HACCP','FMEA','FTA','ETA','LOPA','BOWTIE','WHAT_IF','OTHER')` | NO | MUL | `'HAZOP'` | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `study_scope` | `text` | YES | — | `NULL` | — |
| `study_team` | `text` | YES | — | `NULL` | — |
| `methodology` | `text` | YES | — | `NULL` | — |
| `node_or_step` | `varchar(255)` | YES | — | `NULL` | — |
| `deviation` | `varchar(255)` | YES | — | `NULL` | — |
| `causes` | `text` | YES | — | `NULL` | — |
| `consequences` | `text` | YES | — | `NULL` | — |
| `safeguards` | `text` | YES | — | `NULL` | — |
| `recommendations` | `text` | YES | — | `NULL` | — |
| `severity` | `tinyint(4)` | YES | — | `NULL` | — |
| `likelihood` | `tinyint(4)` | YES | — | `NULL` | — |
| `risk_score` | `tinyint(4)` | YES | — | `NULL` | — |
| `risk_level` | `enum('Low','Medium','High','Extreme')` | YES | — | `NULL` | — |
| `ccp_number` | `varchar(50)` | YES | — | `NULL` | — |
| `critical_limits` | `varchar(500)` | YES | — | `NULL` | — |
| `monitoring_procedure` | `text` | YES | — | `NULL` | — |
| `corrective_action` | `text` | YES | — | `NULL` | — |
| `verification_procedure` | `text` | YES | — | `NULL` | — |
| `record_keeping` | `varchar(500)` | YES | — | `NULL` | — |
| `study_date` | `date` | YES | — | `NULL` | — |
| `status` | `enum('Draft','Submitted','Under Review','Approved','Rejected','Closed')` | NO | MUL | `'Draft'` | — |
| `auditor_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `auditor_id` → `auditors.id`
- `employer_id` → `employers.id`
- `unit_id` → `company_units.id`

## users

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `email` | `varchar(255)` | NO | UNI | NULL | — |
| `username` | `varchar(100)` | NO | UNI | NULL | — |
| `password_hash` | `varchar(255)` | NO | — | NULL | — |
| `first_name` | `varchar(100)` | NO | — | NULL | — |
| `last_name` | `varchar(100)` | NO | — | NULL | — |
| `mobile` | `varchar(20)` | YES | — | `NULL` | — |
| `profile_photo` | `varchar(500)` | YES | — | `NULL` | — |
| `status` | `enum('active','inactive','suspended')` | NO | MUL | `'active'` | — |
| `is_first_login` | `tinyint(1)` | NO | — | `1` | — |
| `last_login_at` | `datetime` | YES | — | `NULL` | — |
| `last_login_ip` | `varchar(45)` | YES | — | `NULL` | — |
| `failed_login_count` | `int(11)` | NO | — | `0` | — |
| `locked_until` | `datetime` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `deleted_at` | `datetime` | YES | MUL | `NULL` | — |

**Foreign keys**

- `created_by` → `users.id`
- `updated_by` → `users.id`

## user_roles

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `user_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `role_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `assigned_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `assigned_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `assigned_by` → `users.id`
- `role_id` → `roles.id`
- `user_id` → `users.id`

## verifier_assignments

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `report_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `verifier_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `assigned_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `assigned_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `due_date` | `date` | YES | — | `NULL` | — |
| `status` | `enum('pending','in_review','completed','reassigned')` | NO | MUL | `'pending'` | — |
| `completed_at` | `datetime` | YES | — | `NULL` | — |
| `remarks` | `text` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |

**Foreign keys**

- `assigned_by` → `users.id`
- `report_id` → `audit_reports.id`
- `verifier_id` → `users.id`

## verifier_comments

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `report_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `verifier_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `action` | `enum('comment','approved','rejected','returned','verified')` | NO | — | `'comment'` | — |
| `comments` | `text` | NO | — | NULL | — |
| `reason` | `varchar(500)` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |

**Foreign keys**

- `report_id` → `audit_reports.id`
- `verifier_id` → `users.id`

## whatsapp_logs

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `to_mobile` | `varchar(20)` | NO | MUL | NULL | — |
| `message` | `text` | NO | — | NULL | — |
| `media_url` | `varchar(1000)` | YES | — | `NULL` | — |
| `template_code` | `varchar(100)` | YES | — | `NULL` | — |
| `entity_type` | `varchar(50)` | YES | — | `NULL` | — |
| `entity_id` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `status` | `enum('queued','sent','delivered','read','failed')` | NO | MUL | `'queued'` | — |
| `provider` | `varchar(50)` | YES | — | `'meta'` | — |
| `provider_message_id` | `varchar(255)` | YES | — | `NULL` | — |
| `error_message` | `text` | YES | — | `NULL` | — |
| `sent_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `sent_at` | `datetime` | YES | — | `NULL` | — |
| `delivered_at` | `datetime` | YES | — | `NULL` | — |
| `created_at` | `datetime` | NO | MUL | `current_timestamp()` | — |

**Foreign keys**

- `sent_by` → `users.id`

## work_permits

| Column | Type | Null | Key | Default | Notes |
|---|---|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI | NULL | auto_increment |
| `uuid` | `varchar(36)` | NO | UNI | NULL | — |
| `permit_number` | `varchar(50)` | NO | UNI | NULL | — |
| `permit_type` | `enum('Hot Work','Cold Work','Confined Space','Height Work','Electrical','Excavation','Lifting','Radiation','Chemical','General')` | NO | MUL | NULL | — |
| `employer_id` | `bigint(20) unsigned` | NO | MUL | NULL | — |
| `unit_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `department_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `work_description` | `text` | NO | — | NULL | — |
| `location_of_work` | `varchar(255)` | YES | — | `NULL` | — |
| `contractor_name` | `varchar(200)` | YES | — | `NULL` | — |
| `contractor_contact` | `varchar(20)` | YES | — | `NULL` | — |
| `workers_count` | `int(11)` | YES | — | `NULL` | — |
| `requested_by` | `varchar(200)` | YES | — | `NULL` | — |
| `issued_by` | `varchar(200)` | YES | — | `NULL` | — |
| `approved_by` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `valid_from` | `datetime` | YES | — | `NULL` | — |
| `valid_to` | `datetime` | YES | MUL | `NULL` | — |
| `safety_measures` | `text` | YES | — | `NULL` | — |
| `ppe_required` | `varchar(500)` | YES | — | `NULL` | — |
| `ppe_provided` | `tinyint(1)` | NO | — | `0` | — |
| `gas_test_required` | `tinyint(1)` | NO | — | `0` | — |
| `gas_test_result` | `varchar(200)` | YES | — | `NULL` | — |
| `gas_tested_by` | `varchar(200)` | YES | — | `NULL` | — |
| `gas_tested_at` | `datetime` | YES | — | `NULL` | — |
| `fire_watch_required` | `tinyint(1)` | NO | — | `0` | — |
| `fire_watch_details` | `varchar(255)` | YES | — | `NULL` | — |
| `status` | `enum('Draft','Pending Approval','Approved','Rejected','In Progress','Completed','Closed','Expired','Cancelled')` | NO | MUL | `'Draft'` | — |
| `closure_remarks` | `text` | YES | — | `NULL` | — |
| `closed_at` | `datetime` | YES | — | `NULL` | — |
| `closed_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `auditor_id` | `bigint(20) unsigned` | YES | MUL | `NULL` | — |
| `created_at` | `datetime` | NO | — | `current_timestamp()` | — |
| `updated_at` | `datetime` | NO | — | `current_timestamp()` | on update current_timestamp() |
| `created_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `updated_by` | `bigint(20) unsigned` | YES | — | `NULL` | — |
| `deleted_at` | `datetime` | YES | — | `NULL` | — |

**Foreign keys**

- `approved_by` → `users.id`
- `auditor_id` → `auditors.id`
- `department_id` → `departments.id`
- `employer_id` → `employers.id`
- `unit_id` → `company_units.id`
