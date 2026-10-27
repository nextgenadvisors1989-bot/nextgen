"""Seed stage: CAPAR (Corrective Action Plan Acknowledgement Report) demo reports in every state.

Five reports for the demo employers, written through the real API as the auditors, verified as the verifier:
  Approved      Sri Balaji Textiles, Spinning Unit    (10 rows, one finding judged Not Eligible, photos and evidence)
  Under Review  Sri Balaji Textiles, Weaving Unit     (some rows already verified)
  Submitted     Kaveri Engineering Works              (waiting for the verifier)
  Returned      Kaveri Engineering Works, 2nd visit   (verifier comments, auditor has not resubmitted)
  Draft         Sri Balaji Textiles, Spinning Unit    (still being written)

The wording follows the structure of a real third-party CAPAR (category, "it was noted that ...", local law clause) but every
facility, person and figure belongs to the demo companies. Safe to re-run: a report is skipped if its title already exists.
"""
import struct
import zlib

from seed_common import admin, employers_map, ensure_pack, iso, login_as
from seed_lib import multipart, q1, section, sql_text

try:  # Pillow gives the demo photos a readable label; without it a plain coloured image is used.
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    Image = None


def _plain_png(colour):
    raw = b"".join(b"\x00" + bytes(colour) * 320 for _ in range(200))
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 320, 200, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def photo(label, colour=(176, 190, 197)):
    """A labelled placeholder 'site photo' (PNG bytes)."""
    if Image is None:
        return _plain_png(colour)
    import io
    image = Image.new("RGB", (640, 400), colour)
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 0, 639, 399], outline=(60, 72, 80), width=6)
    draw.rectangle([0, 330, 639, 399], fill=(40, 50, 58))
    try:
        font = ImageFont.truetype("arial.ttf", 26)
    except OSError:
        font = ImageFont.load_default()
    draw.text((20, 350), label[:48], fill=(255, 255, 255), font=font)
    draw.ellipse([250, 90, 390, 230], outline=(200, 40, 40), width=8)
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def _finding(category, act_rule, minimum, law, finding, root, plan, days, status="Open", outcome="Violation", photo_label=None, evidence=False):
    return dict(category=category, act_rule=act_rule, minimum=minimum, law=law, finding=finding, root=root, plan=plan, days=days,
                status=status, outcome=outcome, photo_label=photo_label, evidence=evidence)


SPINNING = [
    _finding("Compensation", "Factories Act 1948, Section 65(3)", "Overtime must not exceed 60 hours a week or 75 hours a quarter",
             "In accordance with Section 65(2) of the Factories Act 1948, no worker shall be allowed to work overtime for more than seven days at a stretch and the total overtime in any quarter shall not exceed seventy-five hours.",
             "It was noted during the document review that 3 out of 20 sampled employees worked up to 88 hours a week in March 2026 against the limit of 60 hours.",
             "Peak orders in March were met by extending the same workers instead of adding a shift.",
             "Introduce a third relay for the carding section and track weekly overtime per worker in the attendance register.", 45, "In Progress"),
    _finding("Compensation", "Employees State Insurance (Central) Rules 1950, Rule 22", "ESI contribution must cover all overtime wages",
             "Wages means all remuneration paid or payable in cash to an employee, and includes payment in respect of any period of authorised leave, lock-out, strike which is not illegal.",
             "ESI was not paid on overtime hours: Employee A worked 94 hours of overtime in March 2026 but ESI covered only 17 hours.",
             "The payroll software was set to take ESI on basic wages only.",
             "Correct the payroll head configuration, pay the difference with the next return and file the revised challan.", 20, "Open", evidence=True),
    _finding("Emergency Planning & Fire Safety", "Factories Act 1948, Chapter IV, Section 38(1)", "Fire extinguishers on every floor",
             "In every factory, all practicable measures shall be taken to prevent outbreak of fire and its spread, both internally and externally, and to provide and maintain safe means of escape for all persons in the event of a fire, and the necessary equipment and facilities for extinguishing fire.",
             "It was noted during the factory tour that fire extinguishers were not installed at the first floor packed carton boxes store.",
             "The store was relocated in January and the fire safety plan was not updated.",
             "Install four ABC extinguishers at the store, update the layout and add the points to the monthly fire inspection sheet.", 14, "Closed", photo_label="First floor carton store: no extinguisher", evidence=True),
    _finding("Emergency Planning & Fire Safety", "Tamil Nadu Factories Rules 1950, Chapter IV, Rule 57(9)(p)", "At least two exits for every floor area",
             "There shall not be less than two exits serving every floor area above and below the ground floor, and at least one of them shall be an internal enclosed stairway.",
             "It was noted during the factory tour that a secondary exit was not provided to the mezzanine floor of Building 6. No employee was working on the floor on the day of the audit.",
             "The mezzanine was built as a storage platform and never assessed as a working floor.",
             "Provide an external escape stair, or stop using the floor for work until it is built.", 90, "In Progress", photo_label="Mezzanine floor: single exit"),
    _finding("Emergency Planning & Fire Safety", "Factories Act 1948, Chapter IV, Section 38(1)", "Escape routes kept free of obstruction",
             "In every factory, all practicable measures shall be taken to provide and maintain safe means of escape for all persons in the event of a fire.",
             "It was noted that the escape route at the ground floor sewing section was partially blocked with trolleys and material bins (60 employees affected).",
             "No marked parking area for trolleys.",
             "Mark a yellow trolley zone, brief the supervisors and check the route in the weekly walk-through.", 7, "Closed", photo_label="Ground floor: trolleys in escape route"),
    _finding("Emergency Planning & Fire Safety", "Tamil Nadu Factories Rules 1950, Chapter IX, Rule 6(2)", "Emergency shower with eye fountain in working order",
             "An approved type of emergency shower with eye fountain shall be provided and maintained in good working order.",
             "1 out of 2 eye wash stations near the machine oils store was not in working condition.",
             "No routine test; the supply valve was closed.", "Repair the unit, add a weekly flush test to the maintenance plan.", 10, "Closed", photo_label="Eye wash station: valve closed"),
    _finding("Chemical Management", "Tamil Nadu Factories Rules 1950, Chapter IX, Rule 95, Schedule XVI", "Secondary containment for oil storage",
             "Standby arrangements equal to the biggest container shall always be available to transfer the toxic substances quickly into the standby storage facility.",
             "Secondary containment was not provided to 2 out of 4 machine oil drums at the machine oils store.",
             "Drums were added after the original bund was built.", "Build a bund sized for the largest drum and move the drums onto it.", 30, "In Progress", photo_label="Machine oil drums: no bund"),
    _finding("Chemical Management", "Tamil Nadu Factories Rules 1950, Chapter V, Rule 62(c)", "Safety data sheet displayed in the local language",
             "The occupier of every factory carrying a hazardous process shall arrange to obtain development information in the form of Material Safety Data Sheet.",
             "The safety data sheet was not posted in Tamil at the RO plant area.", "Only English copies were issued by the supplier.",
             "Translate the sheets, laminate and post them at each chemical point.", 21, "Open"),
    _finding("Water Use", "Tamil Nadu Panchayats (Regulation of Sinking of Wells and Safety Measures) Rules 2015", "Permit for the borewell",
             "Every application for grant of permit shall be made to the Executive Authority in Form A.",
             "The borewell water usage approval applied for in April 2024 had not been received. The facility maintained monthly instead of daily readings of the borewell flow meter.",
             "Follow-up with the department was not assigned to anyone.", "Assign the compliance manager, follow up weekly and restart daily meter readings.", 30, "Open"),
    _finding("Business Practices", "Factories Act 1948, Section 6", "Valid factory licence displayed", "",
             "Licence is valid and displayed at the gate.", None, None, 0, "Closed", outcome="No Violation"),
]

WEAVING = [
    _finding("Emergency Planning & Fire Safety", "Factories Act 1948, Chapter IV, Section 38(1)", "Fire alarm call points on every floor", "",
             "It was noted that fire alarm call points were not installed at the loom shed mezzanine.", "The alarm panel has no spare zone.",
             "Extend the alarm panel and install four call points.", 40, "In Progress", photo_label="Loom shed mezzanine: no call point"),
    _finding("Recruitment & Hiring", "Inter-State Migrant Workmen (RE&CS) Act 1979", "Licence covers the number of migrant workers engaged",
             "The certificate of registration shall contain the maximum number of migrant workmen to be employed in the establishment.",
             "The facility holds a licence for 120 migrant workers but 160 were engaged on the day of the audit.", "Hiring continued after the licence was issued.",
             "Apply for an amendment of the licence and stop adding migrant workers until it is issued.", 25, "Open"),
    _finding("Water Use", "Environment (Protection) Act 1986", "Wastewater recorded daily", "",
             "Daily wastewater register was maintained and matched the flow meter.", None, None, 0, "Closed", outcome="No Violation"),
]

KAVERI = [
    _finding("Emergency Planning & Fire Safety", "Factories Act 1948, Section 38", "Evacuation plan displayed on every floor", "",
             "It was noted that the evacuation plan board and escape route markings were not displayed at the second floor.", "The plan was prepared for the ground floor only.",
             "Prepare the plan for each floor and display it at the stair landings.", 15, "Open", photo_label="Second floor: no evacuation plan"),
    _finding("Chemical Management", "Manufacture, Storage and Import of Hazardous Chemicals Rules 1989", "Inventory of hazardous chemicals",
             "Every occupier shall maintain an up-to-date inventory of hazardous chemicals.",
             "The facility uses 14 chemicals in the paint shop but has not maintained purchase and stock records.", "Records were kept by the vendor only.",
             "Start a chemical register with purchase, stock and issue entries.", 20, "Open"),
    _finding("Others", "Payment of Wages Act 1936", "Payslip matches the time record",
             "The wages of every person employed shall be paid in accordance with the attendance record.",
             "Payslip hours did not match the time records for 2 of 10 sampled employees.", "Manual overrides in the attendance system.",
             "Lock manual edits to the HR manager and keep an approval note.", 30, "Open", evidence=True),
    _finding("Business Practices", "Contract Labour (R&A) Act 1970", "Contractor licences on file", "", "All contractor licences were on file and valid.", None, None, 0, "Closed", outcome="No Violation"),
    _finding("Water Use", "Environment (Protection) Act 1986", "Flow meter fitted on the borewell", "", "Flow meter was fitted and sealed.", None, None, 0, "Closed", outcome="No Violation"),
]

KAVERI_SECOND = [
    _finding("Emergency Planning & Fire Safety", "Factories Act 1948, Section 38", "Fire extinguishers inspected and tagged", "",
             "Six extinguishers in the assembly shop were past their refill date.", "Refill schedule not tracked.", "Refill now and keep a tag register.", 10, "Open", photo_label="Assembly shop: expired extinguisher"),
    _finding("Compensation", "Payment of Bonus Act 1965", "Bonus paid within eight months of year end", "",
             "Bonus for the last financial year was paid after the due date for 12 workers.", "Approval delayed.", "Pay with interest and add the due date to the compliance calendar.", 20, "Open"),
    _finding("Others", "Factories Act 1948, Section 40B", "Safety Officer appointed (500+ workers)", "",
             "The facility has 520 workers but no Safety Officer is appointed.", "Role was merged with the maintenance manager.", "Appoint a qualified Safety Officer.", 60, "Open"),
]

DRAFT = [
    _finding("Business Practices", "Factories Act 1948, Section 6", "Licence renewed before expiry", "", "Licence renewal was filed 12 days before expiry.", None, None, 0, "Closed", outcome="No Violation"),
    _finding("Chemical Management", "Tamil Nadu Factories Rules 1950, Rule 62", "Chemical labels in the local language", "", "Labels on three solvent drums were in English only.", "Labels printed centrally.", "Print Tamil labels.", 12, "Open"),
]

REPORTS = [
    dict(title="CAPAR - Sri Balaji Textiles - Spinning Unit - March 2026", code="SBT", unit="Spinning Unit", auditor="priya.auditor@demo.complianceos.local", days=-45,
         rows=SPINNING, end="approved", standard="H&M MR Standards and local law", rep=("R. Muthu Kumar", "Managing Director"),
         not_eligible={7: "The translated sheets were displayed on the day; the finding was raised in error."}),
    dict(title="CAPAR - Sri Balaji Textiles - Weaving Unit - September 2026", code="SBT", unit="Weaving Unit", auditor="priya.auditor@demo.complianceos.local", days=-12,
         rows=WEAVING, end="review", standard="Local law", rep=("S. Anand", "Weaving Manager")),
    dict(title="CAPAR - Kaveri Engineering Works - Ambattur Plant - September 2026", code="KEW", unit="Ambattur Plant", auditor="karthik.auditor@demo.complianceos.local", days=-9,
         rows=KAVERI, end="submitted", standard="Local law", rep=("S. Lakshmi Narayanan", "General Manager - HR")),
    dict(title="CAPAR - Kaveri Engineering Works - Ambattur Plant - follow-up visit", code="KEW", unit="Ambattur Plant", auditor="karthik.auditor@demo.complianceos.local", days=-4,
         rows=KAVERI_SECOND, end="returned", standard="Local law", rep=("S. Lakshmi Narayanan", "General Manager - HR")),
    dict(title="CAPAR - Sri Balaji Textiles - Spinning Unit - October 2026 (draft)", code="SBT", unit="Spinning Unit", auditor="priya.auditor@demo.complianceos.local", days=-1,
         rows=DRAFT, end="draft", standard="Local law", rep=("R. Muthu Kumar", "Managing Director")),
]


def stage_capar():
    section("CAPAR reports")
    verifier_id = int(q1("SELECT id FROM users WHERE email = 'verifier.test@complianceos.local'"))
    employers = employers_map()
    categories = {name: int(i) for i, name in __import__("seed_lib").db("SELECT id, name FROM capar_categories WHERE deleted_at IS NULL")}
    sessions = {}
    verifier = login_as("verifier.test@complianceos.local", "verifier")

    for spec in REPORTS:
        if q1(f"SELECT id FROM capar_reports WHERE title = {sql_text(spec['title'])} AND deleted_at IS NULL"):
            print(f"  = {spec['title']} (already there)")
            continue
        employer_id = employers.get(spec["code"])
        unit_id = q1(f"SELECT id FROM company_units WHERE employer_id = {employer_id} AND unit_name = {sql_text(spec['unit'])} AND deleted_at IS NULL")
        if not employer_id or not unit_id:
            print(f"  ! skipped {spec['title']}: employer or unit not found")
            continue
        auditor = sessions.get(spec["auditor"]) or login_as(spec["auditor"], "auditor")
        sessions[spec["auditor"]] = auditor
        if not auditor:
            continue

        ensure_pack(auditor, employer_id)
        report = auditor.call("POST", "/api/capar", {
            "employer_id": employer_id, "unit_id": int(unit_id), "title": spec["title"], "verifier_id": verifier_id,
            "audit_date": iso(spec["days"]), "standard_reference": spec["standard"],
            "representative_name": spec["rep"][0], "representative_title": spec["rep"][1],
        }, what=f"create {spec['title']}")
        if not report:
            continue
        rid = report["data"]["id"]

        finding_ids = []
        for row in spec["rows"]:
            body = {
                "category_id": categories.get(row["category"]), "outcome": row["outcome"], "act_rule": row["act_rule"],
                "minimum_requirement": row["minimum"], "local_law": row["law"] or None, "finding": row["finding"],
                "root_cause": row["root"], "action_plan": row["plan"],
                "timeline_date": iso(spec["days"] + row["days"]) if row["days"] else None, "action_status": row["status"],
            }
            complete = row["outcome"] == "No Violation" or all(body[key] for key in ("finding", "root_cause", "action_plan", "timeline_date"))
            body["item_status"] = ("Not findings" if row["outcome"] == "No Violation" else "Verified") if complete else "Incomplete"
            created = auditor.call("POST", f"/api/capar/{rid}/findings", body, what="add finding")
            if not created:
                continue
            fid = created["data"]["id"]
            finding_ids.append(fid)
            if row["photo_label"]:
                payload, ctype = multipart([("kind", "Photo"), ("caption", row["photo_label"])], [("files", "site-photo.png", "image/png", photo(row["photo_label"]))])
                auditor.send("POST", f"/api/capar/{rid}/findings/{fid}/files", payload, content_type=ctype)
            if row["evidence"]:
                from seed_lib import make_pdf
                payload, ctype = multipart([("kind", "Evidence")], [("files", "closure-evidence.pdf", "application/pdf", make_pdf("Closure evidence", [row["plan"] or "Evidence of corrective action"]))])
                auditor.send("POST", f"/api/capar/{rid}/findings/{fid}/files", payload, content_type=ctype)

        auditor.call("PATCH", f"/api/capar/{rid}", {
            "closing_meeting_date": iso(spec["days"]), "facility_signatory": spec["rep"][0], "facility_signed_date": iso(spec["days"]),
            "closing_statement": "A closing meeting has been performed, and the above findings were discussed and were agreed.",
        }, what="closing details")
        print(f"  + {spec['title']}: {len(finding_ids)} rows")

        if spec["end"] == "draft":
            continue
        if not auditor.call("POST", f"/api/capar/{rid}/submit", {}, what="submit"):
            continue
        if spec["end"] == "submitted" or not verifier:
            continue
        if spec["end"] == "returned":
            verifier.call("POST", f"/api/capar/{rid}/findings/{finding_ids[0]}/verify", {"verification_status": "Eligible"}, what="verify")
            verifier.call("POST", f"/api/capar/{rid}/decision", {"decision": "return", "comments": "Please attach the photo of the Safety Officer gap and confirm the bonus dates with the payroll sheet before resubmitting."}, what="return")
            continue
        not_eligible = spec.get("not_eligible", {})
        limit = len(finding_ids) if spec["end"] == "approved" else 2
        for index, fid in enumerate(finding_ids[:limit]):
            if index in not_eligible:
                body = {"verification_status": "Not Eligible", "verification_remark": not_eligible[index]}
            else:
                body = {"verification_status": "Eligible", "verification_remark": "Checked against the photo and the Act." if index % 3 == 0 else None}
            verifier.call("POST", f"/api/capar/{rid}/findings/{fid}/verify", body, what="verify")
        if spec["end"] == "approved":
            verifier.call("POST", f"/api/capar/{rid}/decision", {"decision": "approve", "comments": "Verified against the evidence. One finding withdrawn."}, what="approve")
