"""The client's seven Permit to Work forms ("PTW's .pdf", "Please don't change any content"), end to end through the API.

    python scripts/verify-ptw-forms.py      (server on http://127.0.0.1:3001 with the demo data seeded; run scripts/install-ptw-forms.py first)

Every permit of scripts/forms_catalogue_ptw.py is built as a throw-away module, so the check does not depend on which permits already carry records:
the blank form downloads as PDF and Word and the Word file carries the client's lines word for word (misspellings included); an auditor starts the
permit, fills every field, submits it and the PDF prints; the installed permits of the platform are the client's (names, no leftover short
versions). Test rows are removed at the end. Exit code 1 if any check fails."""
import io
import re
import sys
import zipfile

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db  # noqa: E402
from forms_catalogue_ptw import PTW_CATALOGUE  # noqa: E402

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  ok  " if condition else "  FAIL") + f" {name}" + (f"  -> {detail}" if not condition and detail else ""))


def login(email, role):
    session = Session((email, PASSWORDS[role]))
    ok, detail = session.login()
    if not ok:
        sys.exit(f"cannot sign in as {email}: {detail}")
    return session


def sql(text_):
    return text_.replace("'", "''")


def squash(text_):
    return re.sub(r"\s+", " ", text_).lower()


def docx_text(blob):
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    text_ = re.sub(r"<[^>]+>", " ", re.sub(r"</w:p>", "\n", xml))
    return text_.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'")


# permit -> lines of the client's PDF that must be on the permit (the client's spelling kept)
COMMON = ["PTW Ref .No", "Project Name", "Starting From Date", "Work Description", "Location of job to be performed", "Identify risk associated",
          "The following areas / items have been inspected by issuer and receiver", "PPE Required for the activity",
          "Issue and acceptance before work", "Acceptance of Work Permission by the person in-charge (Receiver)", "Permit Receiver Name",
          "Authority to proceed by authorized person (Issuer)", "Permit Issuer Name", "Acknowledge by Contractor's Safety Engineer/Officer",
          "Verification by SEC Consultant (If appointed for the project)", "Clearance and cancellation after work or Suspension of permit", "Clearance. (Site Manager)",
          "Suspension", "will not deflect any of them", "this permit is suspended, I have notified the Authorized person specified that the work is not complete the area / equipment is not safe to use.",
          "List of additional precaution measures required (SEC Consultant/ Contractor's Safety Engineer/ Officer)"]
REVALIDATION = ["Permit Re-Validation", "Issuer Signature", "Receiver Signature", "Contractor's Safety Signature", "This permit is valid for 7 days from the date of issue."]
LINES = {
    "Cold Work Permit": COMMON + REVALIDATION + ["Precaution require to complete the work safely", "Activity", "Tool/Equipment to be used", "Identify risk associated with this Cold Work", "Faulty Tool/ Material", "Poor Illumination",
                                                 "Have tools and devices to be used been tested and adjusted?", "Have all hazards/hazardous related to the this activities identified and assessed?",
                                                 "Saw/Cold cut", "Are permits associated require for this activity? if yes, mentioned below;", "Confined Space to Entry", "Hand Tools",
                                                 "I am aware of the risks that can be exposed to.", "housekeeping etc under my charge"],
    "Confined Space to Entry Permit": COMMON + ["Precaution require to complete the work safely", "Contractor Name", "Expected Completion Time", "Identify risk associated with this confined space entry", "Lack of Oxygen", "Engulfment",
                                                "Are atmospheric inspection made?", "Oxygen % (19.5 - 23.5 %)", "Explosive % LEL (Less than 10%)", "CO PPM (less than 35 PPM -8hr)",
                                                "H2S PPM (less than 10PPM - 8hr)", "Has appropriate ventilation provided after atmospheric inspection made?", "Mechanical (state details)",
                                                "Is appropriate communication system in place? if yes, state", "Are entrant and attendant very well known about emergency procedure?",
                                                "Does the work require access to hot work? If yes, obtain a Hot work permit", "If required, lockout /Tagout system is followed?",
                                                "Contact Numbers", "Fire Extinguisher Type", "Log book register", "Gas Detector", "Safety Harness", "Gumboot",
                                                "I have been informed about the risk assessment results.", "housekeeping etc. under my charge",
                                                "Supervisor Name", "Permit Ref. No", "Entry Conditions", "Confined Space Permit must be in place", "If you fit for work (health fitness)",
                                                "If you have adequate/appropriate PPE", "Time in", "Time Out", "Details of Entrants", "Entrant Name", "ID No", "Designation",
                                                "Details of Attendants", "Attendant Name"],
    "Electrical (Isolation) Permit": COMMON + REVALIDATION + ["Precaution require to complete the work safely", "Number of Employees", "Energized Lines/Equipment", "De-Energized Line/ Equipment", "Tool/Equipments to be used",
                                                              "Identify risk associated with this Electrical work", "Arc Flash", "Electric Burn", "Near Overhead lines",
                                                              "Is the safe distance maintained?", "Voltage", "Distance", "Does the work require access to confined spaces? If yes, obtain a confined space entry permit",
                                                              "Have all possible sources of electrical power been isolated, locked and properly tagged (LOTO)?",
                                                              "Is below mentioned any one of Isolation in place and the isolation followed as per procedure?", "Switch Out", "Lockout/ Tag out", "No. of Locks",
                                                              "Has it been confirmed by testing, that the lines / equipment are de-energized ?", "Danger/Waning Sign", "Portable Radio", "Electrical Gloves",
                                                              "Arc flash PPE", "Half Mask"],
    "Excavation Permit": COMMON + REVALIDATION + ["Precaution require to complete the work safely", "No. of Employee involved", "Excavation / Trench Depth", "Length", "Width", "Identify risk associated this Excavation", "Personnel Falling",
                                                  "Cave in (Collapse)", "Adjacent Structure", "Is method statement attached with this permit?", "Is risk assessment attached with this permit?",
                                                  "Are the equipments/machineries inspected and valid certification available for equipment & operator ?",
                                                  "Is the hard barrier given and safe distance (at least 1 meter from the edge of excavation) maintained?",
                                                  "Are type of soil identified? if yes mention below", "Stable Rock", "Type A", "Type C",
                                                  "Will the excavation be 5 or more feet deep and will personnel be entering? If yes, state below the control measures been implemented:",
                                                  "Shoring", "Shielding", "Benching", "Sloping", "Will the excavation be 20 or more feet deep? If yes, Name of Professional Engineer",
                                                  "Are underground utilities checked below by means of appropriate detector through as build drawings, and marked accordingly at the work location",
                                                  "Storm water", "Gas Line", "If underground utlities found, trial hole system (manual digging) is followed?",
                                                  "Are adequate inspection system followed for during, after excavation and backfilling?", "Lighting/Flickering", "Flag man", "Detector (multi)",
                                                  "As built Drawing", "Gumboot"],
    "Hot Work Permit": COMMON + REVALIDATION + ["Precaution measures require to complete the work safely", "Contractor", "Number of employees involved", "Welding", "Bracing/Cutting/Grinding/Soldering", "Identify risk associated with this Hot Work",
                                                "Fire/Spark", "Fume /smoke", "Are you certified (welder) to undertake this work?",
                                                "Is Equipment/Machine inspected and color coding available of the current month?", "Are all combustible materials removed or shield from sparks?",
                                                "Are the hoses inspected?", "Free from grease/oil", "cut/crack", "Fitting (Special clips)", "Are regulator and Gauges inspected ?", "Defects/Broken",
                                                "Calibration", "Oxygen - release not exceed 50psi", "Acetylene - release not excess 15 psi", "Are flash back arrestors provided?",
                                                "Are the cylinders provided with cap, trolley, chain and appropriate relieve valve?", "Fire Canopy", "Danger/Waning Sign", "Fume Extractor/Ventilation",
                                                "Friction light", "Container (Rods)", "Fire Blanket", "Sand Bucket", "Welding Gloves", "Apron (Welding)", "Welding shield", "Welding Clothes"],
    "Lifting Operation Permit": COMMON + REVALIDATION + ["Precaution require to complete the work safely", "Contractor Name", "Lifting Equipment", "Truck Mounted", "Crawler Crane", "Overhead Crane", "Tower Crane", "Weight (approx.)",
                                                         "Dimension (max)", "Rigger Level", "Less than 10 ton (Rigger level3)", "More than 10 to 40 ton (Rigger level 2)", "More than 40 (rigger level1)",
                                                         "Valid Inspection Date", "Capacity (SWL)", "Identify risk associated with Lifting work", "Toppling/Tip Over/Turn Over", "Suspended Load",
                                                         "Lifting Plan (Refer procedure)", "Is the lifting equipment certified by accredited center and complied with SEC list?",
                                                         "Is the operator certified and hold valid license (KSA) to carried out this activity?", "Certified: Expiry Date", "License: Expiry Date",
                                                         "Are all accessories inspected (rigging arrangements)? if yes state below", "Wire Rope Sling", "Web Sling", "Chain Sling", "Shackles", "Eye Bolt",
                                                         "Is Load Charts Checked? Is the Load within Crane capability at the given radius of operation?",
                                                         "Is the rigger certified to carried out this activity as per the load limit?", "Name of Rigger",
                                                         "Is wind speed acceptable to proceed the activity ? (stop if any dusty wind or more than 32km/h)",
                                                         "Emergency Rescue team and equipment (tower erection) in place?", "Ground condition", "Signal man", "Tag line", "Outrigger (extended)",
                                                         "Out rigger Pad", "Spreader Beam", "Man/Material Basket (Certified)"],
    "Work at Height Permit": COMMON + REVALIDATION + ["Precaution require to complete the work safely", "Contractor", "Scaffolding", "Ladder", "Aerial Lifts", "Roof Work", "Other; Specify", "Identify risk associated with Work At Height",
                                                      "Fragile surface /Roof", "Work Under Below", "Near energized equipment", "Have the risk control/s been implemented? if yes state below",
                                                      "Guard Rails system", "Safety Net", "Toe Board", "Life Line", "Retractable Harness", "Harness with Shock absorber & Double Hook",
                                                      "Have proper access/egress been provided?", "Is wind speed greater than 32 km/h? If yes, do not proceed the activity",
                                                      "Are all floor openings at roof adequately covered/protected to prevent falling?",
                                                      "Is the scaffold erected and inspected by Certified person? (if no do not proceed the activity)",
                                                      "Are the scaffold , ladder, Arial lift inspected it?", "Name of Inspector", "Date of Inspection", "Scaffold Tag System", "Buddy System",
                                                      "Helmet with Chin strap"],
}

admin = login("demo.admin@complianceos.local", "admin")
auditor = login("priya.auditor@demo.complianceos.local", "auditor")
employer = login("balaji.hr@demo.complianceos.local", "employer")

TITLE = "ZZ TEST PTW"


def cleanup():
    db(f"DELETE FROM dynamic_form_submissions WHERE title LIKE '{TITLE}%'")
    for row in db(f"SELECT id FROM dynamic_modules WHERE name LIKE '{TITLE}%' AND deleted_at IS NULL"):
        admin.send("DELETE", f"/api/admin/dynamic-modules/{row[0]}")
    db(f"DELETE FROM dynamic_modules WHERE name LIKE '{TITLE}%'")


def answer(field):
    kind = field["field_type"]
    options = [o["option_key"] for o in field.get("options") or []]
    if kind in ("heading", "paragraph", "divider", "signature", "formula"):
        return None
    if kind == "select":
        return options[0] if options else "ZZ"
    if kind == "multi_select":
        return options[:2]
    return {"date": "2026-11-24", "time": "09:30", "decimal": 3.5, "number": 3}.get(kind, "ZZ test")


def row_for(table):
    row = {}
    for column in table["columns"]:
        kind = column["column_type"]
        row[column["column_key"]] = {"date": "2026-11-24", "time": "09:30"}.get(kind, "ZZ")
    return row


cleanup()
print("== the seven permits, built from the catalogue")
check("the catalogue has the seven permits", [c[0] for c in PTW_CATALOGUE] == ["Cold Work Permit", "Confined Space to Entry Permit", "Electrical (Isolation) Permit", "Excavation Permit",
                                                                                 "Hot Work Permit", "Lifting Operation Permit", "Work at Height Permit"])
for name, builder, module_type, category, _old in PTW_CATALOGUE:
    structure = builder()
    print(f"\n-- {name}")
    created = admin.send("POST", "/api/admin/dynamic-modules", {"name": f"{TITLE} {name}", "description": structure["description"], "category": category, "module_type": module_type,
                                                                "default_tat_days": 1, "requires_verification": True, "is_public": False, "create_default_form": True, "roles": []})
    body = created[1].get("data", created[1]) if isinstance(created[1], dict) else {}
    module_id, form_id = body.get("moduleId"), body.get("formId")
    check("the permit module is created", created[0] in (200, 201) and module_id and form_id, f"{created[0]} {str(created[1])[:160]}")
    if not (module_id and form_id):
        continue
    saved = admin.send("PUT", f"/api/admin/dynamic-forms/{form_id}", structure)
    check("the permit's structure is accepted", saved[0] == 200, f"{saved[0]} {str(saved[1])[:300]}")
    published = admin.send("POST", f"/api/admin/dynamic-forms/{form_id}/publish", {})
    admin.send("POST", f"/api/admin/dynamic-modules/{module_id}/publish", {})
    check("the permit can be published", published[0] in (200, 201), f"{published[0]} {str(published[1])[:200]}")

    status, docx = admin.send("GET", f"/api/documents/form/{form_id}?format=docx", raw=True)
    check("the blank Word file downloads", status == 200 and docx[:2] == b"PK", status)
    if status == 200 and docx[:2] == b"PK":
        text_ = squash(docx_text(docx))
        missing = [line for line in LINES[name] if squash(line) not in text_]
        check(f"the Word file carries all {len(LINES[name])} of the client's lines word for word", not missing, missing[:6])
        wanted_validity = squash(REVALIDATION[-1]) in text_
        check("the 7-day validity line is printed" if name != "Confined Space to Entry Permit" else "the Confined Space permit has no re-validation table (as the client's)",
              wanted_validity == (name != "Confined Space to Entry Permit"))
    status, pdf = admin.send("GET", f"/api/documents/form/{form_id}?format=pdf", raw=True)
    check("the blank PDF downloads", status == 200 and pdf[:4] == b"%PDF", status)

    started = auditor.send("POST", "/api/auditor/submissions", {"form_id": form_id, "title": f"{TITLE} {name}"})
    payload = started[1] if isinstance(started[1], dict) else {}
    sid = payload.get("submissionId") or (payload.get("data") or {}).get("submissionId")
    check("an auditor starts the permit", started[0] in (200, 201) and sid, f"{started[0]} {str(payload)[:160]}")
    if not sid:
        continue
    values = {}
    for section in structure["sections"]:
        for field in section["fields"]:
            value = answer(field)
            if value is not None:
                values[field["field_key"]] = value
    tables = {t["table_key"]: [row_for(t), row_for(t)] for s in structure["sections"] for t in s["tables"]}
    saved = auditor.send("PUT", f"/api/auditor/submissions/{sid}", {"values": values, "table_rows": tables})
    check("every field and table is filled and saved", saved[0] == 200, f"{saved[0]} {str(saved[1])[:300]}")
    done = auditor.send("POST", f"/api/auditor/submissions/{sid}/submit", {"send_to_reviewer": True})
    check("the filled permit is submitted (signatures are not required)", done[0] in (200, 201), f"{done[0]} {str(done[1])[:300]}")
    status, pdf = auditor.send("GET", f"/api/pdf/submission/{sid}", raw=True)
    check("the filled permit prints as a PDF", status == 200 and pdf[:4] == b"%PDF" and len(pdf) > 3000, status)
    status, docx = auditor.send("GET", f"/api/documents/submission/{sid}?format=docx", raw=True)
    if status == 200:
        check("the filled permit downloads as Word", docx[:2] == b"PK")

print("\n== the platform's own permits")
installed = {r[0] for r in db("SELECT name FROM dynamic_modules WHERE module_type = 'WORK_PERMIT' AND deleted_at IS NULL")}
old_names = {c[0]: c[4] for c in PTW_CATALOGUE if c[4]}
for name, old in old_names.items():
    if name not in installed and old in installed:
        print(f"  note {old} keeps its old name and structure: it has records (the installer never rebuilds a filled-in form)")
check("every permit of the client is in the platform (under its new name, or its old one while it carries records)",
      all(c[0] in installed or c[4] in installed for c in PTW_CATALOGUE), sorted(installed))
for name, builder, module_type, category, old in PTW_CATALOGUE:
    if name not in installed and old in installed:
        continue
    row = db(f"SELECT f.id, (SELECT COUNT(*) FROM dynamic_form_submissions s WHERE s.form_id = f.id AND s.deleted_at IS NULL) FROM dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id "
             f"WHERE m.name = '{sql(name)}' AND m.deleted_at IS NULL AND f.deleted_at IS NULL ORDER BY f.id LIMIT 1")
    if not row:
        check(f"{name} is installed", False)
        continue
    form_id, records = int(row[0][0]), int(row[0][1])
    titles = [r[0] for r in db(f"SELECT title FROM dynamic_form_sections WHERE form_id = {form_id} AND deleted_at IS NULL ORDER BY sort_order, id")]
    expected = [s["title"] for s in builder()["sections"]]
    if records and titles != expected:
        print(f"  note {name}: has {records} record(s), so it still has its earlier structure (the installer never rebuilds a filled-in form)")
    else:
        check(f"{name} is the client's permit ({len(expected)} sections)", titles == expected, titles[:3])
    status, pdf = admin.send("GET", f"/api/documents/form/{form_id}?format=pdf", raw=True)
    check(f"{name}: the blank PDF downloads", status == 200 and pdf[:4] == b"%PDF", status)
check("an employer cannot download a blank permit form", employer.send("GET", f"/api/documents/form/{form_id}?format=pdf", raw=True)[0] in (401, 403))

cleanup()
print(f"\nRESULT {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILURES:")
    for item in FAIL:
        print("  -", item)
    sys.exit(1)
