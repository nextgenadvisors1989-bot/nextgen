-- 037 - CAPAR item pro-form (client's "Act and CAPAR" document).
-- Each CAPAR row gets: a working status (Incomplete / Not findings / Verified), a link to the Act provision it was picked from, the
-- Compliance statement, Recommendations, the auditor's Verification / Assessment, and the auditor's sign-off on the row.
-- The verifier's Eligible / Not Eligible stays as it is: it is the reviewer's decision, separate from the auditor's item status.
SET NAMES utf8mb4;

ALTER TABLE capar_findings
  ADD COLUMN item_status ENUM('Incomplete','Not findings','Verified') NOT NULL DEFAULT 'Incomplete' AFTER outcome,
  ADD COLUMN provision_id BIGINT UNSIGNED NULL AFTER act_id,
  ADD COLUMN compliance_note TEXT NULL AFTER action_status,
  ADD COLUMN recommendation TEXT NULL AFTER compliance_note,
  ADD COLUMN assessment TEXT NULL AFTER recommendation,
  ADD COLUMN signed_by VARCHAR(200) NULL AFTER assessment,
  ADD COLUMN signed_at DATETIME NULL AFTER signed_by,
  ADD KEY idx_capf_item_status (report_id, item_status),
  ADD CONSTRAINT fk_capf_provision FOREIGN KEY (provision_id) REFERENCES act_provisions (id) ON DELETE SET NULL;

-- Rows recorded before this change: a row with no violation is "Not findings"; a violation the verifier has accepted is "Verified".
UPDATE capar_findings SET item_status = 'Not findings' WHERE outcome = 'No Violation';
UPDATE capar_findings SET item_status = 'Verified' WHERE outcome = 'Violation' AND verification_status = 'Eligible';
