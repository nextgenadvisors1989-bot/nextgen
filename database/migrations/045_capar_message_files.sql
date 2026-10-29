-- 045 - CAPAR: files attached to a Reply on a finding (images, documents), from the employer or the auditor.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS capar_message_files (
  message_id BIGINT UNSIGNED NOT NULL,
  file_id    BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (message_id, file_id),
  CONSTRAINT fk_cmf_message FOREIGN KEY (message_id) REFERENCES capar_finding_messages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
