-- 002_admin_user.sql — default super administrator.
--
-- SECURITY: the seeded password is "ChangeMe@2026" and is_first_login = TRUE, which
-- forces a password change on first sign-in. IMMEDIATELY after deploying:
--   1. sign in and change the password, or
--   2. run `npm run create:admin` with your own credentials, or
--   3. delete this row once a real administrator exists.
SET NAMES utf8mb4;

DELETE FROM leave_types WHERE employer_id IS NULL;

INSERT INTO users (uuid, email, username, password_hash, first_name, last_name, mobile, status, is_first_login)
SELECT '00000000-0000-4000-8000-000000000001', 'admin@complianceos.local', 'superadmin',
       '$2a$12$OlJd5EsqbdQ7M8ez/tffzu2JUk.iu2K/dQ/lHfYwUiS9lKy/eusoq', 'Super', 'Administrator', '+919000000000', 'active', TRUE
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@complianceos.local');

INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM users u
  JOIN roles r ON r.slug = 'super_admin'
 WHERE u.email = 'admin@complianceos.local';
