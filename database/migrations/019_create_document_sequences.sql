-- 019_create_document_sequences.sql — gap-free human-readable document numbering
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS document_sequences (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sequence_scope VARCHAR(100) NOT NULL COMMENT 'e.g. AUD-2026 or PS-EMR2026-2026',
  last_value     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_docseq_scope (sequence_scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idempotency table for scheduled reminders so a cron re-run never double-sends.
CREATE TABLE IF NOT EXISTS reminder_dispatches (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reminder_key  VARCHAR(255) NOT NULL COMMENT 'e.g. compliance:12:90',
  reminder_type ENUM('COMPLIANCE_EXPIRY','AUDIT_DUE','PAYROLL_PENDING','LEAVE_PENDING','DOCUMENT_EXPIRY','OTHER') NOT NULL,
  entity_type   VARCHAR(50) DEFAULT NULL,
  entity_id     BIGINT UNSIGNED DEFAULT NULL,
  channel       ENUM('in_app','email','sms','whatsapp') NOT NULL,
  recipient     VARCHAR(255) DEFAULT NULL,
  sent_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reminder_key_channel (reminder_key, channel),
  KEY idx_rd_type (reminder_type),
  KEY idx_rd_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
