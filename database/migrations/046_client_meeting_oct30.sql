-- 046 - Changes from the client meeting of 30 Oct 2026.
--   * Act & Compliance becomes one table of its own, no longer tied to an audit type (audit_type_rows.audit_type_id may be empty), and a
--     Legal Compliance Register record can be typed in by hand (audit_type_row_docs.content) instead of uploaded (file_id may be empty).
--   * "International Buyer Compliance" is one short audit type; its standards are chosen from a list.
--   * A CAPAR finding records the location inside the factory.
--   * An employee has a signature next to the photo.
--   * The company contact details.
SET NAMES utf8mb4;

ALTER TABLE audit_type_rows MODIFY audit_type_id BIGINT UNSIGNED NULL;

ALTER TABLE audit_type_row_docs
  MODIFY file_id BIGINT UNSIGNED NULL,
  ADD COLUMN content MEDIUMTEXT NULL AFTER title,
  ADD COLUMN updated_at DATETIME NULL AFTER created_at;

UPDATE audit_types SET name = 'International Buyer Compliance' WHERE name LIKE 'International Buyer Compliance (%';

ALTER TABLE capar_findings ADD COLUMN location VARCHAR(255) NULL AFTER category_id;

ALTER TABLE employees ADD COLUMN signature VARCHAR(1000) NULL AFTER photo;

INSERT INTO settings (setting_group, setting_key, setting_value) VALUES
  ('company', 'company_name', 'NextGen Socio and Enviro Advisors'),
  ('company', 'company_address', 'No: 3/46, Erumaippatti Village, Naranamangalam Postal, Ramanathapuram District, Tamilnadu, India'),
  ('company', 'company_phone', '+91 94884 65966'),
  ('company', 'company_email', 'info@nextgenseadvisors.com'),
  ('company', 'company_website', 'www.nextgenseadvisors.com'),
  ('email', 'from_email', 'info@nextgenseadvisors.com'),
  ('email', 'from_name', 'NextGen Socio and Enviro Advisors')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
