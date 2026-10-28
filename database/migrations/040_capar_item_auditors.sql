-- 040 - CAPAR Management: the administrator decides which auditors see which checklist rows (documents) in a CAPAR report.
-- A row with no auditor is shown to nobody; the administrator can start from suggestions made from each auditor's type.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS capar_item_auditors (
  item_id    BIGINT UNSIGNED NOT NULL,
  auditor_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, auditor_id),
  KEY idx_cia_auditor (auditor_id),
  CONSTRAINT fk_cia_item FOREIGN KEY (item_id) REFERENCES evidence_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_cia_auditor FOREIGN KEY (auditor_id) REFERENCES auditors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
