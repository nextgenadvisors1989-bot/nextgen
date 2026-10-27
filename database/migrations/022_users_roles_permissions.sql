-- 022 — Users & Roles module support.
--
-- Two things the administration screens need that the base schema did not carry:
--
--  1. The Administrator role could read and edit users but not archive them, and
--     could not remove a custom role it had created. The register and the role
--     screens expose both actions, so the capability is granted here (the
--     Super Administrator keeps the wider action set from migration 001).
--
--  2. The register, the role grid and the session column filter on columns that
--     only had single-column indexes. Composite indexes keep the register fast
--     as the table grows.

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name IN ('user.delete', 'user.upload', 'role.delete')
 WHERE r.slug IN ('super_admin', 'admin');

-- The register sorts by name and filters on status/lock/activation together.
CREATE INDEX IF NOT EXISTS idx_users_register ON users (deleted_at, status, is_first_login);
CREATE INDEX IF NOT EXISTS idx_users_locked ON users (locked_until, deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_name ON users (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users (last_login_at);

-- "Who is signed in right now" is answered against revoked_at + expires_at.
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions (revoked_at, expires_at);

-- The role grid and the permission matrix split system from custom roles.
CREATE INDEX IF NOT EXISTS idx_roles_system ON roles (is_system_role, deleted_at);
CREATE INDEX IF NOT EXISTS idx_rp_role ON role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_ur_user ON user_roles (user_id);
