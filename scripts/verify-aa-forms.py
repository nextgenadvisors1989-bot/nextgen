"""Checks the Audit and Assessment forms and their downloads on a running local site (run scripts/install-aa-forms.py first).

    python scripts/verify-aa-forms.py [admin_email admin_password [auditor_email auditor_password]]

For each of the forms built from the client's files: the form is published and linked to its entry, the empty form downloads as a PDF and
as a Word file that opens (a valid .docx whose text carries the form's headings, questions and table columns), a filled submission downloads
as Word and its PDF still renders, and the access rules hold (an auditor only for forms of their own type, an employer never).
"""
import re
import subprocess
import sys
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import Session, q1  # noqa: E402

args = sys.argv[1:]
ADMIN = (args[0], args[1]) if len(args) >= 2 else ("demo.admin@complianceos.local", "Admin@2026")
AUDITOR = (args[2], args[3]) if len(args) >= 4 else ("priya.auditor@demo.complianceos.local", "Auditor@2026")
EMPLOYER = ("balaji.hr@demo.complianceos.local", "Employer@2026")

fails = []


def check(name, condition, extra=""):
    print(("PASS " if condition else "FAIL ") + name + ("" if condition else f"  {extra}"))
    if not condition:
        fails.append(name)


def docx_text(blob):
    with zipfile.ZipFile(BytesIO(blob)) as z:
        names = z.namelist()
        xml = z.read("word/document.xml").decode("utf-8")
    text = re.sub(r"</w:p>", "\n", xml)
    text = re.sub(r"<[^>]+>", "", text)
    return names, text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'")


def squash(text):
    return re.sub(r"\s+", " ", text).lower()


def pdf_text(blob):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
        handle.write(blob)
    out = subprocess.run(["pdftotext", handle.name, "-"], capture_output=True, text=True).stdout
    Path(handle.name).unlink(missing_ok=True)
    return out


# form name -> (audit entry starts with, phrases the downloads must carry)
FORMS = {
    "ETP Assessment Document List": ("ETP Design and Functionality Assessment", ["8a. List of all key process parameters", "15. GPS coordinate of the facility", "10. Latest discharge water test report for ZDHC"]),
    "Environmental Aspects and Impacts Register": ("Risk Assessment (Safety and Environment)", ["SR - Form 001", "Risk rating (L x S)", "Very significant", "Objectives"]),
    "Risk Engineering Compliance Report": ("Fire Safety Audit", ["Scope of survey", "Previous recommendations", "New recommendations", "Business continuity planning", "Natural hazard mitigations"]),
    "Environmental Audit Report": ("Environmental Audit and Statement", ["Auditing for water management", "48. Please share some ideas", "Calculation of energy for electrical appliances", "Plantation audit",
                                                                        "Measurements of noise level", "Emission factors and constants used", "Table II.1", "Plastic waste collected by the partner organisation", "carbon-neutral"]),
    "Water Audit Report": ("Energy Audit and Water Audit", ["Water balance", "Pump performance evaluation", "Rain water harvesting", "Implementation plan", "Season wise"]),
    "Environmental Impact Assessment Report": ("Environmental Impact Assessment", ["Chapter III - Description of the environment", "Ambient air quality", "Environmental management plan", "Disclosure of consultants", "Greenbelt"]),
    # the third batch (2026-11-05, 16:09 - 16:36)
    "Fire Safety Audit Report": ("Fire Safety Audit", ["Fire risk check sheet", "Discharge floor capacity check", "Distribution of checkpoints", "Recommendations for corrective action", "Evacuation pathway"]),
    "Safety Audit Report": ("Safety Audits (IS 14489:2018)", ["Part 1 - Preamble", "Non-conformities", "Electrical safety observations", "Regulatory compliance", "Records examined"]),
    "Factory Capability and Capacity Audit": ("Factory Capacity and Capability Audit", ["Scoring summary", "Factory contacts", "Sampling lead time", "Corrective action plan", "Total storage capacity"]),
    "Life Cycle Assessment Report": ("Life Cycle Assessment", ["Characterised impacts per occupant per year", "Functional unit", "Low impact strategies", "Inventory analysis", "Interpretation"]),
    "Integrated CHWTSDF Audit Report": ("Common and Captive TSDF", ["Form-1 checklist", "Environmental sensitivity", "Hazardous wastes accepted at the facility", "Chapter III - Description of the environment", "Name of the project"]),
    "Certified Compliance Report (CCR)": ("Certified Compliance Report", ["Annual production details", "Litigation details", "EC conditions", "Reason for seeking the CCR", "Approval and e-signing"]),
    "Resource Data Management (Water, Waste and Energy)": ("Energy Audit and Water Audit", ["Bore well output", "Waste stream", "Purchased from the grid", "Boiler steam", "Purified water, rain water and recycled water"]),
    "Ground Water Extraction NOC Application": ("Ground Water Extraction NOC", ["Covering letter", "Father's / husband's name", "Hours of pumping per day", "Declaration", "Number of abstraction structures"]),
    "ETP Treatment Level Assessment": ("ETP Design and Functionality Assessment", ["Treatment levels and processes", "Sludge treatment and disposal", "Stages of reverse osmosis", "Pictures of the treatment levels", "Findings and corrective action plan"]),
}

admin = Session()
print(admin.login(ADMIN))
auditor = Session()
print(auditor.login(AUDITOR))
employer = Session()
print(employer.login(EMPLOYER))

status, listing = admin.send("GET", "/api/compliance-register/types")
entries = listing.get("data", [])
by_form = {}
for entry in entries:
    for form in entry.get("forms", []):
        by_form.setdefault(form["name"], []).append(entry["name"])

for name, (entry_prefix, phrases) in FORMS.items():
    print(f"\n== {name}")
    form_id = q1(f"SELECT f.id FROM dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id WHERE m.name = '{name}' AND f.deleted_at IS NULL ORDER BY f.id LIMIT 1")
    check("form exists and is published", bool(form_id) and q1(f"SELECT status FROM dynamic_forms WHERE id = {form_id}") == "published")
    check("linked to its Audit and Assessment entry", any(e.startswith(entry_prefix) for e in by_form.get(name, [])), by_form.get(name))
    sections = int(q1(f"SELECT COUNT(*) FROM dynamic_form_sections WHERE form_id = {form_id} AND deleted_at IS NULL", 0))
    fields = int(q1(f"SELECT COUNT(*) FROM dynamic_form_fields WHERE form_id = {form_id} AND deleted_at IS NULL", 0))
    check("has its sections and fields", sections >= 4 and fields >= 10, (sections, fields))
    check("is a report-style form", q1(f"SELECT output_style FROM dynamic_forms WHERE id = {form_id}") == "report")

    st, pdf = admin.send("GET", f"/api/documents/form/{form_id}?format=pdf", raw=True)
    check("blank PDF downloads", st == 200 and pdf[:4] == b"%PDF", st)
    text = pdf_text(pdf) if st == 200 else ""
    for phrase in phrases:
        check(f"PDF carries '{phrase[:50]}'", squash(phrase) in squash(text))
    check("PDF has tick boxes or ruled lines to fill", "[  ]" in text or "____" in text)

    st, docx = admin.send("GET", f"/api/documents/form/{form_id}?format=docx", raw=True)
    check("blank Word file downloads", st == 200 and docx[:2] == b"PK", st)
    if st == 200 and docx[:2] == b"PK":
        names, dtext = docx_text(docx)
        check("Word file is a complete .docx package", "word/document.xml" in names and "[Content_Types].xml" in names, names[:5])
        for phrase in phrases:
            check(f"Word carries '{phrase[:50]}'", squash(phrase) in squash(dtext))

# access rules
print("\n== access")
etp = q1("SELECT f.id FROM dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id WHERE m.name = 'ETP Assessment Document List' LIMIT 1")
st, _ = employer.send("GET", f"/api/documents/form/{etp}?format=pdf", raw=True)
check("employer cannot download a blank audit form", st in (401, 403), st)
st, _ = Session().send("GET", f"/api/documents/form/{etp}?format=pdf", raw=True)
check("signed-out visitor cannot", st in (401, 403), st)
st, _ = admin.send("GET", "/api/documents/form/999999?format=pdf", raw=True)
check("unknown form is a 404", st == 404, st)
st, listing = auditor.send("GET", "/api/compliance-register/types")
mine = listing.get("data", [])
openable = {f["name"] for e in mine for f in e.get("forms", []) if f.get("canOpen")}
blocked = {f["name"] for e in mine for f in e.get("forms", []) if not f.get("canOpen")}
print(f"   auditor can open {len(openable)} linked form(s), {len(blocked)} not assigned")
for name in list(openable)[:2]:
    fid = q1(f"SELECT f.id FROM dynamic_forms f WHERE f.name = '{name}' AND f.deleted_at IS NULL ORDER BY f.id LIMIT 1")
    st, blob = auditor.send("GET", f"/api/documents/form/{fid}?format=docx", raw=True)
    check(f"auditor downloads Word of an assigned form ({name[:30]})", st == 200 and blob[:2] == b"PK", st)
for name in list(blocked)[:2]:
    fid = q1(f"SELECT f.id FROM dynamic_forms f WHERE f.name = '{name}' AND f.deleted_at IS NULL ORDER BY f.id LIMIT 1")
    st, _ = auditor.send("GET", f"/api/documents/form/{fid}?format=pdf", raw=True)
    check(f"auditor refused a form of another type ({name[:30]})", st == 403, st)

# a filled submission
print("\n== filled submission")
sub = q1("SELECT s.id FROM dynamic_form_submissions s JOIN dynamic_form_submission_values v ON v.submission_id = s.id GROUP BY s.id ORDER BY COUNT(*) DESC LIMIT 1")
check("a filled submission exists to test with", bool(sub))
if sub:
    st, pdf = admin.send("GET", f"/api/pdf/submission/{sub}", raw=True)
    check("filled PDF still renders", st == 200 and pdf[:4] == b"%PDF", st)
    st, docx = admin.send("GET", f"/api/documents/submission/{sub}", raw=True)
    check("filled Word downloads", st == 200 and docx[:2] == b"PK", st)
    if st == 200:
        names, dtext = docx_text(docx)
        number = q1(f"SELECT submission_number FROM dynamic_form_submissions WHERE id = {sub}")
        check("filled Word carries the submission number", str(number) in dtext, number)
        ptext = pdf_text(pdf)
        # the answers the PDF prints appear in the Word file too
        answers = [line.strip() for line in ptext.splitlines() if line.strip()][8:40]
        shared = [a for a in answers if len(a) > 12 and a in dtext]
        check("Word carries the same answers as the PDF", len(shared) >= 3, (len(shared), answers[:5]))
    st, _ = employer.send("GET", f"/api/documents/submission/{sub}", raw=True)
    check("employer cannot download another company's submission", st in (401, 403, 404), st)

print("\nFAILED: " + ", ".join(fails) if fails else "\nALL PASSED")
sys.exit(1 if fails else 0)
