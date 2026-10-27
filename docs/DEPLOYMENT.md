# Deployment guide

How to take this platform from a development box to production. The stack is
deliberately small: **Next.js 15 (App Router) + MariaDB/MySQL + a local
filesystem for uploads** — no Redis, no queues, no external services required
to run (SMTP/SMS/WhatsApp providers are optional and configured from the UI).

---

## 1. What you need

| Requirement | Notes |
|---|---|
| Node.js | 20.x LTS or newer (`node -v`) |
| MariaDB / MySQL | MariaDB 10.11+/11.x or MySQL 8. `utf8mb4` throughout |
| Disk | ~2 GB for the app + room for the upload vault and database dumps |
| Memory | 2 GB works; **on 2 GB machines add swap** (the build peak is ~1.8 GB) |
| TLS | Any terminating proxy: Caddy, nginx, or a cloud load balancer |

## 2. Database

```bash
mysql -u root -p <<'SQL'
CREATE DATABASE compliance_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'compliance_app'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON compliance_platform.* TO 'compliance_app'@'localhost';
FLUSH PRIVILEGES;
SQL
```

Migrations and seeds are plain scripts — no ORM, no drift:

```bash
npm run db:migrate    # applies every numbered migration exactly once each
npm run db:seed       # roles, permissions, settings, checklist items, payroll heads, leave types
npm run create:admin  # first super-administrator login
```

Never edit a migration that has been applied; add a new numbered file instead.

## 3. Environment

`/.env` at the project root (the app reads it with no extra tooling):

```ini
DB_HOST=127.0.0.1
DB_USER=compliance_app
DB_PASSWORD=<strong-password>
DB_NAME=compliance_platform

APP_URL=https://compliance.example.com     # used in emails/links
STORAGE_DRIVER=local                        # uploads live on disk
NEXT_PUBLIC_UPLOAD_MAX_MB=25                # upload ceiling enforced server-side too

# Optional transports — everything also works without them (simulated + logged)
SMTP_HOST= SMTP_PORT=587 SMTP_USER= SMTP_PASSWORD= SMTP_FROM=
TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN= TWILIO_FROM=
MSG91_AUTH_KEY=
META_WHATSAPP_TOKEN= META_WHATSAPP_PHONE_ID=
```

The same credentials can also be edited later from **Admin → Settings →
Integrations** (secrets are encrypted at rest with AES-256-GCM and never
returned by the API).

## 4. Build and run

```bash
npm ci
rm -rf .next

# On a 2 GB box the TypeScript/webpack peak needs swap, or the build is killed:
sudo fallocate -l 3G /swapfile && sudo chmod 600 /swapfile \
  && sudo mkswap /swapfile && sudo swapon /swapfile

NODE_OPTIONS=--max-old-space-size=1200 npm run build   # ~2 min on a 2 vCPU box
npm start                                               # binds 0.0.0.0:3001
```

Run it under a process supervisor. A minimal `systemd` unit:

```ini
[Unit]
Description=ComplianceOS
After=network.target mysql.service

[Service]
WorkingDirectory=/opt/compliance-platform
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

The app only serves what it built — after **every** deploy do
`rm -rf .next && npm run build` and then restart the service; a live
`next start` will happily serve the previous build otherwise.

## 5. TLS

Terminate TLS in front of port 3000 and forward plain HTTP to the app. Caddy
needs one line:

```
compliance.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

Then set `APP_URL` to the `https://` address so activation and reset links
point at the right origin.

## 6. Scheduled jobs

Two runners cover the platform's timing needs; schedule them with cron:

```cron
# Compliance + payroll + calendar reminders, once an hour
0 * * * * cd /opt/compliance-platform && npm run send:reminders >> /var/log/complianceos-reminders.log 2>&1

# Nightly database dump + upload-vault copy, 02:30
30 2 * * * cd /opt/compliance-platform && npm run backup:db >> /var/log/complianceos-backups.log 2>&1
```

* Reminders are dispatch-guarded (one send per recipient per period) and idempotent.
* `backup:db` runs a real `mysldump`, records each run (size, duration, table
  list), verifies the dump on disk and prunes past retention — visible under
  **Admin → Settings → Backups**, which also has a manual "run now".

## 7. Verification after deploy

The acceptance suites double as a smoke test against any environment:

```bash
npm run verify:payroll       # 258 checks — engine, registers, payslips, lifecycle
npm run verify:selfservice   # 169 checks — employer + employee panels end to end
npm run verify:reports       #  70 checks — audit reports + analytics
npm run verify:calendar      # 163 checks — events, holidays, reminders
python3 scripts/smoke-panels.py   # every sidebar destination in all five panels
```

Reference performance (2 vCPU / 2 GB): pages 40–70 ms, list APIs ~20 ms,
the largest statutory register renders in under 100 ms.

## 8. Rollback

There is no data migration on the way down only if you keep the dump: restore
the previous `mysldump`, check out the previous release, rebuild and restart.
Uploaded files live outside the database in the vault directory — include it in
every backup copy (the backup job already does).
