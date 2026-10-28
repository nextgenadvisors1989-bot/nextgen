"""Links an auditor's LOGIN (a user) to the auditor PROFILE, through the app's own API. An auditor whose login is not linked sees no audits.

Run on the server, from the project folder:

    LIVE_ADMIN_EMAIL='admin@company.com' LIVE_ADMIN_PASSWORD='...' AUDITOR_EMAIL='kishoreanand7887@gmail.com' python3 scripts/link-auditor-login.py

AUDITOR_EMAIL is the auditor profile's email. If the login uses a different email, also set LOGIN_EMAIL. SEED_BASE (default
http://127.0.0.1:3001) is the app's address. Safe to run again.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import Session  # noqa: E402


def need(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Set {name} (see the top of this file).")
    return value


admin = Session((need("LIVE_ADMIN_EMAIL"), need("LIVE_ADMIN_PASSWORD")))
ok, detail = admin.login()
if not ok:
    sys.exit(f"Cannot sign in as the administrator: {detail}")

auditor_email = need("AUDITOR_EMAIL").strip().lower()
login_email = os.environ.get("LOGIN_EMAIL", auditor_email).strip().lower()


def rows(body):
    data = body.get("data") if isinstance(body, dict) else None
    return data if isinstance(data, list) else []


status, body = admin.send("GET", f"/api/admin/auditors?search={auditor_email}&limit=20")
auditor = next((a for a in rows(body) if str(a.get("email", "")).lower() == auditor_email), None)
if not auditor:
    sys.exit(f"No auditor profile with the email {auditor_email}")

status, body = admin.send("GET", f"/api/admin/users?search={login_email}&limit=20")
user = next((u for u in rows(body) if str(u.get("email", "")).lower() == login_email), None)
if not user:
    sys.exit(f"No login (user) with the email {login_email}. Create the auditor's portal login first (Auditor > Portal Login).")

print(f"Auditor profile #{auditor['id']} {auditor['name']} currently linked to user #{auditor.get('user_id')}")
print(f"Login #{user['id']} {user['email']}")
if str(auditor.get("user_id")) == str(user["id"]):
    print("Already linked. Nothing to do.")
    sys.exit(0)

status, body = admin.send("POST", f"/api/admin/users/{user['id']}/link", {"auditor_id": int(auditor["id"])})
if status != 200:
    sys.exit(f"Could not link ({status}): {body.get('message') if isinstance(body, dict) else body}")
print(body.get("message", "Linked."))
print("Sign out and sign in again as the auditor.")
