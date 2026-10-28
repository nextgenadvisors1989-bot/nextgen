-- 039 - CAPAR rows follow the document checklist (client's "CAPAR - Corrective Action and Preventive Action Report" sheet).
-- A report is laid out as the checklist sections (Wages and Benefits, Health & Safety ...) with one row per document (Leave Records ...).
-- A finding may therefore belong to a checklist item; findings typed in freely (no item) keep working under the old categories.
SET NAMES utf8mb4;

ALTER TABLE capar_findings
  ADD COLUMN evidence_item_id BIGINT UNSIGNED NULL AFTER category_id,
  ADD UNIQUE KEY uq_capf_report_item (report_id, evidence_item_id),
  ADD CONSTRAINT fk_capf_evidence_item FOREIGN KEY (evidence_item_id) REFERENCES evidence_items (id) ON DELETE SET NULL;
