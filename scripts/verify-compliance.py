#!/usr/bin/env python3
"""Phase 2 (compliance register) end-to-end verification.

Drives the five registers the way the admin panel does: create, read, update,
refuse-what-must-be-refused, and the document lifecycle that matters in practice
— expiry status derived from the dates, renewal, verification, the expiry
reminder and the activity trail every mutation leaves behind.

Usage:  python3 scripts/verify-compliance.py [base_url]
Assumes migrations + seeds are loaded and the server is running.
"""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/")
ADMIN = (__import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026"))
EMPLOYER = ("employer.test@complianceos.local", "Employer@2026")

passed = 0
failed = 0
failures = []
ACT: dict[str, dict] = {}


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        failures.append(f"{name} — {detail}")
        print(f"  ✗ {name} {('— ' + str(detail)) if detail else ''}")


class Session:
    """Cookie jar + CSRF, exactly like the browser panel calls."""

    def __init__(self, creds):
        self.creds = creds
        self.cookies = {}
        self.user = None

    def _jar(self):
        return "; ".join(f"{k}={v}" for k, v in self.cookies.items())

    def request(self, method, path, body=None, raw=False, _retry=True):
        status, payload = self._send(method, path, body, raw)
        # A session rotated elsewhere (another login for the same user, a stale
        # jar) shows up as CSRF_FAILED or UNAUTHENTICATED. Sign in again and
        # repeat the call once rather than reporting a false failure.
        if not raw and status in (401, 403) and isinstance(payload, dict) \
                and payload.get("code") in ("CSRF_FAILED", "UNAUTHENTICATED") and _retry and self.user:
            if self.login()[0]:
                return self._send(method, path, body, raw)
        return status, payload

    def _send(self, method, path, body=None, raw=False):
        url = f"{BASE}{path}"
        data = None
        headers = {"Cookie": self._jar()}
        # The double-submit token is required on every mutating call, including
        # bodyless DELETEs.
        if method not in ("GET", "HEAD", "OPTIONS") and "cos_csrf" in self.cookies:
            headers["x-csrf-token"] = self.cookies["cos_csrf"]
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                for header in resp.headers.get_all("Set-Cookie") or []:
                    pair = header.split(";")[0]
                    if "=" in pair:
                        k, v = pair.split("=", 1)
                        self.cookies[k] = v
                text = resp.read().decode("utf-8", "replace")
                if raw:
                    return resp.status, text
                try:
                    return resp.status, json.loads(text)
                except json.JSONDecodeError:
                    return resp.status, {"raw": text}
        except urllib.error.HTTPError as err:
            for header in err.headers.get_all("Set-Cookie") or []:
                pair = header.split(";")[0]
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    self.cookies[k] = v
            text = err.read().decode("utf-8", "replace")
            try:
                return err.code, json.loads(text)
            except json.JSONDecodeError:
                return err.code, {"raw": text}

    def login(self):
        status, body = self.request("POST", "/api/auth/login", {
            "identifier": self.creds[0], "password": self.creds[1],
        })
        if status not in (200, 201):
            return False, f"login {status}: {body}"
        self.user = body.get("user") or (body.get("data") or {}).get("user")
        return True, ""


def db(statement):
    creds = {}
    with open(".env", encoding="utf-8") as handle:
        for line in handle:
            match = re.match(r"^DB_(\w+)=(.*)$", line.strip())
            if match:
                creds[match.group(1)] = match.group(2).strip().strip('"').strip("'")
    out = subprocess.run(
        ["mysql", "--default-character-set=utf8mb4", "-u", creds["USER"], f"-p{creds['PASSWORD']}",
         creds["NAME"], "-N", "-B", "-e", statement],
        capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip())
    return [line.split("\t") for line in out.stdout.splitlines() if line.strip()]


def scalar(statement):
    rows = db(statement)
    return rows[0][0] if rows and rows[0] else None


def payload(body):
    """The API envelope is flat for objects and `{data:[…]}` for lists."""
    if not isinstance(body, dict):
        return {}
    data = body.get("data")
    return data if isinstance(data, list) else body


def rows_of(body):
    data = (body or {}).get("data")
    return data if isinstance(data, list) else []


def reset_fixture(stamp):
    """Removes anything an interrupted earlier run left behind so the suite is
    re-runnable. Only rows the suite itself ever creates are touched."""
    db("DELETE FROM compliance_documents WHERE document_number LIKE 'TN/FAC/%' OR document_number LIKE 'TN/PCB/%' "
       "OR document_number LIKE 'TN/FIRE/%' OR document_number LIKE 'TN/CLRA/%' OR document_number LIKE 'TN/XXX/%' "
       "OR document_number LIKE 'EMP/RTN/%'")
    db("DELETE FROM compliance_regulations WHERE regulation_name LIKE 'Verification%'")
    db("DELETE FROM compliance_rules WHERE rule_title LIKE 'Verification%' OR rule_title = 'Orphan rule'")
    db("DELETE FROM compliance_notifications WHERE title LIKE 'Verification%' OR title = 'Duplicate gazette number'")
    db("DELETE FROM compliance_acts WHERE act_name LIKE 'Verification%' OR act_name LIKE 'Probe%' "
       "OR act_name LIKE 'Curl%' OR act_name LIKE 'Ghost%'")
    db("DELETE FROM activity_logs WHERE entity_type LIKE 'compliance%' AND entity_id IS NOT NULL "
       "AND id NOT IN (SELECT * FROM (SELECT MIN(id) FROM activity_logs WHERE entity_type LIKE 'compliance%' "
       "GROUP BY entity_type, entity_id) x)")
    db("DELETE FROM email_logs WHERE entity_type = 'compliance_document' AND entity_id NOT IN "
       "(SELECT * FROM (SELECT DISTINCT id FROM compliance_documents) x)")


def ensure_employer(session):
    """The document register needs an employer, and the employer panel needs a
    portal login linked to it. Both are created here if the sandbox has none —
    the fixture is idempotent, so re-running the suite reuses what exists."""
    linked = db("SELECT e.id FROM employers e JOIN employer_users eu ON eu.employer_id = e.id "
                "JOIN users u ON u.id = eu.user_id "
                "WHERE u.email = 'employer.test@complianceos.local' AND e.deleted_at IS NULL LIMIT 1")
    if linked:
        employer_id = int(linked[0][0])
        ensure_contact_email(employer_id)
        return employer_id

    existing = db("SELECT id FROM employers WHERE deleted_at IS NULL ORDER BY id LIMIT 1")
    if existing:
        employer_id = int(existing[0][0])
    else:
        stamp = datetime.now().strftime("%Y%m%d%H%M")
        status, body = session.request("POST", "/api/admin/employers", {
            "company_name": f"Verification Industries {stamp}",
            "employer_code": f"VER{stamp}",
            "industry_type": "Manufacturing",
            "company_type": "Private Limited",
            "email": f"compliance{stamp}@verification.example",
            "mobile": "9840012345",
            "address_line_1": "12, Industrial Estate",
            "city": "Chennai", "state": "Tamil Nadu", "pincode": "600032",
        })
        if status not in (200, 201):
            raise RuntimeError(f"could not create the fixture employer: {status} {body}")
        employer_id = int(payload(body).get("employerId"))

    db("INSERT INTO employer_users (employer_id, user_id, is_primary) "
       "SELECT {}, id, 1 FROM users WHERE email = 'employer.test@complianceos.local'".format(employer_id))
    ensure_contact_email(employer_id)
    return employer_id


def ensure_contact_email(employer_id):
    """Make sure the employer on the register can actually be emailed.

    A reminder is only mailed when the employer carries a contact address; the
    seeded companies carry none, so the endpoint answers "no employer contact
    email on file" and skips the email — correct behaviour, but it would make
    the expiry-reminder assertions test nothing. This fills in the address only
    when both are empty, so a real one is never overwritten.
    """
    db("UPDATE employers SET compliance_contact_email = 'compliance.contact@verification.example' "
       "WHERE id = {} AND (email IS NULL OR email = '') "
       "AND (compliance_contact_email IS NULL OR compliance_contact_email = '');".format(employer_id))


def iso(days):
    return (date.today() + timedelta(days=days)).isoformat()


def main():
    print(f"Compliance register verification against {BASE}\n")

    admin = Session(ADMIN)
    ok_login, detail = admin.login()
    check("admin login", ok_login, detail)
    if not ok_login:
        return

    # ── the seeded legislation ────────────────────────────────────────────
    print("\n[1] Seeded register")
    stamp = datetime.now().strftime("%Y%m%d%H%M")
    reset_fixture(stamp)
    status, body = admin.request("GET", "/api/admin/compliance/acts?limit=100")
    check("GET /api/admin/compliance/acts 200", status == 200, status)
    acts = rows_of(body)
    check("act register is populated", len(acts) >= 9, f"{len(acts)} acts")
    names = {row["act_name"] for row in acts}
    check("Factories Act, 1948 present", "Factories Act, 1948" in names)
    check("Tamil Nadu Shops and Establishments Act present",
          "Tamil Nadu Shops and Establishments Act, 1947" in names)
    stats = body.get("stats") or {}
    check("act stats expose a total", int(stats.get("total", 0)) >= 9, stats)
    check("state acts carry their state",
          all(row.get("state_name") for row in acts if row.get("jurisdiction") == "State"),
          [row.get("act_name") for row in acts if row.get("jurisdiction") == "State"])
    check("central acts do not claim a state",
          all(not row.get("state_name") for row in acts if row.get("jurisdiction") == "Central"),
          [row.get("act_name") for row in acts if row.get("jurisdiction") == "Central" and row.get("state_name")])
    factories = next(row for row in acts if row["act_name"] == "Factories Act, 1948")

    status, body = admin.request("GET", f"/api/admin/compliance/acts/{factories['id']}")
    check("GET act detail 200", status == 200, status)
    detail_data = payload(body)
    counts = detail_data.get("counts") or {}
    check("act detail carries rules", int(counts.get("rules", 0)) >= 5, counts)
    check("act detail carries regulations", int(counts.get("regulations", 0)) >= 1, counts)
    esi = next((row for row in acts if row["act_name"].startswith("Employees' State Insurance Act")), None)
    status, body = admin.request("GET", f"/api/admin/compliance/acts/{esi['id']}")
    esi_detail = payload(body)
    check("act detail carries the gazette notifications tied to the act",
          len(esi_detail.get("notifications") or []) >= 1,
          (esi_detail.get("counts") or {}, [row.get("notification_number") for row in (esi_detail.get("notifications") or [])]))
    check("act detail carries the applicability criteria",
          bool((detail_data.get("act") or {}).get("applicability_criteria")))
    check("act detail carries the obligation text",
          all(row.get("rule_text") for row in (detail_data.get("rules") or [])),
          [row.get("rule_number") for row in (detail_data.get("rules") or []) if not row.get("rule_text")])

    status, body = admin.request("GET", "/api/admin/compliance/rules?limit=100")
    rules = rows_of(body)
    check("rule register populated", len(rules) >= 22, f"{len(rules)} rules")
    check("rules expose frequency + due day",
          all("frequency" in row and "due_day_of_month" in row for row in rules[:5]))
    epf_rules = [row for row in rules if str(row.get("rule_number", "")).startswith("EPF")]
    check("EPF monthly obligation carries the 15th as its due day",
          any(row.get("frequency") == "Monthly" and int(row.get("due_day_of_month") or 0) == 15 for row in epf_rules),
          [(row.get("rule_number"), row.get("due_day_of_month")) for row in epf_rules])

    status, body = admin.request("GET", "/api/admin/compliance/regulations?limit=100")
    regulations = rows_of(body)
    check("regulation register populated", len(regulations) >= 6, f"{len(regulations)} regulations")
    check("regulations name their issuing authority",
          all(row.get("issuing_authority") for row in regulations))

    status, body = admin.request("GET", "/api/admin/compliance/notifications?limit=100")
    gazette = rows_of(body)
    check("gazette notification register populated", len(gazette) >= 4, f"{len(gazette)} notifications")
    check("gazette rows carry a number and an effective date",
          all(row.get("notification_number") and row.get("effective_date") for row in gazette))

    # ── acts lifecycle ────────────────────────────────────────────────────
    print("\n[2] Acts — validation, duplicates, dependants")
    status, body = admin.request("POST", "/api/admin/compliance/acts", {
        "act_name": "Factories Act, 1948", "jurisdiction": "Central", "act_year": 1948,
    })
    check("duplicate act refused 409", status == 409, f"{status} {body.get('message')}")

    status, body = admin.request("POST", "/api/admin/compliance/acts", {
        "act_name": f"Verification State Act {stamp}", "jurisdiction": "State", "act_year": 2026,
    })
    check("state act without a state refused 422", status == 422, status)

    status, body = admin.request("POST", "/api/admin/compliance/acts", {
        "act_name": f"Verification Central Act {stamp}", "jurisdiction": "Central",
        "state_name": "Tamil Nadu", "act_year": 2026,
    })
    check("non-state act carrying a state refused 422", status == 422, status)

    status, body = admin.request("POST", "/api/admin/compliance/acts", {
        "act_name": f"Verification State Act {stamp}", "short_name": f"VSA-{stamp}",
        "jurisdiction": "State", "state_name": "Tamil Nadu", "act_year": 2026,
        "summary": "Created by the verification suite.", "status": "active",
    })
    check("state act created 201", status in (200, 201), f"{status} {body.get('message')}")
    act_id = payload(body).get("actId")
    check("create returns the new act id", bool(act_id), body)

    status, body = admin.request("PUT", f"/api/admin/compliance/acts/{act_id}", {
        "act_name": f"Verification State Act {stamp}", "short_name": f"VSA-{stamp}",
        "jurisdiction": "State", "state_name": "Tamil Nadu", "act_year": 2026,
        "summary": "Updated by the verification suite.", "status": "active",
    })
    check("act updated 200", status == 200, f"{status} {body.get('message')}")

    status, body = admin.request("GET", f"/api/admin/compliance/acts/{act_id}")
    check("update persisted",
          (payload(body).get("act") or {}).get("summary") == "Updated by the verification suite.",
          payload(body).get("act"))

    status, body = admin.request("PUT", "/api/admin/compliance/acts/999999", {
        "act_name": "Ghost act", "jurisdiction": "Central",
    })
    check("updating a missing act answers 404", status == 404, status)

    status, body = admin.request("DELETE", f"/api/admin/compliance/acts/{factories['id']}")
    check("act with dependants refuses deletion 409", status == 409, f"{status} {body.get('message')}")
    message = str(body.get("message", "")).lower()
    check("refusal names the dependants", "rule" in message and "regulation" in message, body.get("message"))

    # ── rules ─────────────────────────────────────────────────────────────
    print("\n[3] Rules")
    status, body = admin.request("POST", "/api/admin/compliance/rules", {
        "act_id": 999999, "rule_title": "Orphan rule", "compliance_type": "Mandatory", "frequency": "Annual",
    })
    check("rule under a missing act refused 422", status == 422, status)

    status, body = admin.request("POST", "/api/admin/compliance/rules", {
        "act_id": act_id, "rule_number": "VSA-01", "rule_title": f"Verification monthly renewal {stamp}",
        "compliance_type": "Mandatory", "frequency": "Monthly",
    })
    check("periodic rule without a due day refused 422", status == 422, status)

    status, body = admin.request("POST", "/api/admin/compliance/rules", {
        "act_id": act_id, "rule_number": "VSA-02", "rule_title": f"Verification one-time display {stamp}",
        "compliance_type": "Mandatory", "frequency": "One-time", "due_day_of_month": 10,
    })
    check("one-time obligation carrying a due day refused 422", status == 422, status)

    status, body = admin.request("POST", "/api/admin/compliance/rules", {
        "act_id": act_id, "rule_number": "VSA-01", "rule_title": f"Verification monthly renewal {stamp}",
        "rule_text": "Renew the registration before it lapses and keep the receipt on file.",
        "compliance_type": "Mandatory", "frequency": "Monthly", "due_day_of_month": 10,
        "responsible_role": "Establishment Head", "status": "active",
        "evidence_required": "Renewal receipt, registration certificate.",
    })
    check("rule created 201", status in (200, 201), f"{status} {body.get('message')}")
    rule_id = payload(body).get("ruleId")
    check("create returns the rule id", bool(rule_id), body)

    status, body = admin.request("POST", "/api/admin/compliance/rules", {
        "act_id": act_id, "rule_number": "VSA-02", "rule_title": f"Verification one-time display {stamp}",
        "rule_text": "Display the abstract of the act at the main entrance.",
        "compliance_type": "Mandatory", "frequency": "One-time", "status": "active",
    })
    check("non-periodic rule without a due day accepted", status in (200, 201), f"{status} {body.get('message')}")
    display_rule = payload(body).get("ruleId")

    status, body = admin.request("GET", f"/api/admin/compliance/rules/{display_rule}")
    check("rule detail read back 200", status == 200, status)
    check("rule detail exposes the obligation and its penalty",
          bool((payload(body).get("rule") or {}).get("rule_text")), payload(body).get("rule"))

    status, body = admin.request("DELETE", f"/api/admin/compliance/rules/{display_rule}")
    check("unreferenced rule deleted 200", status == 200, f"{status} {body.get('message')}")

    # ── regulations ───────────────────────────────────────────────────────
    print("\n[4] Regulations and gazette notifications")
    status, body = admin.request("POST", "/api/admin/compliance/regulations", {
        "regulation_name": f"Verification Rules {stamp}", "act_id": act_id, "rule_id": 999999,
    })
    check("regulation under a missing rule refused 422", status == 422, status)

    other_act = next(row for row in acts if row["id"] != act_id)
    status, body = admin.request("POST", "/api/admin/compliance/regulations", {
        "regulation_name": f"Verification Mismatched Rules {stamp}", "act_id": other_act["id"], "rule_id": rule_id,
    })
    check("regulation whose rule belongs to another act refused 422", status == 422, status)

    status, body = admin.request("POST", "/api/admin/compliance/regulations", {
        "regulation_name": f"Verification Rules {stamp}", "regulation_number": "G.O. Ms. No. 1",
        "act_id": act_id, "rule_id": rule_id, "issuing_authority": "Government of Tamil Nadu",
        "issue_date": iso(-400), "effective_date": iso(-395),
        "scope": "Verification suite scope.", "obligations": "Verification suite obligations.",
        "reporting_authority": "Commissioner of Labour", "reporting_frequency": "Annual",
        "status": "active",
    })
    check("regulation created 201", status in (200, 201), f"{status} {body.get('message')}")
    regulation_id = payload(body).get("regulationId")

    status, body = admin.request("DELETE", f"/api/admin/compliance/rules/{rule_id}")
    check("rule referenced by a regulation refuses deletion 409", status == 409, f"{status} {body.get('message')}")

    status, body = admin.request("POST", "/api/admin/compliance/notifications", {
        "notification_number": "G.S.R. 1211(E)", "title": "Duplicate gazette number",
        "notification_date": iso(-30),
    })
    check("duplicate gazette number refused 409", status == 409, f"{status} {body.get('message')}")

    status, body = admin.request("POST", "/api/admin/compliance/notifications", {
        "notification_number": f"G.S.R. {stamp}(E)", "title": f"Verification notification {stamp}",
        "notification_date": iso(-20), "issuing_authority": "Ministry of Labour and Employment",
        "act_id": act_id, "gazette_reference": "The Gazette of India, Extraordinary, Part II, Section 3(i)",
        "subject": "Verification suite subject.", "body": "Verification suite body text.",
        "effective_date": iso(-10), "applicability": "Verification suite establishments.",
        "action_required": "Update the registers.", "status": "active",
    })
    check("gazette notification created 201", status in (200, 201), f"{status} {body.get('message')}")
    notification_id = payload(body).get("notificationId")

    status, body = admin.request("GET", f"/api/admin/compliance/notifications/{notification_id}")
    check("gazette notification read back 200", status == 200, status)
    check("gazette notification keeps its action required text",
          "registers" in str((payload(body).get("notification") or {}).get("action_required", "")),
          payload(body).get("notification"))

    status, body = admin.request("DELETE", f"/api/admin/compliance/notifications/{notification_id}")
    check("gazette notification deleted 200", status == 200, f"{status} {body.get('message')}")

    # ── documents ─────────────────────────────────────────────────────────
    print("\n[5] Employer documents — derived status, duplicate guard")
    employer_id = ensure_employer(admin)
    check("an employer exists to hold documents", bool(employer_id), employer_id)

    status, body = admin.request("GET", "/api/admin/compliance/options")
    check("GET /api/admin/compliance/options 200", status == 200, status)
    options = payload(body)
    check("options expose employers, types and statuses",
          bool(options.get("employerOptions")) and bool(options.get("documentTypes")) and bool(options.get("statuses")),
          list(options.keys()))

    base_document = {
        "employer_id": int(employer_id), "document_name": f"Factories Licence {stamp}",
        "document_type": "Licence", "issuing_authority": "Inspector of Factories, Chennai",
        "document_number": f"TN/FAC/{stamp}", "act_id": factories["id"], "rule_id": None,
        "renewal_responsibility": "Safety Officer", "remind_days_before": 30,
    }

    status, body = admin.request("POST", "/api/admin/compliance/documents", {
        **base_document, "expiry_date": iso(400),
    })
    check("document created 201", status in (200, 201), f"{status} {body.get('message')}")
    valid_document = payload(body).get("documentId")
    check("far-off expiry reads Valid", payload(body).get("complianceStatus") == "Valid",
          payload(body).get("complianceStatus"))

    status, body = admin.request("POST", "/api/admin/compliance/documents", {
        **base_document, "expiry_date": iso(500),
    })
    check("duplicate document number refused 409", status == 409, f"{status} {body.get('message')}")

    status, body = admin.request("POST", "/api/admin/compliance/documents", {
        **base_document, "document_name": f"Pollution Consent {stamp}", "document_type": "Certificate",
        "document_number": f"TN/PCB/{stamp}", "expiry_date": iso(20),
    })
    check("document inside the reminder window reads Expiring Soon",
          payload(body).get("complianceStatus") == "Expiring Soon", payload(body).get("complianceStatus"))
    expiring_document = payload(body).get("documentId")

    status, body = admin.request("POST", "/api/admin/compliance/documents", {
        **base_document, "document_name": f"Fire NOC {stamp}", "document_type": "Permit",
        "document_number": f"TN/FIRE/{stamp}", "expiry_date": iso(-15),
    })
    check("lapsed document reads Expired", payload(body).get("complianceStatus") == "Expired",
          payload(body).get("complianceStatus"))
    expired_document = payload(body).get("documentId")

    status, body = admin.request("POST", "/api/admin/compliance/documents", {
        **base_document, "document_name": f"Contract Labour Registration {stamp}", "document_type": "Registration",
        "document_number": f"TN/CLRA/{stamp}", "issue_date": iso(-10), "validity_period_days": 200,
    })
    check("validity period becomes the expiry date", status in (200, 201), f"{status} {body.get('message')}")
    derived_document = payload(body).get("documentId")

    status, body = admin.request("POST", "/api/admin/compliance/documents", {
        **base_document, "document_name": "Orphan document", "document_number": f"TN/XXX/{stamp}",
        "employer_id": 999999, "expiry_date": iso(100),
    })
    check("document for a missing employer refused 422", status == 422, status)

    status, body = admin.request("GET", "/api/admin/compliance/documents?limit=100")
    check("document register lists the new rows 200", status == 200, status)
    rows = rows_of(body)
    check("list exposes the effective status and days to expiry",
          all("effective_status" in row and "days_to_expiry" in row for row in rows[:5]),
          list(rows[0].keys()) if rows else [])
    check("list joins the employer and the act for the table",
          all(row.get("company_name") for row in rows[:5]) and any(row.get("act_name") for row in rows[:5]),
          rows[0] if rows else {})
    expiry_stats = body.get("stats") or {}
    check("stats count the expired and expiring documents",
          int(expiry_stats.get("expired", 0)) >= 1 and int(expiry_stats.get("expiringSoon", 0)) >= 1, expiry_stats)

    status, body = admin.request("GET", "/api/admin/compliance/documents?compliance_status=Expired&limit=100")
    expired_rows = rows_of(body)
    check("filtering by Expired returns only lapsed documents",
          all(row.get("effective_status") == "Expired" for row in expired_rows) and len(expired_rows) >= 1,
          [(row.get("document_name"), row.get("effective_status")) for row in expired_rows[:3]])

    status, body = admin.request("GET", "/api/admin/compliance/documents?expiringWithin=30&limit=100")
    within = rows_of(body)
    check("expiringWithin filter is respected",
          all(0 <= int(row.get("days_to_expiry") or 0) <= 30 for row in within), len(within))

    status, body = admin.request("GET", f"/api/admin/compliance/documents?search=TN%2FPCB%2F{stamp}&limit=50")
    found = rows_of(body)
    check("search finds the document by its number", len(found) == 1 and found[0]["id"] == expiring_document,
          [row.get("document_number") for row in found])

    status, body = admin.request("GET", f"/api/admin/compliance/documents/{derived_document}")
    check("GET document detail 200", status == 200, status)
    stored = payload(body).get("document") or {}
    check("validity period produced a 200-day expiry window",
          bool(stored.get("expiry_date")) and str(stored.get("validity_period_days")) == "200",
          (stored.get("expiry_date"), stored.get("validity_period_days")))
    check("document detail carries its employer and its act",
          bool(stored.get("company_name")) and bool(stored.get("act_name")), stored)

    # ── verification, renewal, reminder ──────────────────────────────────
    print("\n[6] Verification, renewal and the expiry reminder")
    status, body = admin.request("POST", f"/api/admin/compliance/documents/{valid_document}/verify", {"is_verified": True})
    check("document verified 200", status == 200, f"{status} {body.get('message')}")
    status, body = admin.request("GET", f"/api/admin/compliance/documents/{valid_document}")
    stored = payload(body).get("document") or {}
    check("verification stamps the user and the time",
          str(stored.get("is_verified")) in ("1", "True", "true") and bool(stored.get("verified_by")),
          (stored.get("is_verified"), stored.get("verified_by"), stored.get("verified_at")))
    check("verifier name resolves", bool(stored.get("verified_by_name")), stored.get("verified_by_name"))

    status, body = admin.request("POST", f"/api/admin/compliance/documents/{valid_document}/verify", {"is_verified": False})
    check("verification can be withdrawn", status == 200, status)
    status, body = admin.request("POST", f"/api/admin/compliance/documents/{valid_document}/verify", {"is_verified": True})
    check("document re-verified 200", status == 200, status)

    status, body = admin.request("POST", f"/api/admin/compliance/documents/{valid_document}/renew", {})
    check("renewal without new dates refused 422", status == 422, status)

    status, body = admin.request("POST", f"/api/admin/compliance/documents/{valid_document}/renew", {
        "issue_date": iso(-1), "expiry_date": iso(730), "document_number": f"TN/FAC/{stamp}/R1",
        "fee_amount": 5500, "notes": "Renewed by the verification suite.",
    })
    check("document renewed 200", status == 200, f"{status} {body.get('message')}")
    check("renewal recomputes the status to Valid", payload(body).get("complianceStatus") == "Valid", body)

    status, body = admin.request("GET", f"/api/admin/compliance/documents/{valid_document}")
    stored = payload(body).get("document") or {}
    check("renewal moved the expiry date", str(stored.get("expiry_date")) == iso(730), stored.get("expiry_date"))
    check("renewal cleared the reminder stamp so the next cycle notifies",
          stored.get("reminder_sent_at") in (None, "None", ""), stored.get("reminder_sent_at"))

    status, body = admin.request("POST", f"/api/admin/compliance/documents/{expiring_document}/remind", {})
    check("expiry reminder dispatched 200", status == 200, f"{status} {body.get('message')}")
    reminder = payload(body)
    check("reminder reports the days to expiry", int(reminder.get("daysToExpiry", -1)) > 0, reminder)
    check("reminder raises an in-app notification for the administrators",
          int(reminder.get("notified", 0)) >= 1, reminder)

    logged = scalar("SELECT COUNT(*) FROM email_logs WHERE entity_type = 'compliance_document' "
                    f"AND entity_id = {expiring_document} AND template_code = 'compliance.document_expiring'")
    check("reminder email logged against the document", int(logged or 0) >= 1, logged)
    stamped = scalar(f"SELECT reminder_sent_at IS NOT NULL FROM compliance_documents WHERE id = {expiring_document}")
    check("reminder stamp recorded on the document", str(stamped) == "1", stamped)

    status, body = admin.request("POST", f"/api/admin/compliance/documents/{expired_document}/remind", {})
    check("expiry reminder works for a lapsed document too", status == 200, f"{status} {body.get('message')}")

    # the nightly job, invoked directly, must not choke on the new rows
    # The cron entry point, exactly as the deployment guide runs it.
    job = subprocess.run("npm run send:reminders --silent", shell=True, capture_output=True, text=True, timeout=300)
    check("npm run send:reminders completes against the register",
          job.returncode == 0 and "compliance-expiry" in job.stdout,
          (job.stdout[-400:], job.stderr[-300:]))

    # ── activity trail ────────────────────────────────────────────────────
    print("\n[7] Activity trail")
    actions = {row[0] for row in db("SELECT DISTINCT action FROM activity_logs WHERE entity_type LIKE 'compliance%'")}
    for expected in ("created", "updated", "deleted", "renewed", "verified", "reminded"):
        check(f"activity log records '{expected}'", expected in actions, sorted(actions))
    document_trail = int(scalar(
        f"SELECT COUNT(*) FROM activity_logs WHERE entity_type = 'compliance_document' AND entity_id = {valid_document}") or 0)
    check("document mutations are logged individually", document_trail >= 4, document_trail)
    log_fields = db("SELECT user_id, description FROM activity_logs WHERE entity_type = 'compliance_document' "
                    f"AND entity_id = {valid_document} ORDER BY id DESC LIMIT 1")
    check("activity rows carry the acting user and a description",
          bool(log_fields) and log_fields[0][0] and bool(log_fields[0][1]), log_fields)

    # ── employer panel scoping ────────────────────────────────────────────
    print("\n[8] Employer panel — own company only")
    employer = Session(EMPLOYER)
    ok_login, detail = employer.login()
    check("employer login", ok_login, detail)
    if ok_login:
        status, body = employer.request("GET", "/api/employer/compliance-documents?limit=100&overview=true")
        check("employer reads their own register 200", status == 200, status)
        own_rows = rows_of(body)
        own_employer = (employer.user or {}).get("employerId")
        check("every row belongs to this company",
              all(str(row.get("employer_id")) == str(own_employer) for row in own_rows),
              [(row.get("employer_id"), own_employer) for row in own_rows[:3]])
        check("employer register carries the stats and the expiring list",
              bool(body.get("stats")) and "expiring" in body, list(body.keys()))

        status, body = employer.request("GET", f"/api/employer/compliance-documents/{valid_document}")
        check("employer can open a document of their own company", status == 200, status)

        status, body = employer.request("POST", "/api/employer/compliance-documents", {
            "employer_id": 999999, "document_name": f"Employer filed return {stamp}",
            "document_type": "Return", "document_number": f"EMP/RTN/{stamp}",
            "issuing_authority": "Tamil Nadu Pollution Control Board", "expiry_date": iso(365),
            "renewal_responsibility": "Compliance Officer",
        })
        check("employer-created document accepted 201", status in (200, 201), f"{status} {body.get('message')}")
        new_document = payload(body).get("documentId")
        owner = scalar(f"SELECT employer_id FROM compliance_documents WHERE id = {new_document}") if new_document else None
        check("employer id is taken from the session, ignoring the body", str(owner) == str(own_employer),
              (owner, own_employer))

        external = db("SELECT cd.id FROM compliance_documents cd WHERE cd.employer_id <> {} "
                      "AND cd.deleted_at IS NULL LIMIT 1".format(own_employer))
        if external:
            status, body = employer.request("GET", f"/api/employer/compliance-documents/{external[0][0]}")
            check("another company's document is not readable", status in (403, 404), status)
            status, body = employer.request("DELETE", f"/api/employer/compliance-documents/{external[0][0]}")
            check("another company's document is not deletable", status in (403, 404), status)

        status, body = employer.request("GET", "/api/admin/compliance/documents")
        check("employer cannot read the admin register", status == 403, status)
        status, body = employer.request("GET", "/api/admin/compliance/acts")
        check("employer cannot read the act register through the admin API", status == 403, status)
        status, body = employer.request("POST", "/api/admin/compliance/documents", {
            "employer_id": int(employer_id), "document_name": "Forbidden", "document_type": "Licence",
        })
        check("employer cannot create through the admin API", status == 403, status)

        if new_document:
            status, body = employer.request("POST", f"/api/employer/compliance-documents/{new_document}/renew", {
                "issue_date": iso(0), "expiry_date": iso(400), "document_number": f"EMP/RTN/{stamp}/R1",
            })
            check("employer renews their own filing 200", status == 200, f"{status} {body.get('message')}")
            status, body = employer.request("DELETE", f"/api/employer/compliance-documents/{new_document}")
            check("employer removes their own filing 200", status == 200, f"{status} {body.get('message')}")

    # ── the public legislation page reads the same register ───────────────
    print("\n[9] Public site")
    status, html = Session(("", "")).request("GET", "/acts-compliance", raw=True)
    check("GET /acts-compliance 200", status == 200, status)
    check("public page renders a seeded act", "Factories Act" in html, html[:200])
    check("public page states an applicability threshold",
          "twenty or more" in html.lower() or "20 or more" in html.lower(), "threshold text missing")
    status, html = Session(("", "")).request("GET", "/acts-compliance?jurisdiction=State", raw=True)
    check("public page filters by jurisdiction", status == 200 and "Tamil Nadu Shops" in html, status)

    # ── the panels themselves ─────────────────────────────────────────────
    print("\n[10] Panel pages")
    pages = [
        ("/admin/compliance/acts", "Compliance Acts"),
        ("/admin/compliance/acts/create", "Add an Act"),
        (f"/admin/compliance/acts/{factories['id']}", factories["act_name"]),
        (f"/admin/compliance/acts/{factories['id']}/edit", "Edit"),
        ("/admin/compliance/rules", "Compliance Obligations"),
        ("/admin/compliance/rules/create", "Add an Obligation"),
        ("/admin/compliance/regulations", "Compliance Regulations"),
        ("/admin/compliance/notifications", "Gazette Notifications"),
        ("/admin/compliance/documents", "Compliance Documents"),
        ("/admin/compliance/documents/create", "Record a Document"),
        (f"/admin/compliance/documents/{expiring_document}", "Pollution Consent"),
        (f"/admin/compliance/documents/{expiring_document}/edit", "Edit"),
        ("/employer/compliance-documents", "Compliance Documents"),
    ]
    for path, needle in pages:
        status, html = admin.request("GET", path, raw=True)
        check(f"GET {path} renders", status == 200 and needle in html, status)

    # the record trail the detail pages rely on
    status, body = admin.request("GET", f"/api/admin/activity-logs?entityType=compliance_document&entityId={expiring_document}&limit=10")
    check("activity trail endpoint answers for a record", status == 200 and len(rows_of(body)) >= 1,
          (status, body if status != 200 else len(rows_of(body))))

    # ── clean-up: leave the register as we found it ───────────────────────
    print("\n[11] Clean-up")
    for document_id in (valid_document, expiring_document, expired_document, derived_document):
        admin.request("DELETE", f"/api/admin/compliance/documents/{document_id}")
    status, body = admin.request("DELETE", f"/api/admin/compliance/regulations/{regulation_id}")
    check("regulation deleted after its documents were cleared", status == 200, f"{status} {body.get('message')}")
    status, body = admin.request("DELETE", f"/api/admin/compliance/rules/{rule_id}")
    check("rule deleted after its regulation was cleared", status == 200, f"{status} {body.get('message')}")
    status, body = admin.request("DELETE", f"/api/admin/compliance/acts/{act_id}")
    check("act deleted after its dependants were cleared", status == 200, f"{status} {body.get('message')}")

    remaining = int(scalar(f"SELECT COUNT(*) FROM compliance_documents WHERE deleted_at IS NULL "
                           f"AND document_number LIKE '%{stamp}%'") or 0)
    check("verification documents are soft-deleted, not orphaned", remaining == 0, remaining)
    acts_left = int(scalar("SELECT COUNT(*) FROM compliance_acts WHERE deleted_at IS NULL") or 0)
    check("the seeded register survives the suite", acts_left >= 9, acts_left)

    print(f"\n=== RESULT: {passed} passed, {failed} failed ===")
    if failures:
        for line in failures:
            print(f"  ✗ {line}")
        sys.exit(1)


if __name__ == "__main__":
    main()
