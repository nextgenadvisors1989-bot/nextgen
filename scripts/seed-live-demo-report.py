"""Creates ONE complete sample CAPAR report on a running ComplianceOS, through its own API, so a client can see the whole journey:

    the auditor starts it from an assigned audit, ticks categories, records findings with photos, signs and submits;
    the employer replies, answers every issue with proof and a signature; the auditor declines one answer, approves the rest,
    the employer answers that one again, and the report closes with both signatures.

It uses the demo logins that already exist (see scripts/seed-live-demo.py). Nothing is read from or written to the database directly,
and no password is stored in the repository: they are passed in when the script runs. Safe to run again: a report with the same
title is not created twice.

    AUDITOR_EMAIL='kishoreanand7887@gmail.com' AUDITOR_PASSWORD='...' EMPLOYER_EMAIL='employer@gmail.com' EMPLOYER_PASSWORD='...' \\
    python3 scripts/seed-live-demo-report.py

SEED_BASE (default http://127.0.0.1:3001) is the app's address; SAMPLE_TITLE changes the report title.
Pillow, if installed, puts readable labels on the demo photos; without it plain coloured images are used.
"""
import base64
import io
import math
import os
import random
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import Session, multipart  # noqa: E402  (standard library only)

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    Image = None


def need(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Set {name} (see the top of this file).")
    return value


TITLE = os.environ.get("SAMPLE_TITLE", "CAPAR - Demo Industries - Buyer Compliance Audit (sample)")


# ── images, without needing Pillow ──────────────────────────────────────────
def _png(width, height, pixels):
    raw = b"".join(b"\x00" + bytes(pixels[y * width * 3:(y + 1) * width * 3]) for y in range(height))
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def _plot(pixels, width, height, x, y, colour, thick=1):
    for dx in range(-thick, thick + 1):
        for dy in range(-thick, thick + 1):
            px, py = int(x) + dx, int(y) + dy
            if 0 <= px < width and 0 <= py < height:
                at = (py * width + px) * 3
                pixels[at:at + 3] = bytes(colour)


def photo(label, colour=(176, 190, 197)):
    """A demo 'site photo' with a red ring on the issue (and the label, when Pillow is there)."""
    if Image is not None:
        image = Image.new("RGB", (640, 400), colour)
        draw = ImageDraw.Draw(image)
        draw.rectangle([0, 0, 639, 399], outline=(60, 72, 80), width=6)
        draw.rectangle([0, 330, 639, 399], fill=(40, 50, 58))
        draw.text((20, 350), label[:60], fill=(255, 255, 255))
        draw.ellipse([250, 90, 390, 230], outline=(200, 40, 40), width=8)
        buffer = io.BytesIO(); image.save(buffer, "PNG")
        return buffer.getvalue()
    width, height = 320, 200
    pixels = bytearray(bytes(colour) * (width * height))
    for angle in range(0, 360):
        _plot(pixels, width, height, 160 + 50 * math.cos(math.radians(angle)), 80 + 50 * math.sin(math.radians(angle)), (200, 40, 40), 2)
    for x in range(width):
        for y in range(160, height):
            _plot(pixels, width, height, x, y, (40, 50, 58))
    return _png(width, height, pixels)


def signature(seed):
    """A hand-drawn looking signature as a PNG data URL."""
    random.seed(seed)
    width, height = 440, 150
    pixels = bytearray(b"\xff" * (width * height * 3))
    previous = None
    x = 20
    while x < width - 20:
        y = height / 2 + math.sin(x / 11 + seed) * random.randint(18, 42) + random.randint(-6, 6)
        if previous:
            for step in range(7):
                _plot(pixels, width, height, previous[0] + (x - previous[0]) * step / 6, previous[1] + (y - previous[1]) * step / 6, (20, 30, 90), 1)
        previous = (x, y)
        x += 6
    for x in range(30, width - 60):
        _plot(pixels, width, height, x, height - 30 - (x - 30) * 14 / (width - 90), (20, 30, 90), 1)
    return "data:image/png;base64," + base64.b64encode(_png(width, height, pixels)).decode()


def ok(label, status, body, expect=(200, 201)):
    good = status in expect
    print(("  ok    " if good else "  FAIL  ") + label + ("" if good else f" ({status}) {body.get('message') if isinstance(body, dict) else body}"))
    if not good:
        sys.exit(1)
    return body


auditor = Session((need("AUDITOR_EMAIL"), need("AUDITOR_PASSWORD")))
employer = Session((need("EMPLOYER_EMAIL"), need("EMPLOYER_PASSWORD")))
for who, session in (("auditor", auditor), ("employer", employer)):
    good, detail = session.login()
    if not good:
        sys.exit(f"Cannot sign in as the {who}: {detail}")

status, body = auditor.send("GET", "/api/capar?limit=100")
rows = body.get("data") if isinstance(body, dict) and isinstance(body.get("data"), list) else []
if any(row.get("title") == TITLE for row in rows):
    print(f"A report called '{TITLE}' already exists. Nothing to do.")
    sys.exit(0)

print("1. The auditor starts the report from the assigned audit")
audits = auditor.send("GET", "/api/capar/lookups?type=myaudits")[1].get("data") or []
if not audits:
    sys.exit("This auditor has no audit assigned. Run scripts/seed-live-demo.py first.")
audit = audits[0]
types = auditor.send("GET", "/api/compliance-register/types")[1].get("data") or []
buyer = next((t for t in types if t["name"].startswith("International Buyer")), None)
if not buyer:
    sys.exit("The audit types are missing: run the database migrations first.")
status, body = auditor.send("POST", "/api/capar", {
    "assignment_id": int(audit["value"]), "audit_type_id": buyer["id"], "buyer_standards": "BSCI, SEDEX, SA8000", "title": TITLE,
    "audit_purpose": "Buyer compliance audit ahead of the new season order: working conditions, wages, fire safety and environmental controls."})
rid = ok("report created", status, body)["data"]["id"]
detail = auditor.send("GET", f"/api/capar/{rid}")[1]["data"]
group_ids = {g["name"]: g["id"] for g in detail["groups"]}
ok("categories ticked and details saved", *auditor.send("PATCH", f"/api/capar/{rid}", {
    "group_ids": [group_ids[n] for n in ("Governance", "Social Security System", "Health & Safety", "Environmental System")],
    "representative_name": "R. Meenakshi", "representative_title": "HR Manager",
    "standard_reference": "BSCI, SEDEX and SA8000 buyer codes, Tamil Nadu Factories Rules 1950",
    "summary_notes": "Audit carried out over two days with the HR Manager, the Safety Officer and the Maintenance Head. Documents were sampled for the last six months.",
    "closing_meeting_date": detail["report"]["audit_date"][:10], "closing_statement": "A closing meeting has been performed, and the above findings were discussed and were agreed."}))


def item(group, name):
    chosen = next(g for g in detail["checklist"] if g["name"] == group)
    found = next((i for i in chosen["items"] if i["name"].lower().startswith(name.lower())), None)
    if not found:
        sys.exit(f"The checklist document '{name}' is missing under {group}. Load the checklist first (npm run db:seed-masters).")
    return found


issues = [
    ("Health & Safety", "Fire NOC", "Factories Act 1948, Section 38 and Tamil Nadu Factories Rules 1950, Rule 57", "Fire NOC valid and displayed",
     "It was noted during the factory tour that the Fire NOC expired on 31 March 2026 and the renewal has not been filed.", "The renewal date was not tracked and the file moved between two departments.",
     "File the renewal with the Fire and Rescue Services and keep a licence expiry calendar reviewed monthly by the HR Manager.", "2026-12-15", "Fire NOC expired: renewal not filed",
     "The Fire NOC was renewed (certificate no. FS/CBE/2026/4417, valid for one year). A copy is attached and the licence calendar now alerts the HR Manager 60 days before expiry."),
    ("Health & Safety", "First Aid Training", "Tamil Nadu Factories Rules 1950, Rule 61", "Trained first aiders for every shift",
     "Only 2 of the 8 nominated first aiders hold a valid first aid training certificate; the night shift has none.", "Training was last arranged in 2023 and the nominations were not refreshed.",
     "Train 8 employees through a recognised provider and display the first aider list on every floor.", "2026-12-31", "First aid certificates: night shift has no trained person",
     "Eight employees, including four from the night shift, completed first aid training. The certificates are attached and the first aider list is displayed on every floor."),
    ("Social Security System", "Leave records", "Tamil Nadu Factories Rules 1950, Rule 78 (Form 15)", "Leave with wages register maintained for every worker",
     "The leave register was not updated for 6 of 15 sampled employees for August and September 2026.", "Leave was recorded in the payroll software only and not posted to the statutory register.",
     "Post leave to Form 15 weekly and have the HR Manager sign the register every month.", "2026-11-30", "Leave register not updated",
     "Form 15 was updated for all employees and is now signed by the HR Manager every month. A photo of the updated register is attached."),
    ("Social Security System", "Payroll", "Payment of Wages Act 1936, Section 13A", "Wage register and slips for every worker",
     "Wage slips for September 2026 were issued to 41 of 48 sampled workers; 7 contract workers received none.", "Contract workers are paid by the contractor and the slips were not collected.",
     "Collect the contractor payroll every month and issue wage slips to all contract workers.", "2026-11-20", "Wage slips missing for contract workers",
     "The contractor payroll was collected and wage slips were issued to all 7 contract workers. Acknowledgements are attached."),
    ("Environmental System", "Waste disposal records", "Hazardous and Other Wastes (Management and Transboundary Movement) Rules 2016", "Waste disposal records and manifests kept",
     "The manifest for used oil collected in July and August 2026 was not available at the site.", "Manifests are filed at the head office.",
     "Keep the manifest copies at the site and reconcile the waste inventory every quarter.", "2026-11-25", "Used oil manifest not available",
     "The manifests were retrieved from the head office and are now filed at the site. The waste inventory was reconciled."),
]
print("2. Findings with photos")
for group, name, rule, requirement, finding, root, plan, due, label, _fix in issues:
    status, body = auditor.send("POST", f"/api/capar/{rid}/findings", {
        "evidence_item_id": item(group, name)["id"], "outcome": "Violation", "item_status": "Verified", "act_rule": rule, "minimum_requirement": requirement,
        "finding": finding, "root_cause": root, "action_plan": plan, "timeline_date": due, "recommendation": "Close the action before the buyer follow-up visit.",
        "assessment": "Evidence sampled on site and cross-checked with the register."})
    fid = ok(f"finding: {name}", status, body)["data"]["id"]
    payload, ctype = multipart([("kind", "Photo"), ("caption", label)], [("files", "site-photo.png", "image/png", photo(label))])
    ok("   photo", *auditor.send("POST", f"/api/capar/{rid}/findings/{fid}/files", payload, content_type=ctype))
for group, name in (("Governance", "Company Profile"), ("Governance", "Business Registration License"), ("Social Security System", "Minimum wage Notification")):
    ok(f"no issue: {name}", *auditor.send("POST", f"/api/capar/{rid}/findings", {"evidence_item_id": item(group, name)["id"], "outcome": "No Violation", "item_status": "Not findings", "finding": "Checked and in order."}))

print("3. The auditor signs and submits")
ok("submitted to the employer", *auditor.send("POST", f"/api/capar/{rid}/submit", {"signature_kind": "drawn", "signature_data": signature(3)}))

print("4. The employer replies and answers every issue")
found = employer.send("GET", f"/api/capar/{rid}")[1]["data"]["findings"]
issue_rows = [f for f in found if f["outcome"] == "Violation"]
first = issue_rows[0]
ok("employer message", *employer.send("POST", f"/api/capar/{rid}/findings/{first['id']}/messages", {"subject": "Need 2 weeks for the Fire NOC renewal", "body": "The Fire Service has given the inspection date. We will upload the renewed NOC the same week."}))
ok("auditor message", *auditor.send("POST", f"/api/capar/{rid}/findings/{first['id']}/messages", {"subject": "Re: Need 2 weeks for the Fire NOC renewal", "body": "Agreed. Please attach the inspection acknowledgement now and the NOC when issued."}))
fixes = {issue[1]: issue[9] for issue in issues}
for f in issue_rows:
    text = next(v for k, v in fixes.items() if f["evidence_item_name"].startswith(k.split(" ")[0]))
    payload, ctype = multipart([], [("files", "proof.png", "image/png", photo("Proof: " + f["evidence_item_name"][:34], (190, 215, 190)))])
    ok("   proof", *employer.send("POST", f"/api/capar/{rid}/findings/{f['id']}/employer-files", payload, content_type=ctype))
    ok(f"   answered and signed: {f['evidence_item_name'][:30]}", *employer.send("POST", f"/api/capar/{rid}/findings/{f['id']}/respond", {"response_text": text, "signature_kind": "drawn", "signature_data": signature(7 + f['id'] % 5)}))

print("5. The auditor declines one answer and approves the rest")
declined = issue_rows[-1]
ok("declined with a reason", *auditor.send("POST", f"/api/capar/{rid}/findings/{declined['id']}/review", {"decision": "decline", "note": "The September manifest is still missing. Attach it and the reconciliation sheet."}))
for f in issue_rows[:-1]:
    ok(f"   approved: {f['evidence_item_name'][:30]}", *auditor.send("POST", f"/api/capar/{rid}/findings/{f['id']}/review", {"decision": "approve"}))

print("6. The employer answers the declined one again, the auditor approves, the report closes")
payload, ctype = multipart([], [("files", "manifest.png", "image/png", photo("September manifest and sheet", (190, 215, 190)))])
ok("   proof", *employer.send("POST", f"/api/capar/{rid}/findings/{declined['id']}/employer-files", payload, content_type=ctype))
ok("   answered again", *employer.send("POST", f"/api/capar/{rid}/findings/{declined['id']}/respond", {"response_text": "The September manifest and the reconciliation sheet are attached. All manifests are now filed at the site.", "signature_kind": "drawn", "signature_data": signature(11)}))
ok("   approved", *auditor.send("POST", f"/api/capar/{rid}/findings/{declined['id']}/review", {"decision": "approve"}))
final = auditor.send("GET", f"/api/capar/{rid}")[1]["data"]["report"]
print(f"\nReport {final['report_number']} is now: {final['status']} (Approved means closed).")
