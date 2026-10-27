-- 027 — Auditor type ↔ dynamic module mapping.
--
-- Each auditor type (Water, Environment, Energy & GHG, Safety …) has its own set of audit forms.
-- An auditor sees only the modules mapped to their auditor type (plus any module assigned to them
-- by name), so a water auditor never opens a safety checklist.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS auditor_type_modules (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  auditor_type_id  BIGINT UNSIGNED NOT NULL,
  module_id        BIGINT UNSIGNED NOT NULL,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by       BIGINT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_atm (auditor_type_id, module_id),
  KEY idx_atm_module (module_id),
  CONSTRAINT fk_atm_type FOREIGN KEY (auditor_type_id) REFERENCES auditor_types(id) ON DELETE CASCADE,
  CONSTRAINT fk_atm_module FOREIGN KEY (module_id) REFERENCES dynamic_modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
