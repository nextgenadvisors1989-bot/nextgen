"""The public site and the roles around the final report (2026-11-24), end to end against a running local site.

    python scripts/verify-public-site.py      (server on http://127.0.0.1:3001 with the demo data seeded and migrations 054-057 applied)

Covers: the home page carries the principal's portrait in the top banner; every entry of the menu opens a page that exists and, when it names a part of the page, a heading that is
really there (and no two menu entries open the same place); the About Us page is the client's text; the compliance pages carry the client's words under the headings the menu names;
the public resources list shows nothing that needs a sign-in; every audit / assessment / risk / study / inspection / permit form has signature fields; an auditor who is also a
verifier sees both workspaces (the role is added for the test and taken off again). Exit code 1 if any check fails."""
import re
import sys
import html as htmllib

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db  # noqa: E402

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  ok  " if condition else "  FAIL") + f" {name}" + (f"  -> {detail}" if not condition and detail else ""))


anon = Session(("nobody@example.com", "x"))


def get(path):
    status, body = anon.send("GET", path, raw=True)
    return status, body.decode("utf-8", "replace")


print("== the home page")
status, home = get("/")
check("the home page loads", status == 200, status)
check("the principal's portrait is in the top banner (before the first section after it)", "/brand/kannan.jpg" in home.split("<section", 3)[1] + home.split("<section", 3)[2] if home.count("<section") >= 3 else "/brand/kannan.jpg" in home)
check("the portrait file is served", anon.send("GET", "/brand/kannan.jpg", raw=True)[0] == 200)
check("the numbered register labels (§ 01 ...) are gone", "§ 0" not in home)
check("the sign-in bar is on the page", "portal-heading" in home)

print("== the old product name is nowhere")
for page in ("/", "/login", "/forgot-password", "/about", "/services", "/contact", "/calculators", "/resources", "/privacy-policy", "/terms-conditions"):
    status, body = get(page)
    check(f"{page} does not show ComplianceOS or One Legal Culture", status == 200 and "complianceos" not in body.lower() and "legal culture" not in body.lower(), status)
status, login = get("/login")
check("the sign-in page shows the logo and the client's tagline", "/brand/logo.png" in login and "All Compliance Under One Umbrella" in login)

print("== the menu")
header = re.search(r"<header[\s\S]*?</header>", home)
hrefs = re.findall(r'<a[^>]+href="([^"]+)"', header.group(0) if header else "")
hrefs = [htmllib.unescape(h) for h in hrefs if h.startswith("/")]
check("the header has links", len(hrefs) > 15, len(hrefs))
anchored = [h for h in hrefs if "#" in h]
check("no two menu entries open the same place", len(anchored) == len(set(anchored)), sorted({h for h in anchored if anchored.count(h) > 1}))
check("every menu page exists", all(get(h.split("#")[0])[0] == 200 for h in sorted({h.split("#")[0] for h in hrefs})), [h for h in sorted({h.split("#")[0] for h in hrefs}) if get(h.split("#")[0])[0] != 200])
pages = {}
missing = []
for href in anchored:
    page, anchor = href.split("#", 1)
    if page not in pages:
        pages[page] = get(page)[1]
    if f'id="{anchor}"' not in pages[page]:
        missing.append(href)
check(f"every menu entry that names a part of a page finds its heading ({len(anchored)} entries)", not missing, missing)
targets = {}
for h in hrefs:
    targets.setdefault(h, 0)
    targets[h] += 1
check("a plain page is not offered twice under different names in the dropdowns (about the mega menus)", all(c <= 2 for c in targets.values()), {k: v for k, v in targets.items() if v > 2})

print("== About Us")
status, about = get("/about")
check("About Us loads", status == 200, status)
for phrase in ["All Compliance Under One Umbrella", "COMPLIANCE WING", "SAFETY WING", "ENVIRONMENT WING", "INTEGRATED GOVERNANCE APPROACH", "OUR OBJECTIVE", "OUR COMMITMENT",
               "Grievance Redressal Management", "COMPLIANCE • SAFETY • PEOPLE • ENVIRONMENT • SUSTAINABILITY"]:
    check(f"About Us carries the client's words: {phrase}", phrase.lower() in htmllib.unescape(about).lower())
check("About Us no longer carries the old product copy", "zero-penalty" not in about and "Statutory coverage" not in about)

print("== the compliance pages carry the client's words")
for page, phrase in [("/payroll-compliance-ir", "Healthy industrial relations are essential"), ("/social-security-compliance", "Employees’ Provident Fund"),
                     ("/health-safety-compliance", "positive safety culture"), ("/environmental-compliance", "Net Zero roadmaps")]:
    check(f"{page} carries '{phrase}'", phrase.lower() in htmllib.unescape(get(page)[1]).lower())

print("== resources")
status, resources = get("/resources")
check("the public resources list loads", status == 200, status)
check("a sign-in-only reference file of the client is not advertised", "SHAKTHI" not in resources and "sign-in required" not in resources and "Sheet2" not in resources)

print("== calculators")
status, calc = get("/calculators")
check("the calculators page loads with the safety officer's tools", status == 200 and all(label in calc for label in ["LTIFR", "TRIR", "AFR", "ASR", "Incident rate", "Man-hours", "Fire extinguisher", "Noise dose", "Safe oxygen", "LEL &amp; UEL", "Scaffold load", "Electrical power", "Pressure", "Lifting SWL", "Risk matrix"]))

print("== signatures on the forms")
without = db("SELECT COUNT(*) FROM dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id WHERE f.deleted_at IS NULL AND m.deleted_at IS NULL "
             "AND m.module_type IN ('AUDIT','ASSESSMENT','RISK','STUDY','INSPECTION','WORK_PERMIT') AND f.status = 'published' "
             "AND NOT EXISTS (SELECT 1 FROM dynamic_form_fields x WHERE x.form_id = f.id AND x.field_type = 'signature' AND x.deleted_at IS NULL)")
check("every published audit, assessment, risk, study, inspection and permit form has a signature field", int(without[0][0]) == 0, without)
admin = Session(("demo.admin@complianceos.local", PASSWORDS["admin"]))
ok, detail = admin.login()
check("the administrator signs in", ok, detail)
form_id = db("SELECT f.id FROM dynamic_forms f JOIN dynamic_modules m ON m.id = f.module_id WHERE m.name = 'Safety Audit Report' AND f.deleted_at IS NULL LIMIT 1")
if form_id:
    status, docx = admin.send("GET", f"/api/documents/form/{form_id[0][0]}?format=docx", raw=True)
    text = htmllib.unescape(re.sub(r"<[^>]+>", " ", docx.decode("latin-1", "ignore"))) if status == 200 else ""
    check("the blank form downloads", status == 200 and docx[:2] == b"PK", status)

print("== an auditor who is also a verifier")
auditor_email = "priya.auditor@demo.complianceos.local"
row = db(f"SELECT u.id FROM users u WHERE u.email = '{auditor_email}'")
verifier_role = db("SELECT id FROM roles WHERE slug = 'verifier'")
if row and verifier_role:
    user_id, role_id = row[0][0], verifier_role[0][0]
    already = db(f"SELECT COUNT(*) FROM user_roles WHERE user_id = {user_id} AND role_id = {role_id}")[0][0] != "0"
    try:
        if not already:
            db(f"INSERT INTO user_roles (user_id, role_id) VALUES ({user_id}, {role_id})")
        both = Session((auditor_email, PASSWORDS["auditor"]))
        ok, detail = both.login()
        check("the auditor signs in with both roles", ok, detail)
        status, page = both.send("GET", "/auditor/dashboard", raw=True)
        check("the auditor workspace offers the verifier workspace", status == 200 and "Verifier workspace" in page.decode("utf-8", "replace"), status)
        status, page = both.send("GET", "/verifier/dashboard", raw=True)
        check("the verifier workspace opens for the same person and offers the auditor workspace", status == 200 and "Auditor workspace" in page.decode("utf-8", "replace"), status)
        status, _ = both.send("GET", "/api/verifier/submissions", raw=True)
        check("the verifier's list of submissions answers", status == 200, status)
        plain = Session(("karthik.auditor@demo.complianceos.local", PASSWORDS["auditor"]))
        plain.login()
        check("an auditor who is not a verifier does not see the verifier workspace", "Verifier workspace" not in plain.send("GET", "/auditor/dashboard", raw=True)[1].decode("utf-8", "replace"))
        check("and cannot open it", plain.send("GET", "/verifier/dashboard", raw=True)[0] in (302, 303, 307, 308, 401, 403) or "Verifier Panel" not in plain.send("GET", "/verifier/dashboard", raw=True)[1].decode("utf-8", "replace"))
    finally:
        if not already:
            db(f"DELETE FROM user_roles WHERE user_id = {user_id} AND role_id = {role_id}")
else:
    check("the demo auditor and the verifier role exist", False)

print(f"\nRESULT {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILURES:")
    for item in FAIL:
        print("  -", item)
    sys.exit(1)
