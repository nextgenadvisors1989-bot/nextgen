-- 031 - Employee profile as the client sketched it: where the person is from (State local / Migrant), how they are engaged
-- (Permanent / Temporary / Contract), self check-in and check-out, and short permission requests the employer approves.
SET NAMES utf8mb4;

ALTER TABLE employees
  ADD COLUMN workforce_origin ENUM('State local','Migrant') NULL AFTER category,
  ADD COLUMN employment_type ENUM('Permanent','Temporary','Contract') NULL AFTER workforce_origin;

-- A row the employee punched in themselves is told apart from one typed or imported by the employer. Appended so MariaDB extends the ENUM in place.
ALTER TABLE attendance
  MODIFY COLUMN source ENUM('Manual','Bulk Upload','Biometric','Import','Self') NOT NULL DEFAULT 'Manual';

-- Short permission: leave the workplace for a few hours with the employer's approval. The minutes feed no payroll rule by themselves;
-- the employer decides, and the decision is the record.
CREATE TABLE IF NOT EXISTS employee_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employer_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  permission_date DATE NOT NULL,
  from_time TIME NOT NULL,
  to_time TIME NOT NULL,
  minutes INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  decided_by BIGINT UNSIGNED NULL,
  decided_at DATETIME NULL,
  decision_note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_perm_employer_status (employer_id, status, permission_date),
  KEY idx_perm_employee (employee_id, permission_date),
  CONSTRAINT fk_perm_employer FOREIGN KEY (employer_id) REFERENCES employers (id) ON DELETE CASCADE,
  CONSTRAINT fk_perm_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
