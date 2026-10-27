-- 018_create_settings.sql — system settings, integration config, scheduled jobs, backups
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_group VARCHAR(100) NOT NULL,
  setting_key   VARCHAR(150) NOT NULL,
  setting_value LONGTEXT,
  value_type    ENUM('string','number','boolean','json','encrypted') NOT NULL DEFAULT 'string',
  label         VARCHAR(255) DEFAULT NULL,
  description   TEXT,
  is_public     BOOLEAN NOT NULL DEFAULT FALSE,
  is_encrypted  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INT NOT NULL DEFAULT 0,
  updated_by    BIGINT UNSIGNED DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settings (setting_group, setting_key),
  KEY idx_settings_group (setting_group),
  CONSTRAINT fk_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_code       VARCHAR(100) NOT NULL,
  job_name       VARCHAR(200) NOT NULL,
  description    TEXT,
  cron_expression VARCHAR(100) DEFAULT NULL,
  job_type       ENUM('REMINDER','REPORT','BACKUP','SYNC','CLEANUP','NOTIFICATION') NOT NULL DEFAULT 'REMINDER',
  last_run_at    DATETIME DEFAULT NULL,
  last_run_status ENUM('success','failed','running','never') NOT NULL DEFAULT 'never',
  last_run_message TEXT,
  next_run_at    DATETIME DEFAULT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sj_code (job_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_history (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  backup_name    VARCHAR(255) NOT NULL,
  backup_type    ENUM('full','schema','data','incremental') NOT NULL DEFAULT 'full',
  file_path      VARCHAR(1000) DEFAULT NULL,
  file_size_bytes BIGINT UNSIGNED DEFAULT NULL,
  tables_included JSON DEFAULT NULL,
  status         ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  error_message  TEXT,
  started_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at   DATETIME DEFAULT NULL,
  duration_seconds INT DEFAULT NULL,
  triggered_by   ENUM('manual','scheduled') NOT NULL DEFAULT 'manual',
  created_by     BIGINT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_bh_status (status),
  KEY idx_bh_started (started_at),
  CONSTRAINT fk_bh_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
