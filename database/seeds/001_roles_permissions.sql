-- 001_roles_permissions.sql — the six system roles.
-- Permissions and role↔permission grants are generated from lib/auth/rbac.ts by
-- scripts/run-seeds.ts so the matrix can never drift from the code that enforces it.
SET NAMES utf8mb4;

INSERT INTO roles (name, slug, description, is_system_role) VALUES
  ('Super Administrator', 'super_admin', 'Unrestricted platform access including settings and backups', TRUE),
  ('Administrator',       'admin',       'Manages employers, auditors, audits, compliance and CMS', TRUE),
  ('Auditor',             'auditor',     'Executes assigned audits and submits reports', TRUE),
  ('Employer',            'employer',    'Company administrator managing employees, payroll and compliance', TRUE),
  ('Employee',            'employee',    'Self-service access to profile, attendance and payslips', TRUE),
  ('Verifier',            'verifier',    'Reviews, approves or returns submitted reports', TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);
