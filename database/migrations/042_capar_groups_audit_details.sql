-- 042 - CAPAR: six common categories, the audit details asked when a report starts, and the auditor's signature on submit.
--   * capar_groups: Governance, Social Security System, Health & Safety, Environmental System, Security System, Work Permit System (PTW).
--     Every checklist document belongs to one of them (evidence_items.capar_group_id); the administrator can move a document.
--   * capar_report_groups: the categories an auditor ticked for a report; only those are reported.
--   * capar_reports: the audit type (Audit and Assessment list), the buyer standards for International Buyer Compliance, the purpose,
--     and the signature drawn or typed when the report is submitted.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS capar_groups (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(150) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status     ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_capar_group_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO capar_groups (name, sort_order) VALUES
  ('Governance', 10), ('Social Security System', 20), ('Health & Safety', 30),
  ('Environmental System', 40), ('Security System', 50), ('Work Permit System (PTW)', 60);

ALTER TABLE evidence_items
  ADD COLUMN capar_group_id BIGINT UNSIGNED NULL AFTER section_id,
  ADD KEY idx_evi_group (capar_group_id),
  ADD CONSTRAINT fk_evi_group FOREIGN KEY (capar_group_id) REFERENCES capar_groups (id) ON DELETE SET NULL;

-- A starting point from the checklist section, then from the wording of the document. Later rules win. The administrator can change any of it.
UPDATE evidence_items i
  JOIN evidence_sections s ON s.id = i.section_id
  JOIN capar_groups g ON g.name = CASE
    WHEN s.name LIKE 'Factory Profile%' OR s.name LIKE 'Management Systems%' THEN 'Governance'
    WHEN s.name LIKE 'Health%' THEN 'Health & Safety'
    ELSE 'Social Security System' END
  SET i.capar_group_id = g.id
  WHERE i.capar_group_id IS NULL;

UPDATE evidence_items i JOIN evidence_sections s ON s.id = i.section_id
  SET i.capar_group_id = (SELECT id FROM capar_groups WHERE name = 'Governance')
  WHERE s.name NOT LIKE 'Health%'
    AND i.name REGEXP 'trade licen|factory licen|incorporation|membership|bond licen|export promotion|policy|policies|hand ?book|organi[sz]ation chart|internal audit|company profile|business registration|tax registration|(^|[^a-z])(erc|irc|tin|vat|epb)([^a-z]|$)';

UPDATE evidence_items
  SET capar_group_id = (SELECT id FROM capar_groups WHERE name = 'Environmental System')
  WHERE name REGEXP 'waste|effluent|emission|chemical|msds|ozone|ghg|greenhouse|pollution|(^|[^a-z])(etp|eia|iee|voc|pcb)([^a-z]|$)|environment|drainage|water (consumption|extraction|test|disposal)|fuel consumption|asbestos|stack|ambient|hazardous|energy|drinking water|cooling tower';

UPDATE evidence_items
  SET capar_group_id = (SELECT id FROM capar_groups WHERE name = 'Security System')
  WHERE name REGEXP 'security|visitor|guard|cctv|surveillance|access control';

UPDATE evidence_items i JOIN evidence_sections s ON s.id = i.section_id
  SET i.capar_group_id = (SELECT id FROM capar_groups WHERE name = 'Work Permit System (PTW)')
  WHERE s.name NOT LIKE 'Recruitment%'
    AND i.name REGEXP 'work permit|hot work|confined space|lock out|loto|permit to work|compressed gas|dangerous operations';

CREATE TABLE IF NOT EXISTS capar_report_groups (
  report_id BIGINT UNSIGNED NOT NULL,
  group_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (report_id, group_id),
  KEY idx_crg_group (group_id),
  CONSTRAINT fk_crg_report FOREIGN KEY (report_id) REFERENCES capar_reports (id) ON DELETE CASCADE,
  CONSTRAINT fk_crg_group FOREIGN KEY (group_id) REFERENCES capar_groups (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reports written before this change keep every category.
INSERT IGNORE INTO capar_report_groups (report_id, group_id) SELECT r.id, g.id FROM capar_reports r CROSS JOIN capar_groups g;

ALTER TABLE capar_reports
  ADD COLUMN audit_type_id BIGINT UNSIGNED NULL AFTER assignment_id,
  ADD COLUMN buyer_standards VARCHAR(500) NULL AFTER audit_type_id,
  ADD COLUMN audit_purpose TEXT NULL AFTER buyer_standards,
  ADD COLUMN signature_kind ENUM('drawn','typed') NULL,
  ADD COLUMN signature_data MEDIUMTEXT NULL,
  ADD COLUMN signed_at DATETIME NULL,
  ADD CONSTRAINT fk_capr_audit_type FOREIGN KEY (audit_type_id) REFERENCES audit_types (id) ON DELETE SET NULL;
