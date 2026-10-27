-- 038 - Employer pre-audit document pack ("Factory Profile" checklist in the client's Factory Profile and Legal Register document).
-- The administrator keeps the checklist (sections and items) and decides which sections each auditor receives. An employer records, item by item,
-- whether the document is provided, with reference, validity, notes and files, then submits the pack: each submission is a dated snapshot.
-- An auditor downloads the latest submission before a CAPAR can be started for that employer; each download is recorded.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS evidence_sections (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(200) NOT NULL,
  description VARCHAR(500) NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_evs_order (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evidence_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_id  BIGINT UNSIGNED NOT NULL,
  group_name  VARCHAR(200) NULL,
  name        VARCHAR(500) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  status      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_evi_section (section_id, sort_order),
  CONSTRAINT fk_evi_section FOREIGN KEY (section_id) REFERENCES evidence_sections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employer_evidence (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employer_id  BIGINT UNSIGNED NOT NULL,
  item_id      BIGINT UNSIGNED NOT NULL,
  status       ENUM('Pending','Provided','Not applicable') NOT NULL DEFAULT 'Pending',
  reference_no VARCHAR(150) NULL,
  valid_until  DATE NULL,
  notes        TEXT NULL,
  updated_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_eev (employer_id, item_id),
  KEY idx_eev_item (item_id),
  CONSTRAINT fk_eev_employer FOREIGN KEY (employer_id) REFERENCES employers (id) ON DELETE CASCADE,
  CONSTRAINT fk_eev_item FOREIGN KEY (item_id) REFERENCES evidence_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employer_evidence_files (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evidence_id BIGINT UNSIGNED NOT NULL,
  file_id     BIGINT UNSIGNED NOT NULL,
  created_by  BIGINT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_eevf (evidence_id, file_id),
  KEY idx_eevf_file (file_id),
  CONSTRAINT fk_eevf_evidence FOREIGN KEY (evidence_id) REFERENCES employer_evidence (id) ON DELETE CASCADE,
  CONSTRAINT fk_eevf_file FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evidence_submissions (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employer_id       BIGINT UNSIGNED NOT NULL,
  submitted_by      BIGINT UNSIGNED NULL,
  submitted_by_name VARCHAR(200) NULL,
  submitted_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_items       INT NOT NULL DEFAULT 0,
  provided_items    INT NOT NULL DEFAULT 0,
  na_items          INT NOT NULL DEFAULT 0,
  pending_items     INT NOT NULL DEFAULT 0,
  note              VARCHAR(1000) NULL,
  snapshot          LONGTEXT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_evs_employer (employer_id, submitted_at),
  CONSTRAINT fk_evsub_employer FOREIGN KEY (employer_id) REFERENCES employers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evidence_pack_downloads (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  submission_id BIGINT UNSIGNED NOT NULL,
  auditor_id    BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NULL,
  downloaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_epd_lookup (auditor_id, submission_id),
  CONSTRAINT fk_epd_submission FOREIGN KEY (submission_id) REFERENCES evidence_submissions (id) ON DELETE CASCADE,
  CONSTRAINT fk_epd_auditor FOREIGN KEY (auditor_id) REFERENCES auditors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which checklist sections an auditor receives. The administrator decides; an auditor with no rows receives none.
CREATE TABLE IF NOT EXISTS auditor_evidence_sections (
  auditor_id BIGINT UNSIGNED NOT NULL,
  section_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (auditor_id, section_id),
  KEY idx_aes_section (section_id),
  CONSTRAINT fk_aes_auditor FOREIGN KEY (auditor_id) REFERENCES auditors (id) ON DELETE CASCADE,
  CONSTRAINT fk_aes_section FOREIGN KEY (section_id) REFERENCES evidence_sections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
