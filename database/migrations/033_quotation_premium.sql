-- 033 - The premium quotation (client's design): who the quotation is for in structured form (contact designation, employee strength,
-- number of shifts, industry), the service period, and its own payment terms. The notes and the included-elements list already exist.
SET NAMES utf8mb4;

ALTER TABLE quotations
  ADD COLUMN contact_designation VARCHAR(150) NULL AFTER client_contact,
  ADD COLUMN employee_strength INT NULL AFTER client_profile,
  ADD COLUMN shifts INT NULL AFTER employee_strength,
  ADD COLUMN industry VARCHAR(150) NULL AFTER shifts,
  ADD COLUMN service_period VARCHAR(60) NOT NULL DEFAULT 'Monthly / Renewable' AFTER valid_until,
  ADD COLUMN payment_terms TEXT NULL AFTER notes;
