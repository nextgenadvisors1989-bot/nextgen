"""State shared by every seed stage: the signed-in admin session, the demo 'today',
and small lookups. Importing this module signs in once."""
import sys
from datetime import date, timedelta

from seed_lib import PASSWORDS, Session, db, q1, sql_text

TODAY = date(2026, 10, 11)


def iso(offset_days=0):
    return (TODAY + timedelta(days=offset_days)).isoformat()


admin = Session(("demo.admin@complianceos.local", PASSWORDS["admin"]))
_ok, _detail = admin.login()
if not _ok:
    sys.exit(f"cannot sign in as the demo administrator: {_detail}")


def login_as(email, role):
    session = Session((email, PASSWORDS[role]))
    ok, detail = session.login()
    if not ok:
        print(f"  ! cannot sign in as {email}: {detail}")
        return None
    return session


def employers_map():
    """employer_code -> id, including the pre-existing test company."""
    return {code: int(i) for code, i in db("SELECT employer_code, id FROM employers WHERE deleted_at IS NULL")}


def _hash(password):
    """bcrypt hash through the project's own bcryptjs (cost 10 keeps seeding quick)."""
    import subprocess
    out = subprocess.run(["node", "-e", "process.stdout.write(require('bcryptjs').hashSync(process.argv[1], 10))", password],
                         capture_output=True, text=True, cwd=str(__import__("pathlib").Path(__file__).resolve().parent.parent))
    return out.stdout.strip()


_HASHES = {}


def set_passwords():
    """Gives every demo login its documented password and clears the first-login change."""
    if not _HASHES:
        for role in ("employer", "auditor", "employee", "verifier", "admin"):
            _HASHES[role] = _hash(PASSWORDS[role])
    targets = (
        ("employer", "email LIKE '%.hr@demo.complianceos.local' OR email='employer.test@complianceos.local'"),
        ("auditor", "email LIKE '%.auditor@demo.complianceos.local' OR email='auditor.test@complianceos.local'"),
        ("employee", "email LIKE '%@emp.demo.complianceos.local' OR email='employee.test@complianceos.local'"),
        ("verifier", "email IN ('verifier.test@complianceos.local','senior.verifier@demo.complianceos.local')"),
        ("admin", "email IN ('demo.admin@complianceos.local','operations.admin@demo.complianceos.local')"),
    )
    for role, condition in targets:
        db(f"UPDATE users SET password_hash={sql_text(_HASHES[role])}, is_first_login=0, failed_login_count=0, locked_until=NULL WHERE {condition}")


def ensure_pack(auditor, employer_id):
    """An auditor must download the employer's submitted document pack before a CAPAR can be started. Submits one (as the administrator,
    with a handful of documents marked provided) when the company has none, then has this auditor download it."""
    checklist = admin.call("GET", f"/api/evidence/employers/{employer_id}", what="document checklist")
    data = (checklist or {}).get("data")
    if not data:
        return False
    if not data.get("latest"):
        items = [item for section in data["sections"] for item in section["items"]][:6]
        for item in items:
            admin.call("PUT", f"/api/evidence/employers/{employer_id}/items/{item['id']}", {"status": "Provided", "reference_no": "DEMO-" + str(item["id"]), "valid_until": "", "notes": "Demo record"}, what="mark provided")
        admin.call("POST", f"/api/evidence/employers/{employer_id}/submit", {"note": "Demo submission"}, what="submit pack")
        data = admin.call("GET", f"/api/evidence/employers/{employer_id}")["data"]
    latest = data.get("latest")
    if latest and not data.get("downloaded_at"):
        status, _ = auditor.send("GET", f"/api/pdf/evidence-pack/{latest['id']}", raw=True)
        return status == 200
    return True
