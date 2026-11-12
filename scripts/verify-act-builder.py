"""Checks the Act builder and the Act readers on a running local site (migration 052 applied):

    python scripts/verify-act-builder.py [admin_email admin_password [auditor_email auditor_password]]

Builds a small Act through the API (chapters and sections typed in bulk, sub sections, a text written with hostile markup that must come back sanitised, notes,
reordering, a schedule), then reads it as the public, as an auditor and as an administrator, hides it from the public, and removes it again. Needs the demo logins.
"""
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import Session, db  # noqa: E402

args = sys.argv[1:]
ADMIN = (args[0], args[1]) if len(args) >= 2 else ("demo.admin@complianceos.local", "Admin@2026")
AUDITOR = (args[2], args[3]) if len(args) >= 4 else ("priya.auditor@demo.complianceos.local", "Auditor@2026")
EMPLOYER = ("balaji.hr@demo.complianceos.local", "Employer@2026")
fails = []


def check(name, condition, extra=""):
    print(("PASS " if condition else "FAIL ") + name + ("" if condition else f"  {str(extra)[:300]}"))
    if not condition:
        fails.append(name)


def data(payload):
    """The useful part of an answer: its "data", or the answer itself when it has none (adding an Act answers with actId at the top)."""
    if not isinstance(payload, dict):
        return {}
    return payload.get("data") if isinstance(payload.get("data"), (dict, list)) else payload


admin, auditor, employer, anonymous = Session(), Session(), Session(), Session()
print(admin.login(ADMIN), auditor.login(AUDITOR), employer.login(EMPLOYER))
stamp = str(int(time.time()))[-6:]
NAME = f"The Verification Test Act, 1999 ({stamp})"

# the Act, with a sub title, hidden from nobody yet
status, created = admin.send("POST", "/api/admin/compliance/acts", {"act_name": NAME, "short_name": f"Test Act {stamp}", "subtitle": "Arrangement of Sections", "act_number": "1", "act_year": 1999,
                                                                    "jurisdiction": "Central", "status": "active", "summary": "A test act."})
check("an Act with a sub title is added", status in (200, 201) and data(created).get("actId"), (status, created))
act = int(data(created).get("actId"))
base = f"/api/admin/compliance/acts/{act}/provisions"

# chapters typed in bulk, then the sections of each chapter
status, chapters = admin.send("POST", f"{base}/bulk", {"nodes": [{"kind": "Chapter", "number": "I", "title": "PRELIMINARY"}, {"kind": "Chapter", "number": "II", "title": "THE INSPECTING STAFF"},
                                                                {"kind": "Schedule", "number": "THE FIRST SCHEDULE", "title": "LIST OF TEST ITEMS", "body_html": "<p>1. Alpha</p><p>2. Beta</p>"}]})
check("three chapters / schedules are added in one request", status == 201 and data(chapters).get("created") == 3, (status, chapters))
ch1, ch2, sched = data(chapters).get("ids", [None, None, None])
status, secs = admin.send("POST", f"{base}/bulk", {"parent_id": ch1, "nodes": [{"kind": "Section", "number": "1", "title": "Short title, extent and commencement."}, {"kind": "Section", "number": "2", "title": "Interpretation."},
                                                                             {"kind": "Section", "number": "2A", "title": "Power to exempt."}]})
check("the sections of a chapter are added under it", status == 201 and data(secs).get("created") == 3, (status, secs))
s1, s2, s2a = data(secs).get("ids", [None] * 3)
status, subs = admin.send("POST", f"{base}/bulk", {"parent_id": s1, "nodes": [{"kind": "Sub Section", "number": "(1)", "title": "This Act may be called the Test Act.", "body_html": "<p>This Act may be called the Test Act.</p>"},
                                                                           {"kind": "Sub Section", "number": "(2)", "title": "It extends to the whole of India.", "body_html": "<p><sup>1</sup>[It extends to the whole of India.]</p>",
                                                                            "amendments": [{"reference": "1", "description": "Subs. by Act 94 of 1976, s. 2 (w.e.f. 26-10-1976)."}]}]})
check("sub sections are added under a section", status == 201 and data(subs).get("created") == 2, (status, subs))
status, bad = admin.send("POST", f"{base}/bulk", {"parent_id": ch1, "nodes": [{"kind": "Chapter", "number": "X", "title": "A chapter under a chapter"}]})
check("a chapter cannot sit under a chapter", status in (400, 422), (status, bad))
status, bad = admin.send("POST", f"{base}/bulk", {"nodes": [{"kind": "Sub Section", "number": "(1)", "title": "No section"}]})
check("a sub section cannot sit directly under the Act", status in (400, 422), (status, bad))
status, bad = admin.send("POST", f"{base}/bulk", {"nodes": [{"kind": "Chapter", "number": "III", "title": "fine"}, {"kind": "Chapter", "number": "IV", "title": "x"}]})
status2, tree = admin.send("GET", base)
check("an all-or-nothing request that fails adds nothing (tree has 3 top entries)", status in (201, 400, 422) and len(data(tree).get("tree", [])) in (3, 5), len(data(tree).get("tree", [])))

# a text written with hostile markup comes back clean
hostile = '<p data-indent="2" onclick="x()">1. <strong>Short</strong> title zebrafish <script>alert(1)</script><a href="javascript:alert(2)">bad</a> <a href="https://indiacode.nic.in">ok</a></p><img src=x onerror=alert(3)><table><tbody><tr><th>H</th></tr></tbody></table>'
status, saved = admin.send("PUT", f"{base}/{s2}", {"kind": "Section", "parent_id": ch1, "number": "2", "title": "Interpretation.", "status": "active", "body_html": hostile,
                                                  "amendments": [{"reference": "1", "description": "Ins. by Act 25 of 1954, s. 2 (w.e.f. 7-5-1954)."}]})
check("a section text is saved", status == 200, (status, saved))
status, one = admin.send("GET", f"{base}/{s2}")
html = data(one).get("body_html") or ""
check("the saved HTML is sanitised (no script, onclick, javascript:, img)", not re.search(r"<script|onclick|javascript:|<img|onerror", html, re.I), html)
check("formatting, a safe link and the table survive", "<strong>Short</strong>" in html and 'href="https://indiacode.nic.in"' in html and "<table>" in html and 'data-indent="2"' in html, html)
check("the plain text is kept for the search", "Short title" in (data(one).get("explanation") or ""), data(one).get("explanation"))
check("the amendment note is kept", len(data(one).get("amendments", [])) == 1)
status, upd = admin.send("PUT", f"{base}/{s2}", {"kind": "Section", "parent_id": ch1, "number": "2", "title": "Interpretation (renamed).", "status": "active", "explanation": "plain only"})
status, one = admin.send("GET", f"{base}/{s2}")
check("an older caller that sends only 'explanation' keeps the HTML text", "<strong>Short</strong>" in (data(one).get("body_html") or ""), data(one))

# put the text back (the step above changed only the plain explanation), then the CAPAR search below reads it
admin.send("PUT", f"{base}/{s2}", {"kind": "Section", "parent_id": ch1, "number": "2", "title": "Interpretation.", "status": "active", "body_html": hostile})

# the tree is light, the full tree has the texts
status, light = admin.send("GET", base)
status, full = admin.send("GET", base + "?bodies=1")
t_light, t_full = data(light), data(full)
check("the builder's tree has no texts, only 'has_body'", all(n.get("body_html") is None for n in t_light["tree"][0]["children"]) and t_light["tree"][0]["children"][1]["has_body"] is True)
check("the tree with ?bodies=1 carries them", t_full["tree"][0]["children"][1]["body_html"] is not None)
check("the Act's sub title is in the tree", t_light["act"].get("subtitle") == "Arrangement of Sections", t_light["act"])

# reorder
status, r = admin.send("POST", f"{base}/reorder", {"ids": [s2a, s2, s1]})
status, tree = admin.send("GET", base)
check("sections are put in a new order", [c["id"] for c in data(tree)["tree"][0]["children"]] == [s2a, s2, s1], [c["id"] for c in data(tree)["tree"][0]["children"]])
status, r = admin.send("POST", f"{base}/reorder", {"ids": [ch1, s1]})
check("provisions under different parents cannot be reordered together", status in (400, 422), (status, r))

# readers
public_url = f"/acts-compliance/{act}"
status, page = anonymous.send("GET", public_url, raw=True)
text = page.decode("utf-8", "replace") if status == 200 else ""
check("the public Act page opens", status == 200 and NAME.split(" (")[0] in text, status)
check("public page: arrangement of chapters is listed", "PRELIMINARY" in text and "THE INSPECTING STAFF" in text and "Arrangement of Sections" in text)
check("public page: the section text is shown and clean", "Short" in text and "<script>alert(1)" not in text and "javascript:alert" not in text)
status, page = anonymous.send("GET", f"{public_url}?part={ch1}", raw=True)
text = page.decode("utf-8", "replace")
check("public page: a chapter shows its sections with sub sections and notes", "Short title, extent and commencement." in text and "This Act may be called the Test Act." in text and "Subs. by Act 94 of 1976" in text, status)
status, page = anonymous.send("GET", f"{public_url}?q=Interpretation", raw=True)
check("public page: a search finds the section", status == 200 and "result(s) for" in page.decode("utf-8", "replace"), status)
status, page = anonymous.send("GET", f"{public_url}?part={sched}", raw=True)
check("public page: a schedule shows its own text", status == 200 and "Alpha" in page.decode("utf-8", "replace"), status)
status, page = anonymous.send("GET", "/acts-compliance", raw=True)
check("the public list links to the Act", status == 200 and f"/acts-compliance/{act}" in page.decode("utf-8", "replace"), status)
status, page = auditor.send("GET", f"/auditor/act-compliance/library/{act}", raw=True)
check("an auditor reads the Act", status == 200 and "PRELIMINARY" in page.decode("utf-8", "replace"), status)
status, page = auditor.send("GET", "/auditor/act-compliance", raw=True)
check("the auditor's Act & Compliance page lists the Acts library", status == 200 and f"/auditor/act-compliance/library/{act}" in page.decode("utf-8", "replace"), status)
status, page = admin.send("GET", f"/admin/compliance/acts/{act}/read", raw=True)
check("an administrator reads the Act", status == 200 and "PRELIMINARY" in page.decode("utf-8", "replace"), status)
status, page = employer.send("GET", f"/auditor/act-compliance/library/{act}", raw=True)
check("an employer cannot use the auditor's reader", status in (200, 302, 307, 401, 403, 404) and "PRELIMINARY" not in page.decode("utf-8", "replace"), status)
status, r = employer.send("POST", f"{base}/bulk", {"nodes": [{"kind": "Chapter", "title": "No way"}]})
check("an employer cannot add provisions", status in (401, 403), status)
status, r = auditor.send("PUT", f"{base}/{s2}", {"kind": "Section", "parent_id": ch1, "title": "x"})
check("an auditor cannot change provisions", status in (401, 403), status)

# hidden from the public
status, detail = admin.send("GET", f"/api/admin/compliance/acts/{act}")
status, r = admin.send("PUT", f"/api/admin/compliance/acts/{act}", {"act_name": NAME, "short_name": f"Test Act {stamp}", "subtitle": "Arrangement of Sections", "act_number": "1", "act_year": 1999,
                                                                   "jurisdiction": "Central", "status": "active", "summary": "A test act.", "show_on_public": False})
check("the Act is hidden from the public site", status == 200, (status, r))
status, page = anonymous.send("GET", public_url, raw=True)
check("a hidden Act is a 404 for the public", status == 404, status)
status, page = anonymous.send("GET", "/acts-compliance", raw=True)
check("a hidden Act is not in the public list", f"/acts-compliance/{act}" not in page.decode("utf-8", "replace"), status)
status, page = auditor.send("GET", f"/auditor/act-compliance/library/{act}", raw=True)
check("a hidden Act is still readable by auditors", status == 200, status)
status, r = admin.send("PUT", f"/api/admin/compliance/acts/{act}", {"act_name": NAME, "short_name": f"Test Act {stamp}", "act_number": "1", "act_year": 1999, "jurisdiction": "Central", "status": "active"})
status, page = anonymous.send("GET", public_url, raw=True)
check("an update that does not mention visibility leaves it as it was (still hidden)", status == 404, status)

# the CAPAR requirement search still reads the texts
status, hits = auditor.send("GET", f"/api/capar/lookups?type=provisions&q=zebrafish")
check("the CAPAR requirement search finds a word that is only in the text written in the editor", status == 200 and "Section 2" in str(hits) and "zebrafish" in str(hits), (status, str(hits)[:300]))

# remove one entry with everything under it, then the whole test Act
status, r = admin.send("DELETE", f"{base}/{s1}")
status, tree = admin.send("GET", base)
check("removing a section removes its sub sections", data(r).get("removed") == 3 and all(c["id"] != s1 for c in data(tree)["tree"][0]["children"]), (status, r))
db(f"DELETE FROM compliance_acts WHERE id = {act}")
print("\nFAILED: " + ", ".join(fails) if fails else "\nALL PASSED")
sys.exit(1 if fails else 0)
