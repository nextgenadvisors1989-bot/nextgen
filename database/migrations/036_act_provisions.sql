-- 036 - Act library hierarchy: Act > Chapter > Section > Sub Section, each with its Explain text and any Amendments.
-- Follows the client's "Act, Rules, Regulation, Notification" structure so an auditor can search a requirement and pick it for a CAPAR finding.
-- The Act itself stays in compliance_acts; this adds the provisions under it.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS act_provisions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  act_id      BIGINT UNSIGNED NOT NULL,
  parent_id   BIGINT UNSIGNED NULL,
  kind        ENUM('Chapter','Section','Sub Section') NOT NULL,
  number      VARCHAR(40) NULL,
  title       VARCHAR(500) NOT NULL,
  explanation LONGTEXT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  status      ENUM('active','repealed','omitted') NOT NULL DEFAULT 'active',
  created_by  BIGINT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_ap_act (act_id, parent_id, sort_order),
  KEY idx_ap_parent (parent_id),
  FULLTEXT KEY ft_ap_text (title, explanation),
  CONSTRAINT fk_ap_act FOREIGN KEY (act_id) REFERENCES compliance_acts (id) ON DELETE CASCADE,
  CONSTRAINT fk_ap_parent FOREIGN KEY (parent_id) REFERENCES act_provisions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS act_provision_amendments (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provision_id BIGINT UNSIGNED NOT NULL,
  amended_on   DATE NULL,
  reference    VARCHAR(255) NULL,
  description  TEXT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_apa_provision (provision_id, sort_order),
  CONSTRAINT fk_apa_provision FOREIGN KEY (provision_id) REFERENCES act_provisions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
