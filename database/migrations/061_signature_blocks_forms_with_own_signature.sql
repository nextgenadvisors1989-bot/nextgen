-- 061 - Migration 057 left out every form that already had a signature field of its own (Form 3 and Form 4 end with the occupier's signature). The auditor and the verifier
--       sign those reports too, so they get the same final "Signatures" section. Work permits are left as they are: their own sign-off blocks (receiver, issuer,
--       contractor's safety officer, SEC consultant, site manager) are the signatures the client's permit asks for.
SET NAMES utf8mb4;

INSERT INTO dynamic_form_sections (form_id, title, section_code, description, layout_columns, is_collapsible, is_collapsed, show_in_pdf, page_break_before, sort_order, status)
SELECT f.id, 'Signatures', 'SIGNATURES',
       'Draw the signature with the mouse, a stylus or a finger. The auditor signs when the audit is done; the verifier signs after checking the report.',
       2, 0, 0, 1, 0,
       COALESCE((SELECT MAX(s.sort_order) FROM dynamic_form_sections s WHERE s.form_id = f.id AND s.deleted_at IS NULL), 0) + 1, 'active'
FROM dynamic_forms f
JOIN dynamic_modules m ON m.id = f.module_id
WHERE f.deleted_at IS NULL AND m.deleted_at IS NULL
  AND m.module_type IN ('AUDIT', 'ASSESSMENT', 'RISK', 'STUDY', 'INSPECTION')
  AND NOT EXISTS (SELECT 1 FROM dynamic_form_fields x WHERE x.form_id = f.id AND x.field_key = 'sig_auditor_signature' AND x.deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM dynamic_form_sections y WHERE y.form_id = f.id AND y.section_code = 'SIGNATURES' AND y.deleted_at IS NULL);

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
