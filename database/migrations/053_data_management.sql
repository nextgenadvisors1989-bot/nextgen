-- 053 - Data Management: the employer's daily industrial data (purchases, stock, production, transport, water, energy, waste, GHG ...).
--   employees.data_entry_enabled   the employer lets this employee enter Data Management records (the login is otherwise read-only on it)
--   dm_entries                     one row per record of any register (PUR-01 ... CMP-01); the fields of the register live in `data` (JSON), the register
--                                  catalogue itself is code (lib/data-management/registers.ts) so every record is checked against the same definition
--   dm_entry_files                 meter photographs, weighbridge slips, invoices attached to a record (stored in the document vault)
--   dm_emission_factors            the administrator's emission-factor register: nothing is pre-filled, a factor exists only when the client enters it
SET NAMES utf8mb4;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS data_entry_enabled TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS dm_entries (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employer_id   BIGINT UNSIGNED NOT NULL,
  register_code VARCHAR(12) NOT NULL,
  entry_date    DATE NOT NULL,
  shift         VARCHAR(10) NULL,
  data          JSON NOT NULL,
  remarks       VARCHAR(500) NULL,
  status        ENUM('entered','verified','rejected') NOT NULL DEFAULT 'entered',
  verified_by   BIGINT UNSIGNED NULL,
  verified_at   DATETIME NULL,
  verify_note   VARCHAR(300) NULL,
  entered_by    BIGINT UNSIGNED NOT NULL,
  updated_by    BIGINT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_dm_entries_register (employer_id, register_code, entry_date),
  KEY idx_dm_entries_date (employer_id, entry_date),
  CONSTRAINT fk_dm_entries_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dm_entry_files (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entry_id   BIGINT UNSIGNED NOT NULL,
  file_id    BIGINT UNSIGNED NOT NULL,
  caption    VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dm_entry_files_entry (entry_id),
  CONSTRAINT fk_dm_entry_files_entry FOREIGN KEY (entry_id) REFERENCES dm_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dm_emission_factors (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ef_code         VARCHAR(40) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  activity_key    VARCHAR(80) NOT NULL,
  scope           TINYINT NOT NULL,
  category        VARCHAR(60) NOT NULL,
  unit            VARCHAR(20) NOT NULL,
  factor_kg_co2e  DECIMAL(18,6) NOT NULL,
  ncv_gj_per_unit DECIMAL(18,8) NULL,
  gases           VARCHAR(100) NULL,
  gwp_basis       VARCHAR(20) NULL,
  geography       VARCHAR(100) NULL,
  source          VARCHAR(255) NOT NULL,
  source_year     SMALLINT NULL,
  version         VARCHAR(30) NULL,
  valid_from      DATE NOT NULL,
  valid_to        DATE NULL,
  data_quality    VARCHAR(40) NULL,
  evidence        VARCHAR(255) NULL,
  status          ENUM('draft','approved','retired') NOT NULL DEFAULT 'draft',
  approved_by     BIGINT UNSIGNED NULL,
  approved_at     DATETIME NULL,
  notes           VARCHAR(500) NULL,
  created_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dm_ef_code (ef_code),
  KEY idx_dm_ef_key (activity_key, status, valid_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
