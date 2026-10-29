-- 043 - CAPAR: an "Others" option beside the six categories. The auditor ticks it, writes in their own words what they are auditing,
-- and records findings by hand (the "Other findings" rows). Reports that already have such rows keep them in the report.
SET NAMES utf8mb4;

ALTER TABLE capar_reports
  ADD COLUMN others_selected TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN others_note VARCHAR(255) NULL;

UPDATE capar_reports r SET others_selected = 1
 WHERE EXISTS (SELECT 1 FROM capar_findings f WHERE f.report_id = r.id AND f.evidence_item_id IS NULL AND f.deleted_at IS NULL);
