"""Groundwater NOC end-to-end check: register, conditions, meters and usage, access rules and the legal-register mirror.

    python scripts/verify-water-noc.py        (server on http://127.0.0.1:3001 with the demo data seeded)

Dates are relative to today so the 30-day usage figure is predictable. Test rows are removed at the end.
Exit code 1 if any check fails."""
import struct
import sys
import zlib
from datetime import date, timedelta

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db, multipart  # noqa: E402

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  ok  " if condition else "  FAIL") + f" {name}" + (f"  -> {detail}" if not condition and detail else ""))


def png():
    raw = b"".join(b"\x00" + bytes((30, 90, 160)) * 30 for _ in range(20))
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 30, 20, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def login(email, role):
    session = Session((email, PASSWORDS[role]))
    ok, detail = session.login()
    if not ok:
        sys.exit(f"cannot sign in as {email}: {detail}")
    return session


def cleanup():
    db("DELETE FROM water_meters WHERE name LIKE 'ZZ%'")
    db("DELETE FROM water_nocs WHERE noc_number LIKE 'ZZ-NOC%'")
    db("DELETE FROM compliance_documents WHERE document_number LIKE 'ZZ-NOC%'")


def day(offset):
    return (date.today() + timedelta(days=offset)).isoformat()


print("== set-up")
water = login("karthik.auditor@demo.complianceos.local", "auditor")      # Water auditor type
safety = login("priya.auditor@demo.complianceos.local", "auditor")       # Safety auditor type
employer = login("balaji.hr@demo.complianceos.local", "employer")
other_employer = login("kaveri.hr@demo.complianceos.local", "employer")
employee = login("employee.test@complianceos.local", "employee")
admin = login("demo.admin@complianceos.local", "admin")
employer_id = int(db("SELECT eu.employer_id FROM employer_users eu JOIN users u ON u.id = eu.user_id WHERE u.email = 'balaji.hr@demo.complianceos.local' LIMIT 1")[0][0])
cleanup()

print("== access")
status, _ = safety.send("GET", "/api/water-noc")
check("a non-water auditor cannot open the register", status == 403, status)
status, _ = safety.send("POST", "/api/water-noc", {"employer_id": employer_id, "noc_number": "ZZ-NOC-X", "approved_quantity_lpd": 1000})
check("a non-water auditor cannot add a NOC", status == 403, status)
status, _ = employee.send("GET", "/api/water-noc")
check("an employee has no access", status in (401, 403), status)
status, body = water.send("GET", "/api/water-noc")
check("the water auditor opens the register", status == 200 and isinstance(body.get("data"), list), status)

print("== create")
good = {"employer_id": employer_id, "noc_number": "ZZ-NOC-001", "approved_quantity_lpd": 100000, "purpose": "Domestic",
        "purpose_domestic_lpd": 36000, "purpose_gardening_lpd": 20000, "purpose_other_lpd": 44000,
        "issuing_authority": "Water Resources Department, Chennai", "issue_date": day(-120), "expiry_date": day(900),
        "well_type": "Bore well", "well_depth_m": 198, "well_diameter_in": 6.5, "pump_hp": 5, "pumping_hours_per_day": 6, "abstraction_structures": 1,
        "standard_conditions": True}
status, _ = water.send("POST", "/api/water-noc", {**good, "approved_quantity_lpd": None})
check("approved quantity is required", status == 422, status)
status, _ = water.send("POST", "/api/water-noc", {**good, "purpose_other_lpd": 99000})
check("purposes cannot exceed the approved quantity", status == 422, status)
status, _ = water.send("POST", "/api/water-noc", {**good, "expiry_date": day(-400)})
check("expiry before issue is refused", status == 422, status)
status, _ = water.send("POST", "/api/water-noc", {**good, "employer_id": 99999999})
check("unknown company refused", status in (400, 422), status)
status, body = water.send("POST", "/api/water-noc", good)
check("NOC recorded", status == 201, f"{status} {body}")
noc = body["data"]
nid = noc["id"]
status, _ = water.send("POST", "/api/water-noc", good)
check("same number for the same company is refused", status == 409, status)
check("title defaults from the number", "ZZ-NOC-001" in str(noc["title"]))

doc = db(f"SELECT document_type, compliance_status, document_number, expiry_date FROM compliance_documents WHERE id = {noc['document_id']}")
check("the NOC is mirrored into the legal register as an Approval", doc and doc[0][0] == "Approval" and doc[0][2] == "ZZ-NOC-001", doc)
check("legal register status is Valid", doc and doc[0][1] == "Valid", doc)

print("== detail and conditions")
status, body = water.send("GET", f"/api/water-noc/{nid}")
detail = body["data"]
check("detail opens", status == 200 and detail["noc"]["derived_status"] == "Valid", status)
check("18 standard conditions were added", len(detail["conditions"]) == 18, len(detail["conditions"]))
check("the water auditor can edit", detail["can"]["edit"] and not detail["can"]["delete"])
status, _ = water.send("POST", f"/api/water-noc/{nid}/conditions/standard", {})
check("standard conditions cannot be added twice", status == 409, status)
cid = detail["conditions"][2]["id"]
status, body = water.send("PATCH", f"/api/water-noc/{nid}/conditions/{cid}", {"compliance": "Compliant", "remarks": "Flow meter sealed on 12 March."})
check("a condition is ticked Compliant", status == 200 and body["data"]["compliance"] == "Compliant" and body["data"]["checked_by"], f"{status} {body}")
status, body = water.send("PATCH", f"/api/water-noc/{nid}/conditions/{detail['conditions'][10]['id']}", {"compliance": "Non-Compliant", "remarks": "No monitoring bore well yet."})
check("a condition is marked Non-Compliant", status == 200, status)
status, body = water.send("PATCH", f"/api/water-noc/{nid}/conditions/{cid}", {"compliance": "Not Checked"})
check("un-ticking clears who checked it", status == 200 and body["data"]["checked_by"] is None, body["data"].get("checked_by") if status == 200 else status)
status, _ = water.send("PATCH", f"/api/water-noc/{nid}/conditions/{cid}", {"compliance": "Maybe"})
check("an unknown state is refused", status == 422, status)
status, body = water.send("POST", f"/api/water-noc/{nid}/conditions", {"condition_text": "Display the NOC copy at the pump house.", "clause_no": "19"})
check("a custom condition is added", status == 201, status)
extra = body["data"]["id"]
status, _ = water.send("DELETE", f"/api/water-noc/{nid}/conditions/{extra}")
check("and removed", status == 200, status)

print("== meters and readings")
status, body = water.send("POST", f"/api/water-noc/{nid}/meters", {"name": "ZZ Borewell O/P (M1)", "source": "Borewell", "reading_unit": "KL"})
check("borewell meter added and counts toward the NOC by default", status == 201 and body["data"]["counts_toward_noc"] == 1, f"{status} {body}")
m1 = body["data"]["id"]
status, body = water.send("POST", f"/api/water-noc/{nid}/meters", {"name": "ZZ RO feed", "source": "RO Feed"})
check("RO feed meter does not count toward the NOC", status == 201 and body["data"]["counts_toward_noc"] == 0, status)
m2 = body["data"]["id"]
status, _ = water.send("POST", f"/api/water-noc/{nid}/meters", {"name": "x"})
check("a meter needs a proper name", status == 422, status)

# 595 KL every 7 days is 85 KLD, 85 percent of 100 KLD
points = [(-30, 5000), (-23, 5595), (-16, 6190), (-9, 6785), (-2, 7380)]
for offset, value in points:
    status, body = water.send("POST", f"/api/water-noc/{nid}/meters/{m1}/readings", {"reading_date": day(offset), "reading_value": value})
    check(f"reading {value} on day {offset} recorded", status == 201, f"{status} {body.get('message')}")
status, _ = water.send("POST", f"/api/water-noc/{nid}/meters/{m1}/readings", {"reading_date": day(-16), "reading_value": 6200})
check("a second reading on the same day is refused", status == 409, status)
status, body = water.send("POST", f"/api/water-noc/{nid}/meters/{m1}/readings", {"reading_date": day(0), "reading_value": 7000})
check("a reading below the previous one is refused", status == 422 and "lower than the previous" in str(body.get("message")), f"{status} {body.get('message')}")
status, _ = water.send("POST", f"/api/water-noc/{nid}/meters/{m1}/readings", {"reading_date": day(3), "reading_value": 7500})
check("a reading dated in the future is refused", status == 422, status)
status, _ = water.send("POST", f"/api/water-noc/{nid}/meters/{m1}/readings", {"reading_date": day(-12), "reading_value": 9999})
check("a reading above the later one is refused", status == 422, status)
status, _ = water.send("POST", f"/api/water-noc/{nid}/meters/{m1}/readings", {"reading_date": day(-5), "reading_value": -3})
check("a negative reading is refused", status == 422, status)

status, body = water.send("GET", f"/api/water-noc/{nid}")
usage = body["data"]["usage"]
check("recent usage is 85 KLD (28 of 30 days measured)", abs(usage["recent"]["avgKld"] - 85) < 0.01, usage["recent"])
check("85 percent of the approved 100 KLD", abs(usage["recent"]["percent"] - 85) < 0.01, usage["recent"]["percent"])
check("status is Within limit", usage["recent"]["status"] == "Within limit", usage["recent"]["status"])
check("monthly figures exist", len(usage["months"]) >= 1 and all("avgKld" in m for m in usage["months"]))

# the last two days at 120 KLD: 7380 -> 7620
status, _ = water.send("POST", f"/api/water-noc/{nid}/meters/{m1}/readings", {"reading_date": day(0), "reading_value": 7620})
status, body = water.send("GET", f"/api/water-noc/{nid}")
recent = body["data"]["usage"]["recent"]
check("two heavy days lift the 30-day average to 87.33 KLD", abs(recent["avgKld"] - 87.3333) < 0.01, recent["avgKld"])

# push it over the limit with another meter feeding the same NOC
status, body = water.send("POST", f"/api/water-noc/{nid}/meters", {"name": "ZZ Borewell 2", "source": "Borewell"})
m3 = body["data"]["id"]
for offset, value in ((-30, 0), (-2, 840)):       # 840 KL over 28 days = 30 KLD
    water.send("POST", f"/api/water-noc/{nid}/meters/{m3}/readings", {"reading_date": day(offset), "reading_value": value})
status, body = water.send("GET", f"/api/water-noc/{nid}")
combined = body["data"]["usage"]["recent"]
check("a second source meter is added day by day (about 115 KLD)", 110 < combined["avgKld"] < 120, combined["avgKld"])
check("and the NOC is now Over limit", combined["status"] == "Over limit", combined["status"])
water.send("PATCH", f"/api/water-noc/{nid}/meters/{m3}", {"counts_toward_noc": False})
status, body = water.send("GET", f"/api/water-noc/{nid}")
check("switching it off the NOC returns to Within limit", body["data"]["usage"]["recent"]["status"] == "Within limit", body["data"]["usage"]["recent"]["status"])

# meter reset
status, _ = water.send("POST", f"/api/water-noc/{nid}/meters/{m1}/readings", {"reading_date": day(-1), "reading_value": 15, "is_reset": True})
check("a meter reset reading may be lower", status == 201, status)
status, body = water.send("GET", f"/api/water-noc/{nid}")
check("the interval across a reset is not counted", body["data"]["usage"]["recent"]["days"] <= 29, body["data"]["usage"]["recent"]["days"])
status, body = water.send("GET", f"/api/water-noc/{nid}")
reading_id = next(r["id"] for r in body["data"]["readings"] if r["is_reset"])
status, _ = water.send("DELETE", f"/api/water-noc/{nid}/readings/{reading_id}")
check("a wrong reading is deleted", status == 200, status)
last = next(r for r in body["data"]["readings"] if r["meter_id"] == m1 and r["reading_date"] == day(0))
status, _ = water.send("PATCH", f"/api/water-noc/{nid}/readings/{last['id']}", {"reading_value": 7640, "remarks": "corrected"})
check("a reading is corrected", status == 200, status)

print("== list")
status, body = water.send("GET", "/api/water-noc?search=ZZ-NOC-001")
row = next((r for r in body["data"] if r["id"] == nid), None)
check("the list shows the NOC with its usage", bool(row) and row["usage_status"] == "Within limit" and row["avg_kld_30"] is not None, row and (row.get("usage_status"), row.get("avg_kld_30")))
check("and the condition counts", bool(row) and int(row["conditions_total"]) == 18 and int(row["conditions_non_compliant"]) == 1, row and row.get("conditions_total"))

print("== NOC letter")
payload, ctype = multipart([], [("file", "noc-letter.png", "image/png", png())])
status, body = water.send("POST", f"/api/water-noc/{nid}/file", payload, content_type=ctype)
check("the NOC letter is attached", status == 201, f"{status} {body}")
status, body = water.send("GET", f"/api/water-noc/{nid}")
file_url = body["data"]["fileUrl"]
check("the detail links the file", bool(file_url))
status, blob = water.send("GET", file_url, raw=True)
check("the auditor opens the NOC letter", status == 200 and blob[:4] == b"\x89PNG", status)
status, _ = employer.send("GET", file_url, raw=True)
check("the company opens its own NOC letter", status == 200, status)
status, _ = other_employer.send("GET", file_url, raw=True)
check("another company cannot", status in (403, 404), status)
doc = db(f"SELECT file_id FROM compliance_documents WHERE id = {noc['document_id']}")
check("the legal register row carries the file", doc and doc[0][0] not in ("NULL", ""), doc)

print("== employer view")
status, body = employer.send("GET", "/api/water-noc")
check("the company sees its NOC", status == 200 and any(r["id"] == nid for r in body["data"]), status)
status, body = other_employer.send("GET", "/api/water-noc")
check("another company does not", status == 200 and not any(r["id"] == nid for r in body["data"]), status)
status, body = employer.send("GET", f"/api/water-noc/{nid}")
check("the company opens the detail read-only", status == 200 and not body["data"]["can"]["edit"], status)
status, _ = other_employer.send("GET", f"/api/water-noc/{nid}")
check("another company gets 404", status == 404, status)
status, _ = employer.send("POST", "/api/water-noc", good)
check("an employer cannot add a NOC", status == 403, status)
status, _ = employer.send("PATCH", f"/api/water-noc/{nid}", {"notes": "x"})
check("an employer cannot change one", status == 403, status)
status, _ = employer.send("POST", f"/api/water-noc/{nid}/meters/{m1}/readings", {"reading_date": day(-4), "reading_value": 7500})
check("an employer cannot enter readings", status == 403, status)
status, _ = safety.send("GET", f"/api/water-noc/{nid}")
check("a non-water auditor cannot open it", status == 403, status)

print("== pdf")
status, blob = water.send("GET", f"/api/pdf/water-noc/{nid}", raw=True)
check("the water auditor downloads the NOC report", status == 200 and blob[:5] == b"%PDF-" and len(blob) > 3000, f"{status} {len(blob)}")
status, blob = employer.send("GET", f"/api/pdf/water-noc/{nid}", raw=True)
check("the company downloads its own NOC report", status == 200 and blob[:5] == b"%PDF-", status)
status, _ = other_employer.send("GET", f"/api/pdf/water-noc/{nid}", raw=True)
check("another company cannot", status == 404, status)
status, _ = safety.send("GET", f"/api/pdf/water-noc/{nid}", raw=True)
check("a non-water auditor cannot", status == 403, status)

print("== update and status")
status, body = water.send("PATCH", f"/api/water-noc/{nid}", {"expiry_date": day(-5), "issue_date": day(-1100)})
check("NOC updated", status == 200, f"{status} {body}")
status, body = water.send("GET", f"/api/water-noc/{nid}")
check("an expiry in the past reads Expired", body["data"]["noc"]["derived_status"] == "Expired", body["data"]["noc"]["derived_status"])
doc = db(f"SELECT compliance_status FROM compliance_documents WHERE id = {noc['document_id']}")
check("the legal register follows", doc and doc[0][0] == "Expired", doc)
water.send("PATCH", f"/api/water-noc/{nid}", {"expiry_date": day(60)})
status, body = water.send("GET", f"/api/water-noc/{nid}")
check("expiring within 90 days reads Expiring Soon", body["data"]["noc"]["derived_status"] == "Expiring Soon", body["data"]["noc"]["derived_status"])
status, _ = water.send("PATCH", f"/api/water-noc/{nid}", {"noc_number": ""})
check("the number cannot be blanked", status == 422, status)

print("== lookups")
status, body = water.send("GET", "/api/water-noc/lookups?type=employers&q=a")
check("employers lookup", status == 200 and isinstance(body["data"], list) and body["data"], status)
status, body = water.send("GET", f"/api/water-noc/lookups?type=units&employerId={employer_id}")
check("units lookup", status == 200, status)
status, _ = employer.send("GET", "/api/water-noc/lookups?type=employers")
check("an employer has no lookups", status == 403, status)

print("== delete")
status, _ = water.send("DELETE", f"/api/water-noc/{nid}")
check("the water auditor cannot delete a NOC", status == 403, status)
status, _ = water.send("DELETE", f"/api/water-noc/{nid}/meters/{m2}")
check("but can remove a meter", status == 200, status)
status, _ = admin.send("DELETE", f"/api/water-noc/{nid}")
check("an administrator deletes it", status == 200, status)
doc = db(f"SELECT deleted_at FROM compliance_documents WHERE id = {noc['document_id']}")
check("its legal-register row is removed too", doc and doc[0][0] not in ("NULL", ""), doc)
status, _ = water.send("GET", f"/api/water-noc/{nid}")
check("the deleted NOC is gone", status == 404, status)

cleanup()
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILED:", *FAIL, sep="\n  - ")
    sys.exit(1)
