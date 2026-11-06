-- 047 - Each Audit and Assessment entry can open a dynamic form. An entry with no form still says "Coming soon".
--   The links below are made only where a published form of the same subject already exists; an administrator can change any of them.
SET NAMES utf8mb4;

ALTER TABLE audit_types
  ADD COLUMN form_id BIGINT UNSIGNED NULL AFTER name,
  ADD CONSTRAINT fk_audit_types_form FOREIGN KEY (form_id) REFERENCES dynamic_forms(id) ON DELETE SET NULL;

UPDATE audit_types t JOIN dynamic_forms f ON f.deleted_at IS NULL AND f.status = 'published'
SET t.form_id = f.id
WHERE t.form_id IS NULL AND (
     (t.name LIKE 'Safety Audits (IS 14489%'       AND f.name = 'Statutory Safety Audit (IS 14489)')
  OR (t.name LIKE 'Fire Safety Audit%'             AND f.name = 'Fire Safety Audit and Risk Assessment')
  OR (t.name = 'HAZOP Study'                       AND f.name = 'HAZOP Worksheet and Risk Assessment')
  OR (t.name = 'HACCP Study'                       AND f.name = 'HACCP Study')
  OR (t.name LIKE 'Factory Capacity%'              AND f.name = 'Factory Audit (Internal and External) Checklist')
  OR (t.name LIKE 'Environmental Audit and Statement%' AND f.name = 'Environmental Compliance Audit')
  OR (t.name LIKE 'ETP Design%'                    AND f.name = 'ETP Functionality Assessment Form')
  OR (t.name LIKE 'Common and Captive TSDF%'       AND f.name = 'TSDF Audit')
  OR (t.name LIKE 'Energy Audit and Water Audit%'  AND f.name = 'Energy Audit')
  OR (t.name = 'Food Safety Audit'                 AND f.name = 'Food Safety Audit')
  OR (t.name LIKE 'GHG / Carbon Footprint%'        AND f.name = 'GHG Inventory Verification')
);
