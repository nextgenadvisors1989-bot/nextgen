#!/usr/bin/env bash
# Sandbox / fresh-host bootstrap.
#
#   bash scripts/bootstrap-sandbox.sh
#
# Brings a bare machine to a working ComplianceOS install:
#   1. MariaDB server + client (installed from apt when missing)
#   2. database + application user from .env
#   3. node dependencies (npm ci)
#   4. migrations + seeds
#   5. panel logins used by the verification scripts
#   6. the build swapfile (a `next build` is SIGKILLed without it)
#
# Safe to re-run: every step is idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

log() { printf '\n== %s\n' "$1"; }
need_root() { sudo -n "$@"; }

# --------------------------------------------------------------------- swap
# Builds need the swapfile: without it `next build` is killed with SIGKILL.
log "Build swap"
bash scripts/enable-swap.sh

# ---------------------------------------------------------------- database
log "MariaDB"
if ! command -v mariadbd > /dev/null 2>&1 && [ ! -x /usr/sbin/mariadbd ]; then
  need_root apt-get update -qq
  need_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mariadb-server mariadb-client
fi

need_root mkdir -p /var/run/mysqld /var/log/mysql
need_root chown -R mysql:mysql /var/run/mysqld /var/log/mysql

if [ ! -d /var/lib/mysql/mysql ]; then
  need_root mariadb-install-db --user=mysql --datadir=/var/lib/mysql > /tmp/mariadb-install.log 2>&1
fi

if ! need_root mysqladmin ping > /dev/null 2>&1; then
  need_root nohup /usr/sbin/mariadbd --user=mysql --datadir=/var/lib/mysql \
    --socket=/var/run/mysqld/mysqld.sock --bind-address=127.0.0.1 --port=3306 > /tmp/mariadb.log 2>&1 &
  for _ in $(seq 1 30); do need_root mysqladmin ping > /dev/null 2>&1 && break; sleep 1; done
fi
need_root mysqladmin status | head -1

log "Database and application user"
# shellcheck disable=SC1091
DB_NAME=$(grep -E '^DB_NAME=' .env | cut -d= -f2- | tr -d '"')
DB_USER=$(grep -E '^DB_USER=' .env | cut -d= -f2- | tr -d '"')
DB_PASSWORD=$(grep -E '^DB_PASSWORD=' .env | cut -d= -f2- | sed 's/^"//; s/"$//')

need_root mysql -e "
  CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
  CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
  GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
  GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
  FLUSH PRIVILEGES;"
mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT DATABASE() AS db, VERSION() AS version;"

# ------------------------------------------------------------- application
log "Dependencies"
[ -d node_modules/next ] || npm ci --no-audit --no-fund

log "Migrations and seeds"
npm run db:migrate --silent | tail -3
npm run db:seed --silent | tail -8

# ---------------------------------------------------------------- logins
log "Panel logins"
# The seeded administrator must change its password on first sign-in; set the
# known development password directly so the verification scripts can sign in.
HASH=$(node -e "process.stdout.write(require('bcryptjs').hashSync('Admin@2026', 12))")
mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  UPDATE users SET password_hash='$HASH', is_first_login=0 WHERE email='admin@complianceos.local';"

for entry in "auditor.test@complianceos.local|Test Auditor|Auditor@2026|auditor" \
             "verifier.test@complianceos.local|Test Verifier|Verifier@2026|verifier" \
             "employer.test@complianceos.local|Test Employer|Employer@2026|employer"; do
  IFS='|' read -r email name password role <<< "$entry"
  npm run create:admin --silent -- --email "$email" --name "$name" --password "$password" --role "$role" > /dev/null
  echo "  $role  $email"
done

# The auditor panel resolves the signed-in user's own auditors row, so the
# seeded auditor login needs one or its pages cannot load an identity.
mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  INSERT INTO auditors (uuid, user_id, auditor_code, name, email, mobile, auditor_type_id, specialization, status, date_of_joining)
  SELECT UUID(), u.id, 'AUD-TEST-0001', 'Test Auditor', u.email, '+919000000001',
         (SELECT id FROM auditor_types ORDER BY id LIMIT 1), 'Manufacturing', 'active', '2026-01-05'
  FROM users u
  WHERE u.email = 'auditor.test@complianceos.local'
    AND NOT EXISTS (SELECT 1 FROM auditors a WHERE a.email = u.email OR a.user_id = u.id);" \
  && echo "  auditor record  auditor.test@complianceos.local" || true

log "Done. Start the app with: npm run build && npm start"
