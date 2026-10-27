-- 034 - Designation Master: the ~1,000 designations of the client's "Designation Master Structure" (ten industries), with department, skill level,
-- nature of work and the five-line wage mapping (basic, VDA/DA, statutory allowances, overtime, gross). A designation with no employer is the shared master
-- (administrators manage it); a designation with an employer_id is that company's own addition. An employee can point at one.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS designations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employer_id BIGINT UNSIGNED NULL,
  industry_code CHAR(1) NULL,
  industry_name VARCHAR(120) NULL,
  group_name VARCHAR(150) NULL,
  designation_name VARCHAR(200) NOT NULL,
  department VARCHAR(150) NULL,
  skill_level VARCHAR(40) NULL,
  level_inferred TINYINT(1) NOT NULL DEFAULT 0,
  nature_of_work VARCHAR(255) NULL,
  statutory_category VARCHAR(80) NULL,
  wage_basic DECIMAL(12,2) NULL,
  wage_da DECIMAL(12,2) NULL,
  wage_allowance DECIMAL(12,2) NULL,
  wage_ot DECIMAL(12,2) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_des_scope (employer_id, status),
  KEY idx_des_industry (industry_code, designation_name),
  KEY idx_des_name (designation_name),
  KEY idx_des_level (skill_level),
  CONSTRAINT fk_des_employer FOREIGN KEY (employer_id) REFERENCES employers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE employees
  ADD COLUMN designation_id BIGINT UNSIGNED NULL AFTER designation,
  ADD KEY idx_emp_designation_id (designation_id),
  ADD CONSTRAINT fk_emp_designation FOREIGN KEY (designation_id) REFERENCES designations (id) ON DELETE SET NULL;
