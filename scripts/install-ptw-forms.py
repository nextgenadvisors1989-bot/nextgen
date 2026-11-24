"""Installs the client's seven Permit to Work forms (file "PTW's .pdf", client's note: "Please don't change any content") through the
site's own API, replacing the shorter permits the platform shipped with:

    Cold Work Permit    Confined Space to Entry Permit    Electrical (Isolation) Permit    Excavation Permit
    Hot Work Permit     Lifting Operation Permit          Work at Height Permit

"Confined Space Entry Permit" and "Electrical Isolation (LOTO) Permit" are renamed to the client's names, in place, so links and history stay.
Safe to run again: a permit that already has the client's structure is left alone, and a permit somebody has already filled in is NEVER rebuilt
(it is listed at the end so it can be handled by hand: its records keep the old fields).

    LIVE_ADMIN_EMAIL='you@company.com' LIVE_ADMIN_PASSWORD='...' python3 scripts/install-ptw-forms.py

Without those two variables the local demo administrator is used. SEED_BASE (default http://127.0.0.1:3001) is the app's address.
"""
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import Session  # noqa: E402  (standard library only)
from forms_catalogue_ptw import PTW_CATALOGUE  # noqa: E402

EMAIL = os.environ.get("LIVE_ADMIN_EMAIL", "demo.admin@complianceos.local")
PASSWORD = os.environ.get("LIVE_ADMIN_PASSWORD", "Admin@2026")

admin = Session()
ok, message = admin.login((EMAIL, PASSWORD))
if not ok:
    sys.exit(f"Could not sign in as {EMAIL}: {message}")


def rows(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "rows", "items"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def find_module(name):
    payload = admin.call("GET", f"/api/admin/dynamic-modules?limit=50&search={name.replace(' ', '%20')}", what=f"find {name}")
    for row in rows(payload):
        if str(row.get("name")) == name:
            return int(row["id"])
    return None


def detail(module_id):
    payload = admin.call("GET", f"/api/admin/dynamic-modules/{module_id}", what="module detail") or {}
    return payload.get("data", payload)


def structure_of(form_id):
    payload = admin.call("GET", f"/api/admin/dynamic-forms/{form_id}", what="form detail") or {}
    return (payload.get("data", payload).get("structure") or {})


def titles(structure):
    return [str(s.get("title")) for s in (structure.get("sections") or [])]


def rename(module_id, current, new_name):
    module = current["module"]
    payload = {"name": new_name, "slug": re.sub(r"[^a-z0-9]+", "-", new_name.lower()).strip("-"), "description": module.get("description"), "icon": module.get("icon"),
               "category": module.get("category"), "version": module.get("version") or "1.0", "module_type": module.get("module_type"),
               "default_tat_days": module.get("default_tat_days"), "requires_verification": bool(module.get("requires_verification")),
               "is_public": bool(module.get("is_public")), "sort_order": module.get("sort_order") or 0, "status": module.get("status") or "published"}
    return admin.call("PUT", f"/api/admin/dynamic-modules/{module_id}", payload, what=f"rename to {new_name}") is not None


print("Permit to Work forms")
left_alone = []
for name, builder, module_type, category, old_name in PTW_CATALOGUE:
    structure = builder()
    module_id = find_module(name)
    renamed_from = None
    if module_id is None and old_name:
        module_id = find_module(old_name)
        renamed_from = old_name if module_id else None
    if module_id is None:
        created = admin.call("POST", "/api/admin/dynamic-modules", {
            "name": name, "description": structure["description"], "category": category, "module_type": module_type, "default_tat_days": 1,
            "requires_verification": True, "is_public": False, "create_default_form": True, "roles": []}, what=f"create module {name}")
        if not created:
            continue
        payload = created.get("data", created)
        module_id, form_id = int(payload["moduleId"]), int(payload["formId"])
        print(f"  + module {name}")
    else:
        current = detail(module_id)
        forms = current.get("forms") or []
        if not forms:
            print(f"  ! {name}: the module has no form")
            continue
        form_id, submissions = int(forms[0]["id"]), int(forms[0].get("submission_count") or 0)
        if submissions:
            print(f"  ! {name}: {submissions} record(s) already filled in, left as it is")
            left_alone.append(name if not renamed_from else renamed_from)
            continue
        if titles(structure_of(form_id)) == titles(structure):
            print(f"  = {name}: already installed")
            continue
        if renamed_from and rename(module_id, current, name):
            print(f"  ~ {renamed_from} is now called {name}")
    if not admin.call("PUT", f"/api/admin/dynamic-forms/{form_id}", structure, what=f"structure {name}"):
        continue
    admin.call("POST", f"/api/admin/dynamic-forms/{form_id}/publish", {}, what=f"publish form {name}")
    admin.call("POST", f"/api/admin/dynamic-modules/{module_id}/publish", {}, what=f"publish module {name}")
    fields = sum(len(s["fields"]) for s in structure["sections"])
    tables = sum(len(s["tables"]) for s in structure["sections"])
    print(f"  + {name}: {len(structure['sections'])} sections, {fields} fields, {tables} tables")

if left_alone:
    print("\nNot rebuilt because records exist: " + ", ".join(left_alone))
print("Done.")
