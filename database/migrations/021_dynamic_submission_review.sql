-- 021 — Dynamic submission review trail.
--
-- A dynamic-module submission can require verification (`dynamic_modules.requires_verification`).
-- The reviewer's decision needs to survive the next round-trip, so the submission
-- carries its own review stamp and note; the full conversation still lives in
-- `activity_logs` (one row per save/submit/review) and in the generated PDF version.

ALTER TABLE dynamic_form_submissions
  ADD COLUMN reviewed_by BIGINT(20) UNSIGNED NULL AFTER remarks,
  ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by,
  ADD COLUMN review_action ENUM('approved','rejected','returned') NULL AFTER reviewed_at,
  ADD COLUMN review_comments TEXT NULL AFTER review_action,
  ADD COLUMN submitted_at DATETIME NULL AFTER submission_date,
  ADD CONSTRAINT fk_dfs_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_dfs_status ON dynamic_form_submissions (status, deleted_at);
CREATE INDEX idx_dfs_submitted_by ON dynamic_form_submissions (submitted_by, form_id, deleted_at);
CREATE INDEX idx_dfs_reviewer ON dynamic_form_submissions (reviewed_by, review_action);
