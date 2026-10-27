-- 028 — CAPAR: Corrective Action Plan Acknowledgement Reports.
--
-- An auditor audits a facility and records, per finding: the Act / Rule it falls under (typed by hand after reading the
-- uploaded Act PDF), the minimum requirement, the finding, a non-compliance photo, root cause, action plan, timeline and
-- evidence. Findings are grouped under admin-editable categories (Business Practices, Fire Safety, ...). A verifier then
-- marks each finding Eligible / Not Eligible and approves or returns the report.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS capar_categories (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(150) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by  BIGINT UNSIGNED DEFAULT NULL,
  deleted_at  DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_capcat_status (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS capar_reports (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid                  VARCHAR(36) NOT NULL,
  report_number         VARCHAR(40) NOT NULL,
  title                 VARCHAR(255) NOT NULL,
  employer_id           BIGINT UNSIGNED NOT NULL,
  unit_id               BIGINT UNSIGNED DEFAULT NULL,
  assignment_id         BIGINT UNSIGNED DEFAULT NULL,
  auditor_id            BIGINT UNSIGNED NOT NULL,
  verifier_id           BIGINT UNSIGNED DEFAULT NULL,
  facility_name         VARCHAR(255) NOT NULL,
  facility_address      TEXT,
  representative_name   VARCHAR(200) DEFAULT NULL,
  representative_title  VARCHAR(150) DEFAULT NULL,
  audit_date            DATE DEFAULT NULL,
  audit_firm            VARCHAR(255) DEFAULT NULL,
  auditor_print_name    VARCHAR(200) DEFAULT NULL,
  standard_reference    VARCHAR(255) DEFAULT NULL,
  letterhead_file_id    BIGINT UNSIGNED DEFAULT NULL,
  logo_file_id          BIGINT UNSIGNED DEFAULT NULL,
  summary_notes         TEXT,
  closing_meeting_date  DATE DEFAULT NULL,
  closing_statement     TEXT,
  facility_signatory    VARCHAR(200) DEFAULT NULL,
  facility_signed_date  DATE DEFAULT NULL,
  status                ENUM('Draft','Submitted','Under Review','Returned','Approved') NOT NULL DEFAULT 'Draft',
  submitted_at          DATETIME DEFAULT NULL,
  reviewed_at           DATETIME DEFAULT NULL,
  approved_at           DATETIME DEFAULT NULL,
  review_comments       TEXT,
  revision_count        INT NOT NULL DEFAULT 0,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by            BIGINT UNSIGNED DEFAULT NULL,
  updated_by            BIGINT UNSIGNED DEFAULT NULL,
  deleted_at            DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_capar_uuid (uuid),
  UNIQUE KEY uq_capar_number (report_number),
  KEY idx_capar_employer (employer_id),
  KEY idx_capar_auditor (auditor_id),
  KEY idx_capar_verifier (verifier_id),
  KEY idx_capar_status (status),
  KEY idx_capar_assignment (assignment_id),
  CONSTRAINT fk_capar_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE CASCADE,
  CONSTRAINT fk_capar_unit FOREIGN KEY (unit_id) REFERENCES company_units(id) ON DELETE SET NULL,
  CONSTRAINT fk_capar_assignment FOREIGN KEY (assignment_id) REFERENCES audit_assignments(id) ON DELETE SET NULL,
  CONSTRAINT fk_capar_auditor FOREIGN KEY (auditor_id) REFERENCES auditors(id) ON DELETE CASCADE,
  CONSTRAINT fk_capar_verifier FOREIGN KEY (verifier_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_capar_letterhead FOREIGN KEY (letterhead_file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_capar_logo FOREIGN KEY (logo_file_id) REFERENCES files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS capar_findings (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id            BIGINT UNSIGNED NOT NULL,
  category_id          BIGINT UNSIGNED DEFAULT NULL,
  sort_order           INT NOT NULL DEFAULT 0,
  outcome              ENUM('Violation','No Violation') NOT NULL DEFAULT 'Violation',
  act_rule             VARCHAR(500) DEFAULT NULL,
  act_id               BIGINT UNSIGNED DEFAULT NULL,
  resource_id          BIGINT UNSIGNED DEFAULT NULL,
  minimum_requirement  TEXT,
  local_law            TEXT,
  finding              TEXT,
  root_cause           TEXT,
  action_plan          TEXT,
  timeline_date        DATE DEFAULT NULL,
  timeline_note        VARCHAR(255) DEFAULT NULL,
  action_status        ENUM('Open','In Progress','Closed') NOT NULL DEFAULT 'Open',
  closed_on            DATE DEFAULT NULL,
  verification_status  ENUM('Pending','Eligible','Not Eligible') NOT NULL DEFAULT 'Pending',
  verification_remark  TEXT,
  verified_by          BIGINT UNSIGNED DEFAULT NULL,
  verified_at          DATETIME DEFAULT NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at           DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_capf_report (report_id, sort_order),
  KEY idx_capf_category (category_id),
  KEY idx_capf_status (action_status),
  CONSTRAINT fk_capf_report FOREIGN KEY (report_id) REFERENCES capar_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_capf_category FOREIGN KEY (category_id) REFERENCES capar_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_capf_act FOREIGN KEY (act_id) REFERENCES compliance_acts(id) ON DELETE SET NULL,
  CONSTRAINT fk_capf_resource FOREIGN KEY (resource_id) REFERENCES cms_resources(id) ON DELETE SET NULL,
  CONSTRAINT fk_capf_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS capar_finding_files (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  finding_id  BIGINT UNSIGNED NOT NULL,
  file_id     BIGINT UNSIGNED NOT NULL,
  kind        ENUM('Photo','Evidence') NOT NULL DEFAULT 'Photo',
  caption     VARCHAR(255) DEFAULT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_by  BIGINT UNSIGNED DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_capff (finding_id, file_id),
  KEY idx_capff_file (file_id),
  CONSTRAINT fk_capff_finding FOREIGN KEY (finding_id) REFERENCES capar_findings(id) ON DELETE CASCADE,
  CONSTRAINT fk_capff_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS capar_review_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id   BIGINT UNSIGNED NOT NULL,
  action      ENUM('Submitted','Returned','Approved','Reopened') NOT NULL,
  comments    TEXT,
  actor_id    BIGINT UNSIGNED DEFAULT NULL,
  actor_name  VARCHAR(200) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_capre_report (report_id, created_at),
  CONSTRAINT fk_capre_report FOREIGN KEY (report_id) REFERENCES capar_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The vault tags every uploaded file with the record it belongs to; CAPAR photos and evidence are filed under CAPAR.
-- The value is appended after OTHER so MariaDB can extend the ENUM in place without rebuilding the files table.
ALTER TABLE files
  MODIFY entity_type ENUM('EMPLOYER','EMPLOYEE','AUDITOR','AUDIT_ASSIGNMENT','AUDIT_REPORT','SUBMISSION',
                          'PAYSLIP','PAYROLL_RUN','COMPLIANCE_DOCUMENT','WORK_PERMIT','CMS_MEDIA',
                          'STUDY','RISK','ASSESSMENT','USER','OTHER','CAPAR') NOT NULL DEFAULT 'OTHER';

-- Default categories, taken from the Intertek CAPAR layout. Admin can rename, reorder, add or remove them.
INSERT INTO capar_categories (name, sort_order)
SELECT v.name, v.sort_order FROM (
  SELECT 'Business Practices' AS name, 10 AS sort_order UNION ALL
  SELECT 'Recruitment & Hiring', 20 UNION ALL
  SELECT 'Compensation', 30 UNION ALL
  SELECT 'Worker Involvement & Communication', 40 UNION ALL
  SELECT 'Emergency Planning & Fire Safety', 50 UNION ALL
  SELECT 'Chemical Management', 60 UNION ALL
  SELECT 'Energy Use & GHG Emissions', 70 UNION ALL
  SELECT 'Water Use', 80 UNION ALL
  SELECT 'Waste Water / Effluent', 90 UNION ALL
  SELECT 'Others', 100
) v
WHERE NOT EXISTS (SELECT 1 FROM capar_categories);
