-- 048 - The quotation shortcut can also produce a "Billing" statement: the client, the auditor and the price of each service only.
--   doc_type tells the two apart (every existing row is a Quotation); auditor_id is the auditor a Billing statement names.
SET NAMES utf8mb4;

ALTER TABLE quotations
  ADD COLUMN doc_type ENUM('Quotation','Billing') NOT NULL DEFAULT 'Quotation' AFTER quotation_number,
  ADD COLUMN auditor_id BIGINT UNSIGNED NULL AFTER employer_id;
