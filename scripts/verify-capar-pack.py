"""Act library, CAPAR item form and employer document pack, with every role.

    python scripts/verify-capar-pack.py       (server on http://127.0.0.1:3001, `seed-demo.py evidence` run)

Test rows are removed at the end. Exit code 1 if any check fails."""
import sys

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db, multipart  # noqa: E402

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  ok  " if condition else "  FAIL") + f" {name}" + (f"  -> {detail}" if not condition and detail else ""))


def login(email, role):
    s = Session((email, PASSWORDS[role]))
    ok, detail = s.login()
    if not ok:
        sys.exit(f"cannot sign in as {email}: {detail}")
    return s


def data(r):
    return (r[1] or {}).get("data") if isinstance(r[1], dict) else None


admin = login("demo.admin@complianceos.local", "admin")
priya = login("priya.auditor@demo.complianceos.local", "auditor")
karthik = login("karthik.auditor@demo.complianceos.local", "auditor")
verifier = login("verifier.test@complianceos.local", "verifier")
balaji = login("balaji.hr@demo.complianceos.local", "employer")     # employer 2
kaveri = login("kaveri.hr@demo.complianceos.local", "employer")     # employer 3
employee = login("employee.test@complianceos.local", "employee")

ACT = int(db("SELECT id FROM compliance_acts WHERE deleted_at IS NULL ORDER BY id LIMIT 1")[0][0])
P = f"/api/admin/compliance/acts/{ACT}/provisions"
priya_id = int(db("SELECT id FROM auditors WHERE email = 'priya.auditor@demo.complianceos.local'")[0][0])
karthik_id = int(db("SELECT id FROM auditors WHERE email = 'karthik.auditor@demo.complianceos.local'")[0][0])
sections_all = [int(r[0]) for r in db("SELECT id FROM evidence_sections WHERE deleted_at IS NULL")]

db("DELETE FROM capar_reports WHERE title LIKE 'ZZ TEST%'")
db("DELETE FROM act_provisions WHERE title LIKE 'ZZ TEST%'")
db("DELETE FROM evidence_sections WHERE name LIKE 'ZZ TEST%'")
db("DELETE FROM evidence_submissions WHERE employer_id = 3")
db("DELETE FROM employer_evidence WHERE employer_id = 3")

print("== act library")
status, body = admin.send("POST", P, {"kind": "Chapter", "number": "ZZ-IV", "title": "ZZ TEST Chapter Welfare", "explanation": "Welfare duties."})
ch = (data((status, body)) or {}).get("id")
check("an administrator adds a chapter", status == 201 and ch, f"{status} {body}")
status, body = admin.send("POST", P, {"kind": "Section", "parent_id": ch, "number": "ZZ-46", "title": "ZZ TEST Canteens", "explanation": "A canteen is required where 250 workers are employed.",
                                    "amendments": [{"amended_on": "2020-03-01", "reference": "Act 12 of 2020", "description": "Threshold changed"}]})
sec = (data((status, body)) or {}).get("id")
check("a section is added under the chapter with an amendment", status == 201 and sec, f"{status} {body}")
status, body = admin.send("POST", P, {"kind": "Sub Section", "parent_id": sec, "number": "(1)", "title": "ZZ TEST Canteen size", "explanation": "Sufficient dining space."})
sub = (data((status, body)) or {}).get("id")
check("a sub section is added under the section", status == 201 and sub)
check("a sub section needs a section", admin.send("POST", P, {"kind": "Sub Section", "title": "ZZ TEST orphan"})[0] == 422)
check("a section cannot sit under a section", admin.send("POST", P, {"kind": "Section", "parent_id": sec, "title": "ZZ TEST bad"})[0] == 422)
check("a chapter cannot have a parent", admin.send("POST", P, {"kind": "Chapter", "parent_id": ch, "title": "ZZ TEST bad"})[0] == 422)
check("a title is required", admin.send("POST", P, {"kind": "Chapter", "title": ""})[0] == 422)
tree = data(admin.send("GET", P)) or {}
mine = next((n for n in tree.get("tree", []) if n["id"] == ch), None)
check("the tree nests chapter > section > sub section", bool(mine) and mine["children"][0]["id"] == sec and mine["children"][0]["children"][0]["id"] == sub)
check("amendments come back with the section", mine and mine["children"][0]["amendments"][0]["reference"] == "Act 12 of 2020")
check("a section can be edited", admin.send("PUT", f"{P}/{sec}", {"kind": "Section", "parent_id": ch, "number": "ZZ-46", "title": "ZZ TEST Canteens (edited)", "amendments": []})[0] == 200)
check("editing replaces the amendments", (data(admin.send("GET", P)) or {})["tree"][[n["id"] for n in data(admin.send("GET", P))["tree"]].index(ch)]["children"][0]["amendments"] == [])
check("a provision cannot move under its own descendant", admin.send("PUT", f"{P}/{sec}", {"kind": "Section", "parent_id": sub, "title": "ZZ TEST loop"})[0] == 422)
check("an auditor cannot edit the Act library", priya.send("POST", P, {"kind": "Chapter", "title": "ZZ TEST no"})[0] in (401, 403))
check("an employer cannot edit the Act library", balaji.send("POST", P, {"kind": "Chapter", "title": "ZZ TEST no"})[0] in (401, 403))
look = priya.send("GET", "/api/capar/lookups?type=provisions&q=ZZ%20TEST%20Canteens")
hits = (look[1] or {}).get("data", [])
check("an auditor searches the library and gets the path and the text", look[0] == 200 and any("Canteens" in h["hint"] and h["label"].count(" > ") == 2 for h in hits), str(look[1])[:200])
check("search matches words in the explanation", any(h["value"] == str(sub) and h.get("text") for h in (priya.send("GET", "/api/capar/lookups?type=provisions&q=dining")[1] or {}).get("data", [])))
check("an employer cannot search CAPAR lookups", balaji.send("GET", "/api/capar/lookups?type=provisions&q=canteen")[0] in (401, 403))

print("== document pack: checklist and access")
tmpl = data(admin.send("GET", "/api/evidence/template")) or []
check("the admin sees the seeded checklist", len(tmpl) >= 8 and sum(len(s["items"]) for s in tmpl) >= 250, str(len(tmpl)))
check("an employer cannot read the template admin route", balaji.send("GET", "/api/evidence/template")[0] in (401, 403))
check("an auditor cannot add a section", priya.send("POST", "/api/evidence/template/sections", {"name": "ZZ TEST x"})[0] in (401, 403))
status, body = admin.send("POST", "/api/evidence/template/sections", {"name": "ZZ TEST Section"})
zs = (data((status, body)) or {}).get("id")
check("the admin adds a section", status == 201 and zs)
status, body = admin.send("POST", "/api/evidence/template/items", {"section_id": zs, "name": "ZZ TEST Licence copy", "group_name": "ZZ group"})
zi = (data((status, body)) or {}).get("id")
check("the admin adds a document", status == 201 and zi)
check("a document needs a real section", admin.send("POST", "/api/evidence/template/items", {"section_id": 99999999, "name": "ZZ TEST nope"})[0] == 422)
check("a document needs a name", admin.send("POST", "/api/evidence/template/items", {"section_id": zs, "name": ""})[0] == 422)
check("the admin can edit a document", admin.send("PUT", f"/api/evidence/template/items/{zi}", {"section_id": zs, "name": "ZZ TEST Licence copy 2", "status": "active"})[0] == 200)
auditors = data(admin.send("GET", "/api/evidence/access")) or []
check("the admin lists auditors with their section counts", any(a["id"] == priya_id for a in auditors))
access = data(admin.send("GET", f"/api/evidence/access/{priya_id}")) or []
check("access lists each section with a granted flag", len(access) >= 8 and any(a["granted"] for a in access) and any(a["name"] == "ZZ TEST Section" for a in access))
check("an auditor cannot change access", priya.send("PUT", f"/api/evidence/access/{priya_id}", {"section_ids": []})[0] in (401, 403))
check("an employer cannot read access", balaji.send("GET", "/api/evidence/access")[0] in (401, 403))

print("== employer fills its pack")
ck = data(balaji.send("GET", "/api/evidence/employers/me")) or {}
check("an employer opens its own checklist", ck.get("employer", {}).get("id") == 2 and ck["summary"]["total"] >= 250 and ck["can"]["edit"], str(ck.get("summary")))
sec0 = ck["sections"][0]
item0 = sec0["items"][0]
IT = f"/api/evidence/employers/2/items/{item0['id']}"
check("an invalid status is refused", balaji.send("PUT", IT, {"status": "Done"})[0] == 422)
check("a bad validity date is refused", balaji.send("PUT", IT, {"status": "Provided", "valid_until": "tomorrow"})[0] == 422)
check("an employer saves a document with reference, validity and notes", balaji.send("PUT", IT, {"status": "Provided", "reference_no": "TPR-11546", "valid_until": "2027-03-31", "notes": "Renewed in March"})[0] == 200)
ck = data(balaji.send("GET", "/api/evidence/employers/me"))
saved = next(i for s in ck["sections"] for i in s["items"] if i["id"] == item0["id"])
check("what was saved comes back", saved["status"] == "Provided" and saved["reference_no"] == "TPR-11546" and saved["valid_until"] == "2027-03-31" and saved["notes"] == "Renewed in March" and saved["updated_at"])
item1 = sec0["items"][1]
payload, ctype = multipart([], [("files", "licence.pdf", "application/pdf", b"%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF")])
status, body = balaji.send("POST", f"/api/evidence/employers/2/items/{item1['id']}/files", payload, content_type=ctype)
check("a file can be attached", status == 201, f"{status} {str(body)[:200]}")
ck = data(balaji.send("GET", "/api/evidence/employers/me"))
att = next(i for s in ck["sections"] for i in s["items"] if i["id"] == item1["id"])
check("attaching a file marks a pending document Provided", att["status"] == "Provided" and len(att["files"]) == 1 and att["files"][0]["name"] == "licence.pdf")
fid = att["files"][0]["id"]
check("the employer can download its file", balaji.send("GET", f"/api/files/{fid}/download", raw=True)[0] == 200)
check("another company cannot read the checklist", kaveri.send("GET", "/api/evidence/employers/2")[0] == 404)
check("another company cannot change the checklist", kaveri.send("PUT", IT.replace("/employers/2/", "/employers/2/"), {"status": "Pending"})[0] == 404)
check("an employee has no access", employee.send("GET", "/api/evidence/employers/me")[0] in (401, 403))
check("a file can be removed", balaji.send("DELETE", f"/api/evidence/employers/2/items/{item1['id']}/files/{fid}")[0] == 200)
check("an empty submission is refused for a company with nothing marked", kaveri.send("POST", "/api/evidence/employers/me/submit", {})[0] == 422)

print("== submission")
status, body = balaji.send("POST", "/api/evidence/employers/me/submit", {"note": "ZZ TEST pack"})
sub1 = (data((status, body)) or {}).get("id")
check("the employer submits the pack", status == 201 and sub1, f"{status} {body}")
ck = data(balaji.send("GET", "/api/evidence/employers/me"))
check("the submission records date and time", ck["latest"]["id"] == sub1 and len(ck["latest"]["submitted_at"]) == 19 and ck["latest"]["provided_items"] >= 1)
check("nothing has changed since the submission", ck["changed_since_submission"] is False)
balaji.send("PUT", IT, {"status": "Provided", "reference_no": "TPR-11546-B"})
check("a change after submitting is flagged", data(balaji.send("GET", "/api/evidence/employers/me"))["changed_since_submission"] is True)
check("the employer lists its submissions", len(data(balaji.send("GET", "/api/evidence/employers/me/submissions")) or []) >= 1)

print("== auditor view and the CAPAR gate")
check("an auditor with sections reads the checklist read-only", (lambda r: r[0] == 200 and data(r)["can"]["edit"] is False and len(data(r)["sections"]) >= 8)(priya.send("GET", "/api/evidence/employers/2")))
check("an auditor cannot change the employer's documents", priya.send("PUT", IT, {"status": "Pending"})[0] in (401, 403))
check("an auditor cannot submit for an employer", priya.send("POST", "/api/evidence/employers/2/submit", {})[0] in (401, 403))
aud = data(priya.send("GET", "/api/evidence/auditor/employers")) or {}
row2 = next((e for e in aud.get("employers", []) if e["id"] == 2), None)
check("the auditor list shows the latest submission and no download yet", bool(row2) and row2["latest"]["id"] == sub1 and row2["downloaded_at"] is None, str(row2))
status, body = priya.send("POST", "/api/capar", {"employer_id": 2, "title": "ZZ TEST CAPAR gate"})
check("a CAPAR cannot be started before the pack is downloaded", status == 409 and "Download" in str(body), f"{status} {str(body)[:200]}")
pdf = priya.send("GET", f"/api/pdf/evidence-pack/{sub1}", raw=True)
check("the auditor downloads the pack as a PDF", pdf[0] == 200 and pdf[1][:4] == b"%PDF" and len(pdf[1]) > 2000, f"{pdf[0]} {len(pdf[1])}")
check("the download is recorded", int(db(f"SELECT COUNT(*) FROM evidence_pack_downloads WHERE submission_id = {sub1} AND auditor_id = {priya_id}")[0][0]) == 1)
status, body = priya.send("POST", "/api/capar", {"employer_id": 2, "title": "ZZ TEST CAPAR gate"})
rid = (data((status, body)) or {}).get("id")
check("after the download the CAPAR can be started", status in (200, 201) and rid, f"{status} {str(body)[:200]}")
check("another auditor is still held up", karthik.send("POST", "/api/capar", {"employer_id": 2, "title": "ZZ TEST CAPAR gate 2"})[0] == 409)
status, body = priya.send("POST", "/api/capar", {"employer_id": 3, "title": "ZZ TEST CAPAR none"})
check("a company that has submitted nothing blocks the CAPAR with a clear reason", status == 409 and "not submitted" in str(body), f"{status} {str(body)[:200]}")
check("the administrator is never held up", (lambda r: r[0] in (200, 201))(admin.send("POST", "/api/capar", {"employer_id": 3, "title": "ZZ TEST CAPAR admin", "auditor_id": priya_id})))
balaji.send("POST", "/api/evidence/employers/me/submit", {"note": "ZZ TEST second"})
status, body = priya.send("POST", "/api/capar", {"employer_id": 2, "title": "ZZ TEST CAPAR gate 3"})
check("a newer submission must be downloaded again", status == 409, f"{status}")
admin.send("PUT", f"/api/evidence/access/{karthik_id}", {"section_ids": []})
check("an auditor given no sections has nothing to download and is not held up", karthik.send("POST", "/api/capar", {"employer_id": 3, "title": "ZZ TEST CAPAR k"})[0] in (200, 201))
check("an auditor given no sections gets no checklist and no PDF", len(data(karthik.send("GET", "/api/evidence/employers/2"))["sections"]) == 0 and karthik.send("GET", f"/api/pdf/evidence-pack/{sub1}", raw=True)[0] == 403)
admin.send("PUT", f"/api/evidence/access/{karthik_id}", {"section_ids": sections_all})
admin.send("PUT", f"/api/evidence/access/{priya_id}", {"section_ids": sections_all[:1]})
narrow = data(priya.send("GET", "/api/evidence/employers/2"))
check("an auditor with one section sees only that section", len(narrow["sections"]) == 1 and narrow["sections"][0]["id"] == sections_all[0])
admin.send("PUT", f"/api/evidence/access/{priya_id}", {"section_ids": sections_all})
check("an employee cannot download a pack", employee.send("GET", f"/api/pdf/evidence-pack/{sub1}", raw=True)[0] in (401, 403))
check("an employer cannot download another company's pack", kaveri.send("GET", f"/api/pdf/evidence-pack/{sub1}", raw=True)[0] == 404)
check("a verifier has no access", verifier.send("GET", "/api/evidence/employers/2")[0] in (401, 403))

print("== CAPAR item form")
db("DELETE FROM evidence_pack_downloads WHERE auditor_id = %d" % priya_id)
latest = data(balaji.send("GET", "/api/evidence/employers/me"))["latest"]["id"]
priya.send("GET", f"/api/pdf/evidence-pack/{latest}", raw=True)
status, body = priya.send("POST", "/api/capar", {"employer_id": 2, "title": "ZZ TEST CAPAR item form"})
rid = (data((status, body)) or {}).get("id")
check("a report for the item-form checks", rid)
F = f"/api/capar/{rid}/findings"
status, body = priya.send("POST", F, {"outcome": "Violation", "provision_id": sec, "act_rule": "ZZ path", "minimum_requirement": "Provide a canteen", "finding": "No canteen", "item_status": "Verified"})
check("a violation cannot be Verified until it is complete", status == 422 and any(i["field"] == "root_cause" for i in (body.get("errors") or [])), f"{status} {str(body)[:300]}")
status, body = priya.send("POST", F, {"outcome": "Violation", "provision_id": 99999999, "finding": "x"})
check("an unknown Act provision is refused", status == 400, f"{status}")
status, body = priya.send("POST", F, {"outcome": "Violation", "provision_id": sec, "act_rule": "ZZ path", "minimum_requirement": "Provide a canteen", "finding": "No canteen", "root_cause": "Space",
                                    "action_plan": "Build one", "timeline_date": "2027-01-31", "compliance_note": "Under construction", "recommendation": "Provide a canteen", "assessment": "Will re-check in March",
                                    "item_status": "Verified"})
fid1 = (data((status, body)) or {}).get("id")
check("a complete row can be Verified", status == 201 and fid1, f"{status} {str(body)[:300]}")
row = db(f"SELECT item_status, signed_by, signed_at, provision_id, compliance_note, recommendation, assessment FROM capar_findings WHERE id = {fid1}")[0]
check("signing off records who and when", row[0] == "Verified" and row[1] and row[2] != "NULL")
check("provision, compliance, recommendation and assessment are saved", row[3] == str(sec) and row[4] == "Under construction" and row[5] == "Provide a canteen" and row[6] == "Will re-check in March")
check("moving a row back to Incomplete clears the sign-off", priya.send("PATCH", f"{F}/{fid1}", {"item_status": "Incomplete"})[0] == 200 and db(f"SELECT signed_by FROM capar_findings WHERE id = {fid1}")[0][0] == "NULL")
status, body = priya.send("POST", F, {"outcome": "Violation", "item_status": "Not findings", "minimum_requirement": "Fire exits clear"})
fid2 = (data((status, body)) or {}).get("id")
check("Not findings makes the result No Violation", status == 201 and db(f"SELECT outcome FROM capar_findings WHERE id = {fid2}")[0][0] == "No Violation")
check("a new row starts Incomplete", db(f"SELECT item_status FROM capar_findings WHERE id = {priya.send('POST', F, {'outcome': 'Violation', 'finding': 'plain'})[1]['data']['id']}")[0][0] == "Incomplete")
detail = data(priya.send("GET", f"/api/capar/{rid}")) or {}
check("the report detail carries the new fields", all("item_status" in f and "assessment" in f and "signed_by" in f for f in detail.get("findings", [])))
pdf = priya.send("GET", f"/api/pdf/capar/{rid}", raw=True)
check("the CAPAR PDF still builds with the new fields", pdf[0] == 200 and pdf[1][:4] == b"%PDF", str(pdf[0]))

db("DELETE FROM capar_reports WHERE title LIKE 'ZZ TEST%'")
db("DELETE FROM act_provisions WHERE title LIKE 'ZZ TEST%'")
db("DELETE FROM evidence_sections WHERE name LIKE 'ZZ TEST%'")
db("DELETE FROM evidence_submissions WHERE note LIKE 'ZZ TEST%'")
db("DELETE FROM employer_evidence WHERE employer_id = 3")
# leave the demo company with a clean, submitted pack again
db("DELETE FROM evidence_submissions WHERE employer_id = 2")
db("DELETE FROM employer_evidence WHERE employer_id = 2")
from seed_common import ensure_pack  # noqa: E402
ensure_pack(priya, 2)
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
