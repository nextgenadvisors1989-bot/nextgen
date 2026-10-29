-- 044 - CAPAR: the employer answers each finding, the auditor approves or declines it, and the report closes when every finding is approved.
--   * capar_findings: the row's answer state (Pending -> Employer Submitted -> Approved, or Declined and answered again), the employer's
--     details and signature, and the auditor's review note.
--   * capar_finding_messages: the Reply thread kept on each row (subject and message, either side).
--   * capar_finding_files.source: whether a file was attached by the auditor or by the employer.
SET NAMES utf8mb4;

ALTER TABLE capar_findings
  ADD COLUMN response_status ENUM('Pending','Employer Submitted','Approved','Declined') NOT NULL DEFAULT 'Pending',
  ADD COLUMN response_text TEXT NULL,
  ADD COLUMN employer_signature_kind ENUM('drawn','typed') NULL,
  ADD COLUMN employer_signature_data MEDIUMTEXT NULL,
  ADD COLUMN employer_signed_by VARCHAR(200) NULL,
  ADD COLUMN employer_signed_at DATETIME NULL,
  ADD COLUMN response_reviewed_by VARCHAR(200) NULL,
  ADD COLUMN response_reviewed_at DATETIME NULL,
  ADD COLUMN response_review_note TEXT NULL,
  ADD KEY idx_capf_response (report_id, response_status);

CREATE TABLE IF NOT EXISTS capar_finding_messages (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id    BIGINT UNSIGNED NOT NULL,
  finding_id   BIGINT UNSIGNED NOT NULL,
  sender_role  ENUM('employer','auditor') NOT NULL,
  sender_id    BIGINT UNSIGNED NULL,
  sender_name  VARCHAR(200) NOT NULL,
  subject      VARCHAR(255) NOT NULL,
  body         TEXT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cfm_finding (finding_id, id),
  KEY idx_cfm_report (report_id),
  CONSTRAINT fk_cfm_finding FOREIGN KEY (finding_id) REFERENCES capar_findings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE capar_finding_files ADD COLUMN source ENUM('auditor','employer') NOT NULL DEFAULT 'auditor';
