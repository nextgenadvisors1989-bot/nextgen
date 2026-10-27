-- 001_create_users.sql — authentication principals for every panel
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid               VARCHAR(36)  NOT NULL,
  email              VARCHAR(255) NOT NULL,
  username           VARCHAR(100) NOT NULL,
  password_hash      VARCHAR(255) NOT NULL,
  first_name         VARCHAR(100) NOT NULL,
  last_name          VARCHAR(100) NOT NULL,
  mobile             VARCHAR(20)  DEFAULT NULL,
  profile_photo      VARCHAR(500) DEFAULT NULL,
  status             ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  is_first_login     BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at      DATETIME     DEFAULT NULL,
  last_login_ip      VARCHAR(45)  DEFAULT NULL,
  failed_login_count INT          NOT NULL DEFAULT 0,
  locked_until       DATETIME     DEFAULT NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by         BIGINT UNSIGNED DEFAULT NULL,
  updated_by         BIGINT UNSIGNED DEFAULT NULL,
  deleted_at         DATETIME     DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_uuid (uuid),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_status (status),
  KEY idx_users_deleted_at (deleted_at),
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions: server-side session records backing the signed session cookie.
CREATE TABLE IF NOT EXISTS sessions (
  id            CHAR(36)     NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  token_hash    CHAR(64)     NOT NULL,
  ip_address    VARCHAR(45)  DEFAULT NULL,
  user_agent    VARCHAR(500) DEFAULT NULL,
  expires_at    DATETIME     NOT NULL,
  revoked_at    DATETIME     DEFAULT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time password-reset tokens (hashed at rest, single use, 1h expiry).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  token_hash  CHAR(64)     NOT NULL,
  expires_at  DATETIME     NOT NULL,
  used_at     DATETIME     DEFAULT NULL,
  ip_address  VARCHAR(45)  DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prt_token (token_hash),
  KEY idx_prt_user (user_id),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
