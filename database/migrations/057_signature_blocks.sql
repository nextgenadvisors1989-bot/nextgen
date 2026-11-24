-- 057 - Signatures on every audit, assessment, risk, study, inspection and permit form (client's message, 2026-11-24: "everywhere the related dynamic signature field").
--   An audit is done by one or more auditors and verified by one verifier (who may be one of the auditors). Each form that has no signature field yet gets a final section
--   "Signatures": the auditor's name, drawn signature and date, the verifier's name, drawn signature and date, the other members of the audit team, and their signed sheets.
--   Forms that already carry a signature field (the permits from the client's PTW file, CAPAR) are left as they are. The fields are optional, so nothing already filled in is
--   made incomplete, and forms with submissions keep every answer. New forms built from scripts/forms_dsl.py get the same block from signoff().
SET NAMES utf8mb4;

INSERT INTO dynamic_form_sections (form_id, title, section_code, description, layout_columns, is_collapsible, is_collapsed, show_in_pdf, page_break_before, sort_order, status)
SELECT f.id, 'Signatures', 'SIGNATURES',
       'Draw the signature with the mouse, a stylus or a finger. The auditor signs when the audit is done; the verifier signs after checking the report.',
       2, 0, 0, 1, 0,
       COALESCE((SELECT MAX(s.sort_order) FROM dynamic_form_sections s WHERE s.form_id = f.id AND s.deleted_at IS NULL), 0) + 1, 'active'
FROM dynamic_forms f
JOIN dynamic_modules m ON m.id = f.module_id
WHERE f.deleted_at IS NULL AND m.deleted_at IS NULL
  AND m.module_type IN ('AUDIT', 'ASSESSMENT', 'RISK', 'STUDY', 'INSPECTION', 'WORK_PERMIT')
  AND NOT EXISTS (SELECT 1 FROM dynamic_form_fields x WHERE x.form_id = f.id AND x.field_type = 'signature' AND x.deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM dynamic_form_sections y WHERE y.form_id = f.id AND y.section_code = 'SIGNATURES' AND y.deleted_at IS NULL);

-- the fields of those sections (auditor, verifier, team)
INSERT INTO dynamic_form_fields (form_id, section_id, field_key, label, field_type, help_text, is_required, show_in_pdf, column_width, sort_order, status)
SELECT s.form_id, s.id, d.field_key, d.label, d.field_type, d.help_text, 0, 1, d.width, d.sort_order, 'active'
FROM dynamic_form_sections s
JOIN (
  SELECT 'sig_auditor_name' AS field_key, 'Auditor name' AS label, 'text' AS field_type, NULL AS help_text, 6 AS width, 1 AS sort_order
  UNION ALL SELECT 'sig_auditor_date', 'Auditor signed on', 'date', NULL, 6, 2
  UNION ALL SELECT 'sig_auditor_signature', 'Auditor signature', 'signature', NULL, 12, 3
  UNION ALL SELECT 'sig_verifier_name', 'Verifier name', 'text', 'The verifier may be one of the auditors of the team.', 6, 4
  UNION ALL SELECT 'sig_verifier_date', 'Verifier signed on', 'date', NULL, 6, 5
  UNION ALL SELECT 'sig_verifier_signature', 'Verifier signature', 'signature', NULL, 12, 6
  UNION ALL SELECT 'sig_team_members', 'Other members of the audit team (name and designation)', 'textarea', 'One line for each auditor who took part in the audit.', 12, 7
  UNION ALL SELECT 'sig_team_sheets', 'Signed sheets of the other team members', 'multi_file', 'Photograph or scan of the signed sheet, if the team signed on paper.', 12, 8
) d
WHERE s.section_code = 'SIGNATURES' AND s.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM dynamic_form_fields x WHERE x.form_id = s.form_id AND x.field_key = d.field_key);
