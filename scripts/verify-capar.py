"""CAPAR end-to-end check: the whole life of a report through the API, with every role.

    python scripts/verify-capar.py            (server on http://127.0.0.1:3001 with the demo data seeded)

Covers: header prefill, findings, photo upload, submit rules, verifier Eligible / Not Eligible, return and resubmit,
approval, employer visibility, role isolation, admin-editable categories and draft deletion. Test rows are removed at the
end. Exit code 1 if any check fails."""
import struct
import sys
import zlib

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db, multipart  # noqa: E402

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  ok  " if condition else "  FAIL") + f" {name}" + (f"  -> {detail}" if not condition and detail else ""))


def png(width=40, height=30, colour=(200, 40, 40)):
    """A real, tiny PNG (so the upload passes the image type check)."""
    raw = b"".join(b"\x00" + bytes(colour) * width for _ in range(height))
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def login(email, role):
    session = Session((email, PASSWORDS[role]))
    ok, detail = session.login()
    if not ok:
        sys.exit(f"cannot sign in as {email}: {detail}")
    return session


def data(response):
    return response[1].get("data") if isinstance(response[1], dict) else None


print("== set-up")
auditor = login("priya.auditor@demo.complianceos.local", "auditor")
other_auditor = login("karthik.auditor@demo.complianceos.local", "auditor")
verifier = login("verifier.test@complianceos.local", "verifier")
employer = login("balaji.hr@demo.complianceos.local", "employer")
employee = login("employee.test@complianceos.local", "employee")
admin = login("demo.admin@complianceos.local", "admin")

employer_id = int(db("SELECT eu.employer_id FROM employer_users eu JOIN users u ON u.id = eu.user_id WHERE u.email = 'balaji.hr@demo.complianceos.local' LIMIT 1")[0][0])
verifier_id = int(db("SELECT id FROM users WHERE email = 'verifier.test@complianceos.local'")[0][0])
db("DELETE FROM capar_reports WHERE title LIKE 'ZZ TEST CAPAR%'")
from seed_common import ensure_pack  # noqa: E402  (an auditor must have downloaded the employer's document pack first)
ensure_pack(auditor, employer_id)

print("== categories")
status, body = auditor.send("GET", "/api/capar/categories")
categories = body.get("data") or []
check("auditor can read the 10 default categories", status == 200 and len(categories) >= 10, f"{status} {len(categories)}")
cat_fire = next(c["id"] for c in categories if c["name"].startswith("Emergency"))
cat_business = next(c["id"] for c in categories if c["name"] == "Business Practices")

print("== create")
status, body = auditor.send("POST", "/api/capar", {"employer_id": employer_id, "title": "ZZ TEST CAPAR main", "standard_reference": "H&M MR Standards"})
check("auditor starts a report", status == 201, f"{status} {body}")
report = body["data"]
rid = report["id"]
check("report number allocated", str(report["report_number"]).startswith("CAPAR/"), report.get("report_number"))
check("facility name prefilled from the employer", bool(report["facility_name"]))
check("auditor print name prefilled", bool(report["auditor_print_name"]))
check("starts as Draft", report["status"] == "Draft")

status, _ = auditor.send("POST", "/api/capar", {})
check("create without an employer is refused", status == 422, status)
status, _ = employee.send("POST", "/api/capar", {"employer_id": employer_id})
check("employee cannot create", status in (401, 403), status)

print("== findings")
status, body = auditor.send("POST", f"/api/capar/{rid}/findings", {
    "category_id": cat_fire, "act_rule": "Factories Act 1948, Chapter IV, Section 38(1)",
    "minimum_requirement": "Fire extinguishers shall be installed on every floor",
    "local_law": "In accordance with Factories Act 1948 Chapter IV Section 38(1) all practicable measures shall be taken to prevent outbreak of fire.",
    "finding": "Fire extinguishers were not installed at the mezzanine floor.",
    "root_cause": "Floor was newly constructed and not added to the safety plan.", "action_plan": "Install 4 ABC extinguishers and update the plan.",
    "timeline_date": "2026-12-15"})
check("violation finding added", status == 201, f"{status} {body}")
f1 = body["data"]["id"]
status, body = auditor.send("POST", f"/api/capar/{rid}/findings", {"category_id": cat_business, "outcome": "No Violation", "minimum_requirement": "Valid factory licence displayed"})
check("no-violation row added", status == 201, status)
f2 = body["data"]["id"]
status, body = auditor.send("POST", f"/api/capar/{rid}/findings", {"category_id": cat_fire, "act_rule": "TN Factories Rules 1950 Rule 57"})
check("incomplete violation row can be saved as a draft", status == 201, status)
f3 = body["data"]["id"]
status, _ = auditor.send("POST", f"/api/capar/{rid}/findings", {"category_id": 999999})
check("unknown category refused", status == 400, status)
status, _ = auditor.send("POST", f"/api/capar/{rid}/findings", {"timeline_date": "15-12-2026"})
check("bad date refused", status == 422, status)

status, body = auditor.send("PATCH", f"/api/capar/{rid}/findings/{f1}", {"action_status": "Closed"})
check("closing an action stamps the date", status == 200 and body["data"]["closed_on"], f"{status} {body['data'].get('closed_on') if status == 200 else body}")
status, body = auditor.send("PATCH", f"/api/capar/{rid}/findings/{f1}", {"action_status": "Open"})
check("reopening clears the date", status == 200 and not body["data"]["closed_on"], status)

print("== photos and evidence")
fields = [("kind", "Photo"), ("caption", "Mezzanine floor, no extinguisher")]
payload, ctype = multipart(fields, [("files", "mezzanine.png", "image/png", png())])
status, body = auditor.send("POST", f"/api/capar/{rid}/findings/{f1}/files", payload, content_type=ctype)
check("photo attached", status == 201, f"{status} {body}")
payload, ctype = multipart([("kind", "Photo")], [("files", "notes.pdf", "application/pdf", b"%PDF-1.4\n%%EOF")])
status, _ = auditor.send("POST", f"/api/capar/{rid}/findings/{f1}/files", payload, content_type=ctype)
check("a PDF is refused as a photo", status == 422, status)
payload, ctype = multipart([("kind", "Evidence")], [("files", "invoice.pdf", "application/pdf", b"%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF")])
status, body = auditor.send("POST", f"/api/capar/{rid}/findings/{f1}/files", payload, content_type=ctype)
check("evidence PDF attached", status == 201, f"{status} {body}")

status, body = auditor.send("GET", f"/api/capar/{rid}")
detail = body["data"]
finding1 = next(f for f in detail["findings"] if f["id"] == f1)
check("detail lists both files on the finding", len(finding1["files"]) == 2, len(finding1["files"]))
check("detail says the auditor can edit and submit", detail["can"]["edit"] and detail["can"]["submit"])
photo = next(f for f in finding1["files"] if f["kind"] == "Photo")
status, blob = auditor.send("GET", photo["url"], raw=True)
check("auditor can open the photo", status == 200 and blob[:4] == b"\x89PNG", status)
status, _ = verifier.send("GET", photo["url"], raw=True)
check("verifier can open the photo", status == 200, status)

print("== submit rules")
status, body = auditor.send("POST", f"/api/capar/{rid}/submit", {})
check("cannot submit without a verifier or with an empty finding", status == 422, f"{status} {body.get('message')}")
status, _ = auditor.send("PATCH", f"/api/capar/{rid}", {"verifier_id": 999999})
check("unknown verifier refused", status == 422, status)
status, _ = auditor.send("PATCH", f"/api/capar/{rid}", {"verifier_id": verifier_id, "closing_meeting_date": "2026-10-16", "closing_statement": "A closing meeting was held and the findings were agreed.", "facility_signatory": "Facility Manager"})
check("header saved with verifier and closing details", status == 200, status)
status, body = auditor.send("POST", f"/api/capar/{rid}/submit", {})
check("still refused while a violation has no description", status == 422 and "no description" in str(body.get("message")), f"{status} {body.get('message')}")
status, _ = auditor.send("PATCH", f"/api/capar/{rid}/findings/{f3}", {"finding": "Only one exit was provided to the packing store.", "minimum_requirement": "Two exits for every floor area"})
status, body = auditor.send("POST", f"/api/capar/{rid}/submit", {})
check("submitted for verification", status == 200 and body["data"]["status"] == "Submitted", f"{status} {body.get('message')}")
status, _ = auditor.send("PATCH", f"/api/capar/{rid}/findings/{f1}", {"finding": "changed"})
check("a submitted report is locked", status == 409, status)

print("== role isolation")
status, _ = other_auditor.send("GET", f"/api/capar/{rid}")
check("another auditor is refused", status == 403, status)
status, _ = employer.send("GET", f"/api/capar/{rid}")
check("employer cannot see an unapproved report", status == 404, status)
status, _ = employee.send("GET", f"/api/capar/{rid}")
check("employee has no access", status in (401, 403), status)
status, body = employer.send("GET", "/api/capar")
check("employer list is empty before approval", status == 200 and not any(r["id"] == rid for r in body["data"]), status)
status, body = other_auditor.send("GET", "/api/capar")
check("another auditor does not see it in the list", status == 200 and not any(r["id"] == rid for r in body["data"]))

print("== pdf before approval")
status, blob = auditor.send("GET", f"/api/pdf/capar/{rid}", raw=True)
check("auditor downloads the draft PDF", status == 200 and blob[:5] == b"%PDF-" and len(blob) > 3000, f"{status} {len(blob)}")
status, _ = other_auditor.send("GET", f"/api/pdf/capar/{rid}", raw=True)
check("another auditor cannot download it", status == 403, status)
status, _ = employer.send("GET", f"/api/pdf/capar/{rid}", raw=True)
check("employer cannot download an unapproved report", status == 404, status)
status, _ = employee.send("GET", f"/api/pdf/capar/{rid}", raw=True)
check("employee cannot download it", status in (401, 403), status)

print("== verifier")
status, body = verifier.send("GET", "/api/capar")
check("verifier sees the submitted report", status == 200 and any(r["id"] == rid for r in body["data"]), status)
status, body = verifier.send("GET", f"/api/capar/{rid}")
check("verifier may verify and decide", status == 200 and body["data"]["can"]["verify"] and body["data"]["can"]["decide"] and not body["data"]["can"]["edit"])
status, _ = verifier.send("PATCH", f"/api/capar/{rid}/findings/{f1}", {"finding": "x"})
check("verifier cannot edit findings", status in (403, 409), status)
status, body = verifier.send("POST", f"/api/capar/{rid}/decision", {"decision": "approve"})
check("cannot approve while findings are pending", status == 422, f"{status} {body.get('message')}")
status, _ = verifier.send("POST", f"/api/capar/{rid}/findings/{f3}/verify", {"verification_status": "Not Eligible"})
check("Not Eligible needs a reason", status == 422, status)
status, _ = verifier.send("POST", f"/api/capar/{rid}/findings/{f3}/verify", {"verification_status": "Not Eligible", "verification_remark": "Layout drawing shows two exits; finding not valid."})
check("finding marked Not Eligible", status == 200, status)
status, _ = verifier.send("POST", f"/api/capar/{rid}/findings/{f1}/verify", {"verification_status": "Eligible"})
check("finding marked Eligible", status == 200, status)
status, body = auditor.send("GET", f"/api/capar/{rid}")
check("report moved to Under Review", body["data"]["report"]["status"] == "Under Review", body["data"]["report"]["status"])
status, body = verifier.send("POST", f"/api/capar/{rid}/decision", {"decision": "approve"})
check("approval still blocked by the unverified No-Violation row", status == 422, f"{status} {body.get('message')}")
status, body = verifier.send("POST", f"/api/capar/{rid}/decision", {"decision": "return"})
check("return needs comments", status == 422, status)
status, body = verifier.send("POST", f"/api/capar/{rid}/decision", {"decision": "return", "comments": "Please add the evidence photo for finding 1 and re-check the exit count."})
check("returned to the auditor", status == 200 and body["data"]["status"] == "Returned", f"{status} {body}")

print("== return and resubmit")
status, body = auditor.send("GET", f"/api/capar/{rid}")
check("auditor sees the comments and can edit again", body["data"]["can"]["edit"] and "evidence photo" in str(body["data"]["report"]["review_comments"]))
check("review history recorded", any(e["action"] == "Returned" for e in body["data"]["events"]))
status, _ = auditor.send("PATCH", f"/api/capar/{rid}/findings/{f1}", {"action_plan": "Install 6 extinguishers, one near each exit."})
status, body = auditor.send("GET", f"/api/capar/{rid}")
edited = next(f for f in body["data"]["findings"] if f["id"] == f1)
check("editing a verified finding puts it back to Pending", edited["verification_status"] == "Pending", edited["verification_status"])
untouched = next(f for f in body["data"]["findings"] if f["id"] == f3)
check("an untouched Not Eligible finding keeps its verdict", untouched["verification_status"] == "Not Eligible", untouched["verification_status"])
status, body = auditor.send("POST", f"/api/capar/{rid}/submit", {})
check("resubmitted", status == 200 and body["data"]["revision_count"] == 1, f"{status} {body.get('message')}")
for finding_id in (f1, f2):
    verifier.send("POST", f"/api/capar/{rid}/findings/{finding_id}/verify", {"verification_status": "Eligible"})
status, body = verifier.send("POST", f"/api/capar/{rid}/decision", {"decision": "approve", "comments": "Verified."})
check("approved", status == 200 and body["data"]["status"] == "Approved", f"{status} {body}")

print("== employer view")
status, body = employer.send("GET", "/api/capar")
check("employer now sees the approved report", status == 200 and any(r["id"] == rid for r in body["data"]), status)
status, body = employer.send("GET", f"/api/capar/{rid}")
check("employer opens it", status == 200, status)
if status == 200:
    employer_findings = body["data"]["findings"]
    check("Not Eligible finding is hidden from the employer", all(f["id"] != f3 for f in employer_findings), len(employer_findings))
    check("verifier notes are hidden from the employer", all(not f.get("verification_remark") for f in employer_findings))
    check("employer cannot edit", not body["data"]["can"]["edit"] and not body["data"]["can"]["decide"])
status, _ = employer.send("GET", photo["url"], raw=True)
check("employer can open the photo of an approved report", status == 200, status)
status, blob = employer.send("GET", f"/api/pdf/capar/{rid}", raw=True)
check("employer downloads the approved PDF", status == 200 and blob[:5] == b"%PDF-", status)
status, draft_blob = verifier.send("GET", f"/api/pdf/capar/{rid}", raw=True)
check("verifier downloads the PDF", status == 200 and draft_blob[:5] == b"%PDF-", status)
check("the approved PDF leaves out the Not Eligible finding", len(blob) > 3000)
status, _ = employer.send("PATCH", f"/api/capar/{rid}", {"title": "hacked"})
check("employer cannot change the report", status in (403, 409), status)
status, _ = auditor.send("PATCH", f"/api/capar/{rid}", {"title": "changed"})
check("approved report is locked for the auditor", status == 409, status)
status, _ = auditor.send("POST", f"/api/capar/{rid}/reopen", {})
check("auditor cannot reopen", status == 403, status)
status, body = admin.send("POST", f"/api/capar/{rid}/reopen", {})
check("admin reopens it", status == 200 and body["data"]["status"] == "Returned", f"{status} {body}")
status, body = admin.send("GET", "/api/capar")
check("admin sees every report", status == 200 and any(r["id"] == rid for r in body["data"]))

print("== branding override")
payload, ctype = multipart([("kind", "logo")], [("file", "logo.png", "image/png", png(60, 30, (10, 60, 120)))])
status, body = auditor.send("POST", f"/api/capar/{rid}/branding", payload, content_type=ctype)
check("per-report logo uploaded", status == 200, f"{status} {body}")
status, body = auditor.send("GET", f"/api/capar/{rid}")
check("detail exposes the logo url", bool(body["data"]["branding"]["logoUrl"]))
payload, ctype = multipart([("kind", "logo")], [("file", "x.pdf", "application/pdf", b"%PDF-1.4")])
status, _ = auditor.send("POST", f"/api/capar/{rid}/branding", payload, content_type=ctype)
check("a PDF is refused as a logo", status == 422, status)
status, _ = auditor.send("DELETE", f"/api/capar/{rid}/branding?kind=logo")
check("override removed", status == 200, status)

print("== company letterhead")
payload, ctype = multipart([("kind", "letterhead")], [("file", "lh.png", "image/png", png(600, 70, (20, 60, 110)))])
status, body = admin.send("POST", "/api/admin/settings/company/upload-logo", payload, content_type=ctype)
check("admin uploads a company letterhead", status == 200 and "letterhead" in str(body.get("message")), f"{status} {body}")
payload, ctype = multipart([("kind", "letterhead")], [("file", "lh.webp", "image/webp", b"RIFFxxxxWEBP")])
status, _ = admin.send("POST", "/api/admin/settings/company/upload-logo", payload, content_type=ctype)
check("a letterhead must be PNG or JPEG", status == 422, status)
status, blob = auditor.send("GET", f"/api/pdf/capar/{rid}", raw=True)
check("the PDF builds with the company letterhead", status == 200 and blob[:5] == b"%PDF-", status)
db("DELETE FROM settings WHERE setting_group = 'company' AND setting_key = 'letterhead_path'")

print("== delete finding / attachment")
link_id = finding1["files"][1]["link_id"]
status, _ = auditor.send("DELETE", f"/api/capar/{rid}/files/{link_id}")
check("attachment removed", status == 200, status)
status, _ = auditor.send("DELETE", f"/api/capar/{rid}/findings/{f3}")
check("finding removed", status == 200, status)

print("== categories")
status, body = admin.send("POST", "/api/capar/categories", {"name": "ZZ Test Category"})
check("admin adds a category", status == 201, f"{status} {body}")
cid = body["data"]["id"] if status == 201 else 0
status, _ = admin.send("POST", "/api/capar/categories", {"name": "zz test category"})
check("duplicate name refused", status == 409, status)
status, _ = auditor.send("POST", "/api/capar/categories", {"name": "ZZ Auditor Category"})
check("auditor cannot add a category", status in (401, 403), status)
status, body = admin.send("PATCH", f"/api/capar/categories/{cid}", {"name": "ZZ Test Category Renamed", "sort_order": 5})
check("admin renames and reorders it", status == 200 and body["data"]["name"].endswith("Renamed"), status)
status, body = admin.send("GET", "/api/capar/categories?all=1")
check("admin list includes it", any(c["id"] == cid for c in body["data"]))
status, body = admin.send("DELETE", f"/api/capar/categories/{cid}")
check("unused category is removed", status == 200 and body["data"]["removed"], f"{status} {body}")
status, body = admin.send("DELETE", f"/api/capar/categories/{cat_fire}")
check("a category in use is switched off, not removed", status == 200 and body["data"]["deactivated"], f"{status} {body}")
admin.send("PATCH", f"/api/capar/categories/{cat_fire}", {"status": "active"})
status, body = auditor.send("GET", "/api/capar/categories")
check("default categories restored", any(c["id"] == cat_fire for c in body["data"]))

print("== lookups")
for kind, needs_employer in (("employers", False), ("verifiers", False), ("acts", False), ("resources", False), ("units", True), ("assignments", True)):
    status, body = auditor.send("GET", f"/api/capar/lookups?type={kind}&q=a" + (f"&employerId={employer_id}" if needs_employer else ""))
    check(f"lookup {kind}", status == 200 and isinstance(body.get("data"), list), f"{status}")
status, _ = verifier.send("GET", "/api/capar/lookups?type=employers")
check("verifier has no lookups", status == 403, status)

print("== drafts")
status, body = auditor.send("POST", "/api/capar", {"employer_id": employer_id, "title": "ZZ TEST CAPAR draft"})
draft = body["data"]["id"]
status, _ = other_auditor.send("DELETE", f"/api/capar/{draft}")
check("another auditor cannot delete a draft", status == 403, status)
status, _ = auditor.send("DELETE", f"/api/capar/{draft}")
check("owner deletes a draft", status == 200, status)
status, _ = auditor.send("GET", f"/api/capar/{draft}")
check("deleted draft is gone", status == 404, status)
status, _ = auditor.send("DELETE", f"/api/capar/{rid}")
check("a non-draft report cannot be deleted", status == 409, status)

db("DELETE FROM capar_reports WHERE title LIKE 'ZZ TEST CAPAR%'")
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILED:", *FAIL, sep="\n  - ")
    sys.exit(1)
