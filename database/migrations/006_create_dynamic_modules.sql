-- 006_create_dynamic_modules.sql — metadata-driven module registry (safety audit, HACCP, …)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS dynamic_modules (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(200) NOT NULL,
  slug                  VARCHAR(200) NOT NULL,
  description           TEXT,
  icon                  VARCHAR(100) DEFAULT NULL,
  category              VARCHAR(100) DEFAULT NULL,
  version               VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  module_type           ENUM('AUDIT','ASSESSMENT','RISK','STUDY','WORK_PERMIT','INSPECTION','CUSTOM') NOT NULL DEFAULT 'CUSTOM',
  default_tat_days      INT DEFAULT NULL,
  requires_verification BOOLEAN NOT NULL DEFAULT TRUE,
  is_public             BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order            INT NOT NULL DEFAULT 0,
  status                ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by            BIGINT UNSIGNED DEFAULT NULL,
  updated_by            BIGINT UNSIGNED DEFAULT NULL,
  deleted_at            DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dm_slug (slug),
  KEY idx_dm_status (status),
  KEY idx_dm_type (module_type),
  CONSTRAINT fk_dm_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_dm_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dynamic_module_role_assignments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module_id   BIGINT UNSIGNED NOT NULL,
  role_id     BIGINT UNSIGNED NOT NULL,
  can_create  BOOLEAN NOT NULL DEFAULT TRUE,
  can_read    BOOLEAN NOT NULL DEFAULT TRUE,
  can_update  BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete  BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve BOOLEAN NOT NULL DEFAULT FALSE,
  granted_by  BIGINT UNSIGNED DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY unique_module_role (module_id, role_id),
  CONSTRAINT fk_dmra_module FOREIGN KEY (module_id) REFERENCES dynamic_modules(id) ON DELETE CASCADE,
  CONSTRAINT fk_dmra_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_dmra_granted_by FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dynamic_module_user_assignments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module_id   BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED DEFAULT NULL,
  auditor_id  BIGINT UNSIGNED DEFAULT NULL,
  assigned_by BIGINT UNSIGNED DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY unique_module_user (module_id, user_id),
  CONSTRAINT fk_dmua_module FOREIGN KEY (module_id) REFERENCES dynamic_modules(id) ON DELETE CASCADE,
  CONSTRAINT fk_dmua_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_dmua_auditor FOREIGN KEY (auditor_id) REFERENCES auditors(id) ON DELETE CASCADE,
  CONSTRAINT fk_dmua_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
