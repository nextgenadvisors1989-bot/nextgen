-- 020_audit_report_drafts.sql — the auditor's working copy of a report body
--
-- The document body normally lives only inside `audit_report_versions.snapshot_json`,
-- because a version is a frozen revision (submitted, approved, returned). An auditor
-- filling in a report over several visits needs somewhere to save work in progress
-- without polluting that chain — and, more importantly, without overwriting the
-- decision revision a verifier filed with their corrections.
--
-- `draft_body_json` is that working copy: the auditor workspace autosaves into it,
-- and submitting freezes a copy into a new version with a generated PDF. It is also
-- what the admin report form reads, so both surfaces always see the same document.
SET NAMES utf8mb4;

ALTER TABLE audit_reports
  ADD COLUMN draft_body_json LONGTEXT NULL COMMENT 'Working copy of the report body held by the auditor between saves' AFTER rejection_reason,
  ADD COLUMN draft_saved_at  DATETIME NULL COMMENT 'When the auditor last saved the working copy' AFTER draft_body_json;
