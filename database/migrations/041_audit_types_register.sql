-- 041 - Act & Compliance by audit type (client's "Act, Rules, Regulation, Notification" sheet).
-- The audit types the firm offers; for each one the administrator types the Acts with their Chapter, Section, Sub Section, Amendments and
-- Explain, and keeps the Legal Compliance Register of Forms, Returns and Statements / Declarations as Word files. Auditors read all of it.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS audit_types (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_audit_type_name (name),
  KEY idx_audit_type_order (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_type_rows (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  audit_type_id BIGINT UNSIGNED NOT NULL,
  act_id        BIGINT UNSIGNED NULL,
  act_name      VARCHAR(255) NULL,
  chapter       VARCHAR(255) NULL,
  section       VARCHAR(255) NULL,
  sub_section   VARCHAR(255) NULL,
  amendments    TEXT NULL,
  explain_text  TEXT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  created_by    BIGINT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_atr_type (audit_type_id, sort_order),
  CONSTRAINT fk_atr_type FOREIGN KEY (audit_type_id) REFERENCES audit_types (id) ON DELETE CASCADE,
  CONSTRAINT fk_atr_act FOREIGN KEY (act_id) REFERENCES compliance_acts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_type_row_docs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  row_id     BIGINT UNSIGNED NOT NULL,
  kind       ENUM('Forms','Returns','Statement/Declaration') NOT NULL,
  title      VARCHAR(255) NOT NULL,
  file_id    BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_atrd_row (row_id, kind),
  CONSTRAINT fk_atrd_row FOREIGN KEY (row_id) REFERENCES audit_type_rows (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO audit_types (name, sort_order) VALUES
  ('Labour Law and Statutory Compliance', 10),
  ('Social Security Benefits Statutory Compliance', 20),
  ('Safety Audits (IS 14489:2018)', 30),
  ('Fire Safety Audit - Industrial Fire Safety Systems (Hydrant and Sprinkler Systems installation, Fire Alarm Systems installation)', 40),
  ('Risk Assessment (Safety and Environment)', 50),
  ('HIRA Study', 60),
  ('HAZOP Study', 70),
  ('HACCP Study', 80),
  ('Factory Capacity and Capability Audit', 90),
  ('Environmental Audit and Statement', 100),
  ('ETP Design and Functionality Assessment Audits', 110),
  ('Common and Captive TSDF Audit', 120),
  ('Energy Audit and Water Audit', 130),
  ('Food Safety Audit', 140),
  ('Chemical Safety and MSIHC Compliance Audit', 150),
  ('TNEB and Electrical Safety Compliance Audit', 160),
  ('Competency Third Party EHS Training and Awareness Programmes', 170),
  ('GHG / Carbon Footprint Verification and Evaluation Audit', 180),
  ('International Buyer Compliance (BSCI, SEDEX, FEMA, Oeko Tex, GRS, GOTS, OCS, RCS, WRAP, SLCP, Higg - FEM and FSLM, SA8000, ISO Standards, ZDHC)', 190),
  ('Buyer CoC Compliance', 200),
  ('6S Project', 210);
