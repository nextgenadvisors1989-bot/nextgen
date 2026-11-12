"""Loads an Act read from a PDF (scripts/act_parser_*.py -> JSON) into the Act builder through the site's own API: the Act in the register, then its chapters,
sections, sub sections, schedules, texts and amendment notes.

    python scripts/import-act.py factories.json                 # local demo administrator, http://127.0.0.1:3001
    LIVE_ADMIN_EMAIL=... LIVE_ADMIN_PASSWORD=... python3 scripts/import-act.py factories.json
    python scripts/import-act.py factories.json --replace       # first removes what the Act already has (only when nothing in CAPAR points at it)

Safe by default: an Act that already has chapters or sections is left alone (nothing is added twice). The Act is found in the register by its name and year; when it is
not there it is added. The chapters go in one request each (all or nothing), so a failure never leaves half a chapter.
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import Session  # noqa: E402

EMAIL = os.environ.get("LIVE_ADMIN_EMAIL", "demo.admin@complianceos.local")
PASSWORD = os.environ.get("LIVE_ADMIN_PASSWORD", "Admin@2026")


def squash(name):
    return re.sub(r"[^a-z0-9]", "", str(name or "").lower())


args = [a for a in sys.argv[1:] if not a.startswith("--")]
replace = "--replace" in sys.argv
if not args:
    sys.exit(__doc__)
data = json.loads(Path(args[0]).read_text(encoding="utf-8"))
act, nodes = data["act"], data["nodes"]


def count(tree):
    return sum(1 + count(n.get("children", [])) for n in tree)


print(f"{act['act_name']}: {len(nodes)} chapters and schedules, {count(nodes)} entries in all")

admin = Session()
ok, message = admin.login((EMAIL, PASSWORD))
if not ok:
    sys.exit(f"Could not sign in as {EMAIL}: {message}")


def find_act():
    page = 1
    while True:
        status, payload = admin.send("GET", f"/api/admin/compliance/acts?limit=100&page={page}")
        rows = payload.get("data") if isinstance(payload, dict) else None
        if status != 200 or not isinstance(rows, list):
            sys.exit(f"Could not read the Acts register: HTTP {status}")
        for row in rows:
            name = row.get("actName") or row.get("act_name")
            year = row.get("actYear") or row.get("act_year")
            if squash(name) == squash(act["act_name"]) or (squash(name).startswith(squash(act["short_name"])) and str(year or "") in ("", "None", str(act["act_year"]))):
                return int(row["id"]), row
        pages = ((payload.get("meta") or {}).get("pagination") or payload.get("pagination") or {}).get("totalPages", 1)
        if page >= int(pages or 1):
            return None, None
        page += 1


act_id, row = find_act()
if act_id is None:
    created = admin.call("POST", "/api/admin/compliance/acts", {**{k: v for k, v in act.items() if v is not None}, "status": "active", "show_on_public": True}, what="add the Act")
    if created is None:
        sys.exit(1)
    act_id = int((created.get("data") or created).get("actId"))
    print(f"  + added the Act to the register (id {act_id})")
else:
    print(f"  = the Act is in the register (id {act_id})")
    # fill the sub title and the dates if they are empty, keeping everything else as it is
    detail = admin.call("GET", f"/api/admin/compliance/acts/{act_id}", what="read the Act") or {}
    current = (detail.get("data") or detail).get("act") or (detail.get("data") or detail)
    pick = lambda *keys: next((current.get(k) for k in keys if current.get(k) not in (None, "")), None)
    body = {
        "act_name": pick("act_name", "actName"), "short_name": pick("short_name", "shortName") or act["short_name"], "subtitle": pick("subtitle") or act["subtitle"],
        "act_number": pick("act_number", "actNumber") or act["act_number"], "act_year": pick("act_year", "actYear") or act["act_year"],
        "jurisdiction": pick("jurisdiction") or "Central", "state_name": pick("state_name", "stateName"), "ministry": pick("ministry") or act.get("ministry"),
        "department": pick("department"), "enactment_date": (str(pick("enactment_date", "enactmentDate") or act["enactment_date"] or "")[:10]) or None,
        "effective_date": (str(pick("effective_date", "effectiveDate") or act["effective_date"] or "")[:10]) or None,
        "last_amended_date": (str(pick("last_amended_date", "lastAmendedDate") or "")[:10]) or None,
        "applicability_criteria": pick("applicability_criteria", "applicabilityCriteria"), "industry_applicability": pick("industry_applicability", "industryApplicability"),
        "employee_threshold": pick("employee_threshold", "employeeThreshold"), "summary": pick("summary") or act["summary"],
        "official_source_url": pick("official_source_url", "officialSourceUrl"), "status": pick("status") or "active",
    }
    if admin.call("PUT", f"/api/admin/compliance/acts/{act_id}", body, what="update the Act") is not None:
        print("  = sub title and dates filled where they were empty")

status, tree = admin.send("GET", f"/api/admin/compliance/acts/{act_id}/provisions")
existing = ((tree.get("data") or tree) if isinstance(tree, dict) else {}).get("tree") or []
if existing and not replace:
    print(f"  ! the Act already has {len(existing)} chapters / sections; nothing was added (use --replace to start again)")
    sys.exit(0)
for node in existing:
    if admin.call("DELETE", f"/api/admin/compliance/acts/{act_id}/provisions/{node['id']}", what=f"remove {node.get('title')}") is None:
        sys.exit("Could not remove what the Act already has; it was left as it is.")
if existing:
    print(f"  - removed {len(existing)} earlier chapters / sections")

created = 0
for node in nodes:
    result = admin.call("POST", f"/api/admin/compliance/acts/{act_id}/provisions/bulk", {"nodes": [node]}, what=f"{node['kind']} {node.get('number') or ''} {node['title'][:40]}")
    if result is None:
        sys.exit(f"Stopped at {node['kind']} {node.get('number')}; the chapters before it are in.")
    n = (result.get("data") or result).get("created", 0)
    created += n
    print(f"  + {node['kind']} {node.get('number') or ''} {node['title'][:50]}: {n} entries")
print(f"Done: {created} entries. Read it at /admin/compliance/acts/{act_id}/read")
