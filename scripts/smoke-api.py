#!/usr/bin/env python3
"""API smoke: calls every parameter-free GET endpoint as the role that owns it and reports
anything that answers 5xx (a SQL error, a missing column, an unhandled exception).

Detail routes ([id]) are resolved from live rows so they are exercised too.

Usage:  python scripts/smoke-api.py            (uses SEED_BASE, default http://localhost:3001)
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import BASE, PASSWORDS, Session, db  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LOGINS = {
    "admin": ("demo.admin@complianceos.local", PASSWORDS["admin"]),
    "employer": ("balaji.hr@demo.complianceos.local", PASSWORDS["employer"]),
    "auditor": ("priya.auditor@demo.complianceos.local", PASSWORDS["auditor"]),
    "verifier": ("verifier.test@complianceos.local", PASSWORDS["verifier"]),
    "employee": ("employee.test@complianceos.local", PASSWORDS["employee"]),
}
OWNER = {"admin": "admin", "employer": "employer", "auditor": "auditor", "verifier": "verifier", "employee": "employee"}
SKIP = ("/api/auth/", "/api/health", "/api/public/", "/logout", "/download", "/export", "/jobs/run", "/backups/run", "/test/")

# Detail-route templates -> SQL that yields one valid id to substitute.
IDS = {
    "[employeeId]": "SELECT id FROM employees WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    "[employerId]": "SELECT id FROM employers WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    "[auditorId]": "SELECT id FROM auditors WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    "[assignmentId]": "SELECT id FROM audit_assignments WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    "[reportId]": "SELECT id FROM audit_reports WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    "[submissionId]": "SELECT id FROM dynamic_form_submissions ORDER BY id DESC LIMIT 1",
    "[moduleId]": "SELECT id FROM dynamic_modules WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    "[formId]": "SELECT id FROM dynamic_forms ORDER BY id DESC LIMIT 1",
    "[fileId]": "SELECT id FROM files ORDER BY id DESC LIMIT 1",
    "[runId]": "SELECT id FROM payroll_runs ORDER BY id DESC LIMIT 1",
    "[payslipId]": "SELECT id FROM payslips ORDER BY id DESC LIMIT 1",
    "[userId]": "SELECT id FROM users ORDER BY id DESC LIMIT 1",
    "[roleId]": "SELECT id FROM roles ORDER BY id DESC LIMIT 1",
    "[eventId]": "SELECT id FROM calendar_events ORDER BY id DESC LIMIT 1",
    "[pageId]": "SELECT id FROM cms_pages ORDER BY id DESC LIMIT 1",
    "[resourceId]": "SELECT id FROM cms_resources ORDER BY id DESC LIMIT 1",
    "[mediaId]": "SELECT id FROM cms_media ORDER BY id DESC LIMIT 1",
    "[actId]": "SELECT id FROM compliance_acts ORDER BY id DESC LIMIT 1",
    "[ruleId]": "SELECT id FROM compliance_rules ORDER BY id DESC LIMIT 1",
    "[regulationId]": "SELECT id FROM compliance_regulations ORDER BY id DESC LIMIT 1",
    "[notificationId]": "SELECT id FROM compliance_notifications ORDER BY id DESC LIMIT 1",
    "[documentId]": "SELECT id FROM compliance_documents WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    "[unitId]": "SELECT id FROM company_units ORDER BY id DESC LIMIT 1",
    "[departmentId]": "SELECT id FROM departments ORDER BY id DESC LIMIT 1",
    "[enquiryId]": "SELECT id FROM contact_enquiries ORDER BY id DESC LIMIT 1",
    "[structureId]": "SELECT id FROM salary_structures ORDER BY id DESC LIMIT 1",
    "[errorId]": "SELECT id FROM error_logs ORDER BY id DESC LIMIT 1",
    "[auditorTypeId]": "SELECT id FROM auditor_types ORDER BY id DESC LIMIT 1",
}
_cache = {}


def resolve(template):
    def sub(match):
        key = match.group(0)
        if key not in IDS:
            raise KeyError(key)
        if key not in _cache:
            rows = db(IDS[key])
            _cache[key] = rows[0][0] if rows else None
        if _cache[key] is None:
            raise LookupError(key)
        return _cache[key]
    return re.sub(r"\[[^\]]+\]", sub, template)


sessions = {}
for role, creds in LOGINS.items():
    session = Session(creds)
    ok, detail = session.login()
    print(f"{role:9s} {'signed in' if ok else 'LOGIN FAILED ' + detail}")
    if ok:
        sessions[role] = session

checked = 0
problems = []
unresolved = 0
for route in sorted((ROOT / "app" / "api").rglob("route.ts")):
    text = route.read_text(encoding="utf-8", errors="ignore")
    if not re.search(r"export\s+async\s+function\s+GET\b", text):
        continue
    path = "/api/" + route.parent.relative_to(ROOT / "app" / "api").as_posix()
    if any(token in path for token in SKIP):
        continue
    owner = next((role for prefix, role in (("admin", "admin"), ("employer", "employer"), ("auditor", "auditor"), ("verifier", "verifier"), ("employee", "employee")) if path.startswith(f"/api/{prefix}/")), "admin")
    session = sessions.get(owner)
    if not session:
        continue
    try:
        url = resolve(path)
    except (KeyError, LookupError):
        unresolved += 1
        continue
    print(f"  .. {owner} {url}", flush=True)
    started = __import__("time").time()
    status, payload = session.send("GET", url)
    elapsed = __import__("time").time() - started
    if elapsed > 3:
        print(f"  slow {owner} GET {url} {elapsed:.1f}s", flush=True)
    checked += 1
    if status >= 500:
        message = payload.get("message") if isinstance(payload, dict) else str(payload)[:100]
        problems.append((owner, url, status, message))
        print(f"  x {owner} GET {url} -> {status} {message}")

print(f"\n{checked} endpoints called, {unresolved} detail routes without sample data, {len(problems)} server error(s)")
sys.exit(1 if problems else 0)
