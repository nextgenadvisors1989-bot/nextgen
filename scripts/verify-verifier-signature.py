"""The verifier signs the report while approving it, end to end through the API.

    python scripts/verify-verifier-signature.py      (server on http://127.0.0.1:3001 with the demo data seeded, migrations 057 and 061 applied)

An auditor fills and submits a report, signs it; the verifier approves and draws a signature in the same step. The report then carries the verifier's drawn signature, name and
date; the PDF prints both pictures; a signature that is not the verifier's own, or not on this report, is refused; an auditor who is also a verifier reviews a colleague's
report but never their own. Test rows are removed at the end. Exit code 1 if any check fails."""
import base64
import re
import struct
import sys
import zlib

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db  # noqa: E402

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  ok  " if condition else "  FAIL") + f" {name}" + (f"  -> {detail}" if not condition and detail else ""))


def png(seed):
    width, height = 120, 40
    rows = []
    for y in range(height):
        row = b"\x00"
        for x in range(width):
            row += bytes((20, 30, 90)) if abs(y - (20 + 10 * ((x // 10 + seed) % 3 - 1))) < 2 else b"\xff\xff\xff"
        rows.append(row)
    def chunk(kind, payload):
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b"")


def login(email, role):
    session = Session((email, PASSWORDS[role]))
    ok, detail = session.login()
    if not ok:
        sys.exit(f"cannot sign in as {email}: {detail}")
    return session


def data(body):
    return body.get("data", body) if isinstance(body, dict) else {}


admin = login("demo.admin@complianceos.local", "admin")
auditor = login("priya.auditor@demo.complianceos.local", "auditor")
verifier = login("verifier.test@complianceos.local", "verifier")
other_verifier = login("senior.verifier@demo.complianceos.local", "verifier")
TITLE = "ZZ TEST SIG report"
db(f"DELETE FROM dynamic_form_submissions WHERE title LIKE '{TITLE}%'")

form = db("SELECT f.id FROM dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id WHERE m.name = 'General Audit and Assessment Report' AND f.deleted_at IS NULL ORDER BY f.id LIMIT 1")
check("the report form exists and has the verifier's signature field",
      bool(form) and int(db(f"SELECT COUNT(*) FROM dynamic_form_fields WHERE form_id = {form[0][0]} AND field_key = 'sig_verifier_signature' AND deleted_at IS NULL")[0][0]) == 1, form)
form_id = int(form[0][0])


def make_report(title):
    status, body = auditor.send("POST", "/api/auditor/submissions", {"form_id": form_id, "title": title})
    sid = int(data(body)["submissionId"])
    ink = auditor.upload("auditor.png", png(1), "SUBMISSION", sid, "signature", "image/png")
    values = {"facility_unit_name": "ZZ TEST plant", "audit_date": "2026-11-20", "declaration": True, "sig_auditor_signature": int(ink["id"]), "sig_auditor_name": "ZZ Auditor"}
    saved = auditor.send("PUT", f"/api/auditor/submissions/{sid}", {"values": values, "table_rows": {"findings": [{"area": "ZZ area", "observation": "ZZ observation", "rating": "compliant", "recommendation": "ZZ", "status": "open"}]}})
    check("the auditor saves the report with the auditor's signature", saved[0] == 200, saved)
    submitted = auditor.send("POST", f"/api/auditor/submissions/{sid}/submit", {"send_to_reviewer": True})
    check("the auditor submits it", submitted[0] in (200, 201), submitted)
    return sid


def values_of(sid):
    return {r[0]: (None if r[1] == "NULL" else r[1]) for r in db(f"SELECT field_key, COALESCE(CAST(file_id AS CHAR), value_text) FROM dynamic_form_submission_values WHERE submission_id = {sid}")}


print("== the verifier signs while approving")
sid = make_report(TITLE)
check("before the review the verifier's signature is empty", not values_of(sid).get("sig_verifier_signature"))
foreign = auditor.upload("not-yours.png", png(2), "SUBMISSION", sid, "signature", "image/png")
status, body = verifier.send("PUT", f"/api/verifier/submissions/{sid}", {"action": "approve", "comments": "Checked against the records.", "signature_file_id": int(foreign["id"])})
check("a signature file drawn by somebody else is refused", status >= 400, (status, body))
check("the report is still waiting after that", db(f"SELECT status FROM dynamic_form_submissions WHERE id = {sid}")[0][0] in ("submitted", "under_review"))
ink = verifier.upload("verifier.png", png(3), "SUBMISSION", sid, "signature", "image/png")
status, body = verifier.send("PUT", f"/api/verifier/submissions/{sid}", {"action": "approve", "comments": "Checked against the records and signed.", "signature_file_id": int(ink["id"])})
check("the verifier approves with the drawn signature", status == 200, (status, body))
stored = values_of(sid)
check("the verifier's signature is in the report", stored.get("sig_verifier_signature") == str(ink["id"]), stored.get("sig_verifier_signature"))
check("the verifier's name and the date are written with it", bool(stored.get("sig_verifier_name")) and bool(re.match(r"\d{4}-\d{2}-\d{2}", str(stored.get("sig_verifier_date")))), (stored.get("sig_verifier_name"), stored.get("sig_verifier_date")))
check("the auditor's own answers are untouched", stored.get("sig_auditor_name") == "ZZ Auditor" and stored.get("facility_unit_name") == "ZZ TEST plant", stored)
status, pdf = admin.send("GET", f"/api/pdf/submission/{sid}", raw=True)
images = len(re.findall(rb"/Subtype\s*/Image", pdf)) if status == 200 else 0
check("the PDF prints both drawn signatures", status == 200 and pdf[:4] == b"%PDF" and images >= 2, (status, images))

print("== approving without a signature still works (an older form, or a verifier who has nothing to draw)")
sid2 = make_report(TITLE + " b")
status, body = other_verifier.send("PUT", f"/api/verifier/submissions/{sid2}", {"action": "approve", "comments": "Checked, no signature drawn."})
check("approval without a signature is accepted by the server", status == 200, (status, body))
check("and the verifier's signature stays empty", not values_of(sid2).get("sig_verifier_signature"))

print("== an auditor who is also a verifier never verifies their own report")
dual_id = db("SELECT id FROM users WHERE email = 'priya.auditor@demo.complianceos.local'")[0][0]
role = db("SELECT id FROM roles WHERE slug = 'verifier'")[0][0]
had = db(f"SELECT COUNT(*) FROM user_roles WHERE user_id = {dual_id} AND role_id = {role}")[0][0] != "0"
sid3 = make_report(TITLE + " c")
try:
    if not had:
        db(f"INSERT INTO user_roles (user_id, role_id) VALUES ({dual_id}, {role})")
    dual = login("priya.auditor@demo.complianceos.local", "auditor")
    status, body = dual.send("PUT", f"/api/verifier/submissions/{sid3}", {"action": "approve", "comments": "I approve my own report."})
    check("the same person cannot approve their own report", status == 403, (status, body))
finally:
    if not had:
        db(f"DELETE FROM user_roles WHERE user_id = {dual_id} AND role_id = {role}")

db(f"DELETE FROM dynamic_form_submissions WHERE title LIKE '{TITLE}%'")
print(f"\nRESULT {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILURES:")
    for item in FAIL:
        print("  -", item)
    sys.exit(1)
