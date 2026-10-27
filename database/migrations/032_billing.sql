-- 032 - Quotations, GST tax invoices and payment receipts for NextGen's own clients.
--
-- A quotation prices the monthly service lines for a client; once the client accepts it, it is turned into a tax invoice. An invoice is
-- Draft until issued (then its figures are locked), is Part paid / Paid as receipts are recorded against it, and is Cancelled rather than
-- deleted once issued. GST is split CGST + SGST when the supplier and the place of supply are in the same state, IGST otherwise.
SET NAMES utf8mb4;

-- The catalogue the quotation lines are picked from (an administrator edits it; a quotation keeps its own copy of the text and fee).
CREATE TABLE IF NOT EXISTS billing_services (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  scope TEXT NULL,
  frequency VARCHAR(30) NOT NULL DEFAULT 'Monthly',
  default_fee DECIMAL(15,2) NOT NULL DEFAULT 0,
  sac_code VARCHAR(10) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_bs_status (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid VARCHAR(36) NOT NULL,
  quotation_number VARCHAR(50) NOT NULL,
  employer_id BIGINT UNSIGNED NULL,
  client_name VARCHAR(255) NOT NULL,
  client_address VARCHAR(500) NULL,
  client_contact VARCHAR(255) NULL,
  client_profile VARCHAR(500) NULL,
  client_gstin VARCHAR(20) NULL,
  client_state_code VARCHAR(2) NULL,
  subject VARCHAR(300) NULL,
  directive TEXT NULL,
  framework_elements TEXT NULL,
  notes TEXT NULL,
  quote_date DATE NOT NULL,
  valid_until DATE NULL,
  gst_percent DECIMAL(5,2) NOT NULL DEFAULT 18,
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  total DECIMAL(15,2) NOT NULL DEFAULT 0,
  status ENUM('Draft','Sent','Accepted','Rejected','Expired','Invoiced') NOT NULL DEFAULT 'Draft',
  invoice_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quotation_number (quotation_number),
  KEY idx_q_employer (employer_id, status),
  KEY idx_q_status (status, quote_date),
  CONSTRAINT fk_q_employer FOREIGN KEY (employer_id) REFERENCES employers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quotation_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  category VARCHAR(200) NOT NULL,
  scope TEXT NULL,
  frequency VARCHAR(30) NOT NULL DEFAULT 'Monthly',
  sac_code VARCHAR(10) NULL,
  fee DECIMAL(15,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_qi_quotation (quotation_id, sort_order),
  CONSTRAINT fk_qi_quotation FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid VARCHAR(36) NOT NULL,
  invoice_number VARCHAR(50) NOT NULL,
  quotation_id BIGINT UNSIGNED NULL,
  employer_id BIGINT UNSIGNED NULL,
  buyer_name VARCHAR(255) NOT NULL,
  buyer_address VARCHAR(500) NULL,
  buyer_gstin VARCHAR(20) NULL,
  buyer_pan VARCHAR(10) NULL,
  buyer_state_code VARCHAR(2) NULL,
  consignee_name VARCHAR(255) NULL,
  consignee_address VARCHAR(500) NULL,
  invoice_date DATE NOT NULL,
  payment_terms VARCHAR(100) NOT NULL DEFAULT 'Net 30 days',
  due_date DATE NULL,
  place_of_supply VARCHAR(100) NULL,
  supply_type ENUM('Intra-state','Inter-state') NOT NULL DEFAULT 'Intra-state',
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
  cgst_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  sgst_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  igst_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  total DECIMAL(15,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(15,2) NOT NULL DEFAULT 0,
  status ENUM('Draft','Issued','Part paid','Paid','Cancelled') NOT NULL DEFAULT 'Draft',
  notes TEXT NULL,
  issued_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  cancel_reason VARCHAR(300) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoice_number (invoice_number),
  KEY idx_inv_employer (employer_id, status),
  KEY idx_inv_status (status, invoice_date),
  CONSTRAINT fk_inv_employer FOREIGN KEY (employer_id) REFERENCES employers (id) ON DELETE SET NULL,
  CONSTRAINT fk_inv_quotation FOREIGN KEY (quotation_id) REFERENCES quotations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  description VARCHAR(500) NOT NULL,
  sac_code VARCHAR(10) NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
  uom VARCHAR(20) NULL,
  unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  taxable_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  gst_percent DECIMAL(5,2) NOT NULL DEFAULT 18,
  gst_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_ii_invoice (invoice_id, sort_order),
  CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per payment received; its receipt number is the "Payment Acknowledgement / Receipt".
CREATE TABLE IF NOT EXISTS invoice_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  receipt_number VARCHAR(50) NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  mode ENUM('Bank transfer','UPI','Cheque','Cash','Card / online') NOT NULL DEFAULT 'Bank transfer',
  reference VARCHAR(150) NULL,
  remarks VARCHAR(300) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_receipt_number (receipt_number),
  KEY idx_ip_invoice (invoice_id),
  CONSTRAINT fk_ip_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The ten service lines of the client's sample quotation, as the starting catalogue.
INSERT INTO billing_services (name, scope, frequency, default_fee, sac_code, sort_order)
SELECT * FROM (
  SELECT 'Employee Compliance & Labour Law Support' AS name, 'Statutory alignment, registry tracking, working hours audits, employment conditions optimization.' AS scope, 'Monthly' AS frequency, 7000.00 AS default_fee, '998311' AS sac_code, 1 AS sort_order
  UNION ALL SELECT 'Wages & Working Hours Compliance', 'Wage metrics validation, overtime calculations, attendance verification, payslip audits.', 'Monthly', 7000, '998311', 2
  UNION ALL SELECT 'Social Security Frameworks', 'EPF & ESI filing validation, return reviews, statutory bonus and gratuity tracking.', 'Monthly', 6000, '998311', 3
  UNION ALL SELECT 'Industrial Safety & Occupational Health', 'Site risk assessments, comprehensive hazard analyses (HIRA/JSA), PPE compliance.', 'Monthly', 7500, '998311', 4
  UNION ALL SELECT 'Fire & Emergency Safety Protocols', 'Evacuation preparedness diagnostics, response drills evaluation, infrastructure inspections.', 'Monthly', 3500, '998311', 5
  UNION ALL SELECT 'Employee Relations & Grievance Systems', 'Formal dispute risk mitigation frameworks, structured grievance tracking and resolution.', 'Monthly', 5000, '998311', 6
  UNION ALL SELECT 'Social Compliance & Human Rights', 'Ethical employment benchmarking, anti-harassment safeguards, full audit readiness.', 'Monthly', 4000, '998311', 7
  UNION ALL SELECT 'Environment & Sustainability Support', 'Waste stream tracking, statutory environmental filings, ESG metrics benchmarking.', 'Monthly', 4000, '998311', 8
  UNION ALL SELECT 'Employee Training & Toolbox Talks', 'Monthly professional structural safety modules, compliance briefings, worker rights.', 'Monthly', 5000, '998311', 9
  UNION ALL SELECT 'Reporting & Executive Management Review', 'Consolidated risk dashboard reporting, corrective action registers, structural oversight.', 'Monthly', 6000, '998311', 10
) seed WHERE NOT EXISTS (SELECT 1 FROM billing_services);
