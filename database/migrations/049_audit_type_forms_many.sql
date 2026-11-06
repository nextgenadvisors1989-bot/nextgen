-- 049 - An Audit and Assessment entry can open several forms (for example an ETP assessment is a functionality form and a document list).
--   audit_type_forms holds the links; audit_types.form_id stays as the first form for anything that still reads it.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS audit_type_forms (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  audit_type_id BIGINT UNSIGNED NOT NULL,
  form_id       BIGINT UNSIGNED NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_atf (audit_type_id, form_id),
  KEY idx_atf_form (form_id),
  CONSTRAINT fk_atf_type FOREIGN KEY (audit_type_id) REFERENCES audit_types(id) ON DELETE CASCADE,
  CONSTRAINT fk_atf_form FOREIGN KEY (form_id) REFERENCES dynamic_forms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO audit_type_forms (audit_type_id, form_id, sort_order)
SELECT id, form_id, 0 FROM audit_types WHERE form_id IS NOT NULL AND deleted_at IS NULL;
