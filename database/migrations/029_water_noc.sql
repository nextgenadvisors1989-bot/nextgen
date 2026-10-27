-- 029 — Groundwater NOC, its conditions and the water meter log.
--
-- A groundwater NOC is the permission a company holds to draw a stated quantity of water a day (for example 100,000 litres
-- a day, domestic use only) on conditions such as "install a flow meter", "submit monthly drawal statements" and "renew every
-- three years". The Water auditor records the NOC, ticks each condition on a visit and keeps the meter readings, and the
-- system turns the readings into litres drawn per day against the approved quantity.
--
-- Every NOC also lives in the legal register (compliance_documents, type Approval) so its expiry is reminded like any other.
SET NAMES utf8mb4;

-- The sketch of the legal register lists Forms, Returns and Approval documents; "Form" was the missing type.
-- Appended after Other so MariaDB extends the ENUM in place.
ALTER TABLE compliance_documents
  MODIFY document_type ENUM('Licence','Certificate','Permit','Registration','Return','Approval','Agreement','Insurance','Other','Form')
  NOT NULL DEFAULT 'Licence';

CREATE TABLE IF NOT EXISTS water_nocs (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid                    VARCHAR(36) NOT NULL,
  noc_number              VARCHAR(150) NOT NULL,
  title                   VARCHAR(255) NOT NULL,
  employer_id             BIGINT UNSIGNED NOT NULL,
  unit_id                 BIGINT UNSIGNED DEFAULT NULL,
  document_id             BIGINT UNSIGNED DEFAULT NULL,
  issuing_authority       VARCHAR(255) DEFAULT NULL,
  applied_on              DATE DEFAULT NULL,
  issue_date              DATE DEFAULT NULL,
  expiry_date             DATE DEFAULT NULL,
  renewal_cycle_years     INT NOT NULL DEFAULT 3,
  purpose                 VARCHAR(255) NOT NULL DEFAULT 'Domestic',
  approved_quantity_lpd   DECIMAL(14,2) NOT NULL,
  purpose_domestic_lpd    DECIMAL(14,2) DEFAULT NULL,
  purpose_gardening_lpd   DECIMAL(14,2) DEFAULT NULL,
  purpose_other_lpd       DECIMAL(14,2) DEFAULT NULL,
  well_type               VARCHAR(100) DEFAULT NULL,
  well_depth_m            DECIMAL(8,2) DEFAULT NULL,
  well_diameter_in        DECIMAL(8,2) DEFAULT NULL,
  pump_hp                 DECIMAL(8,2) DEFAULT NULL,
  pumping_hours_per_day   DECIMAL(5,2) DEFAULT NULL,
  abstraction_structures  INT DEFAULT NULL,
  status                  ENUM('Applied','Valid','Expiring Soon','Expired','Cancelled') NOT NULL DEFAULT 'Valid',
  file_id                 BIGINT UNSIGNED DEFAULT NULL,
  notes                   TEXT,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by              BIGINT UNSIGNED DEFAULT NULL,
  updated_by              BIGINT UNSIGNED DEFAULT NULL,
  deleted_at              DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_noc_uuid (uuid),
  KEY idx_noc_employer (employer_id),
  KEY idx_noc_expiry (expiry_date),
  KEY idx_noc_status (status),
  CONSTRAINT fk_noc_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE CASCADE,
  CONSTRAINT fk_noc_unit FOREIGN KEY (unit_id) REFERENCES company_units(id) ON DELETE SET NULL,
  CONSTRAINT fk_noc_document FOREIGN KEY (document_id) REFERENCES compliance_documents(id) ON DELETE SET NULL,
  CONSTRAINT fk_noc_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS water_noc_conditions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  noc_id          BIGINT UNSIGNED NOT NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  clause_no       VARCHAR(20) DEFAULT NULL,
  condition_text  TEXT NOT NULL,
  compliance      ENUM('Not Checked','Compliant','Non-Compliant','Not Applicable') NOT NULL DEFAULT 'Not Checked',
  remarks         TEXT,
  checked_by      BIGINT UNSIGNED DEFAULT NULL,
  checked_at      DATETIME DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_nocc_noc (noc_id, sort_order),
  CONSTRAINT fk_nocc_noc FOREIGN KEY (noc_id) REFERENCES water_nocs(id) ON DELETE CASCADE,
  CONSTRAINT fk_nocc_checked_by FOREIGN KEY (checked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS water_meters (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employer_id   BIGINT UNSIGNED NOT NULL,
  unit_id       BIGINT UNSIGNED DEFAULT NULL,
  noc_id        BIGINT UNSIGNED DEFAULT NULL,
  name          VARCHAR(150) NOT NULL,
  source        ENUM('Borewell','Municipal','RO Feed','Canteen','Toilet','Guest House','Hydrant','Gardening','Boiler','Laboratory','Other') NOT NULL DEFAULT 'Borewell',
  reading_unit  ENUM('KL','L') NOT NULL DEFAULT 'KL',
  counts_toward_noc BOOLEAN NOT NULL DEFAULT FALSE,
  status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  notes         VARCHAR(500) DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by    BIGINT UNSIGNED DEFAULT NULL,
  deleted_at    DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_wm_employer (employer_id),
  KEY idx_wm_noc (noc_id),
  CONSTRAINT fk_wm_employer FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE CASCADE,
  CONSTRAINT fk_wm_unit FOREIGN KEY (unit_id) REFERENCES company_units(id) ON DELETE SET NULL,
  CONSTRAINT fk_wm_noc FOREIGN KEY (noc_id) REFERENCES water_nocs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS water_meter_readings (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meter_id       BIGINT UNSIGNED NOT NULL,
  reading_date   DATE NOT NULL,
  reading_value  DECIMAL(16,2) NOT NULL,
  is_reset       BOOLEAN NOT NULL DEFAULT FALSE,
  remarks        VARCHAR(500) DEFAULT NULL,
  entered_by     BIGINT UNSIGNED DEFAULT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wmr_day (meter_id, reading_date),
  CONSTRAINT fk_wmr_meter FOREIGN KEY (meter_id) REFERENCES water_meters(id) ON DELETE CASCADE,
  CONSTRAINT fk_wmr_user FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Files that belong to a NOC (the NOC letter, the application) are filed under it.
ALTER TABLE files
  MODIFY entity_type ENUM('EMPLOYER','EMPLOYEE','AUDITOR','AUDIT_ASSIGNMENT','AUDIT_REPORT','SUBMISSION',
                          'PAYSLIP','PAYROLL_RUN','COMPLIANCE_DOCUMENT','WORK_PERMIT','CMS_MEDIA',
                          'STUDY','RISK','ASSESSMENT','USER','OTHER','CAPAR','WATER_NOC') NOT NULL DEFAULT 'OTHER';
