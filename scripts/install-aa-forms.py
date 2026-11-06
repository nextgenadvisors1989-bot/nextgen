"""Installs the Audit and Assessment forms built from the client's sample files (2026-11-05) through the site's own API, and links each
Audit and Assessment entry to its forms. The client's own headings for the files are the four jobs of the environmental auditor, so they all sit
under "Environmental Audit and Statement":

    Environmental Audit Report            the two environmental audit reports integrated into one form
    Risk Engineering Compliance Report    "Risk Engineering"
    ETP Functionality Assessment          the functionality form and the H&M ETP Assessment Document List
    Environmental Aspects and Impacts Register   "Environmental Risk Impact Register" (SR - Form 001)

(the same forms stay under Fire Safety, Risk Assessment and ETP Design and Functionality, where they were first linked).

Links are added to the ones an entry already has (the existing forms stay); change them any time from Audit and Assessment (admin).
Safe to run again: a form that already has its structure is left alone, and a form somebody has already filled in is never rebuilt.
Migration 050 empties the three older, shorter versions (ETP document list, aspects register, risk engineering report) when nobody has used them,
so run `npm run db:migrate` first; this script then writes the complete structure.

    LIVE_ADMIN_EMAIL='you@company.com' LIVE_ADMIN_PASSWORD='...' python3 scripts/install-aa-forms.py

Without those two variables the local demo administrator is used. SEED_BASE (default http://127.0.0.1:3001) is the app's address.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import Session  # noqa: E402  (standard library only)
from forms_catalogue import AUDITOR_TYPES  # noqa: E402
from forms_catalogue_aa_environment import AA_ENV_CATALOGUE  # noqa: E402
from forms_catalogue_aa_studies import AA_STUDIES_CATALOGUE  # noqa: E402
from forms_catalogue_aa_site import AA_SITE_CATALOGUE  # noqa: E402
from forms_catalogue_aa_batch3 import AA_BATCH3_CATALOGUE  # noqa: E402
from forms_catalogue_aa_etp import AA_ETP_CATALOGUE  # noqa: E402

EMAIL = os.environ.get("LIVE_ADMIN_EMAIL", "demo.admin@complianceos.local")
PASSWORD = os.environ.get("LIVE_ADMIN_PASSWORD", "Admin@2026")

# Audit and Assessment entry (name starts with) -> the forms (module names) it should open
LINKS = {
    "ETP Design and Functionality Assessment": ["ETP Assessment Document List", "ETP Treatment Level Assessment"],
    "Risk Assessment (Safety and Environment)": ["Environmental Aspects and Impacts Register"],
    "Fire Safety Audit": ["Fire Safety Audit Report", "Risk Engineering Compliance Report"],
    "Safety Audits (IS 14489:2018)": ["Safety Audit Report"],
    "Factory Capacity and Capability Audit": ["Factory Capability and Capacity Audit"],
    "Common and Captive TSDF Audit": ["Integrated CHWTSDF Audit Report"],
    "Life Cycle Assessment": ["Life Cycle Assessment Report"],
    "Certified Compliance Report": ["Certified Compliance Report (CCR)"],
    "Ground Water Extraction NOC": ["Ground Water Extraction NOC Application"],
    "Environmental Audit and Statement": ["Environmental Audit Report", "Risk Engineering Compliance Report", "ETP Functionality Assessment",
                                          "ETP Assessment Document List", "ETP Treatment Level Assessment", "Environmental Aspects and Impacts Register"],
    "Energy Audit and Water Audit": ["Water Audit Report", "Resource Data Management (Water, Waste and Energy)"],
    "Environmental Impact Assessment": ["Environmental Impact Assessment Report"],
}

# Entries of the client's own headings that the list of audits did not have yet
NEW_ENTRIES = ["Environmental Impact Assessment (EIA)", "Life Cycle Assessment (LCA)", "Certified Compliance Report (CCR)", "Ground Water Extraction NOC Application"]

# First drafts that the integrated form replaces; removed when nobody has filled them in
RETIRE = ["Environmental Audit Report (Green Audit)", "Environment Audit Report - Carbon Footprint"]

admin = Session()
ok, message = admin.login((EMAIL, PASSWORD))
if not ok:
    sys.exit(f"Could not sign in as {EMAIL}: {message}")


def rows(payload):
    """The list inside an API answer, whichever way it is wrapped."""
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


def form_of(module_id):
    payload = admin.call("GET", f"/api/admin/dynamic-modules/{module_id}", what="module detail") or {}
    detail = payload.get("data", payload)
    forms = detail.get("forms") or []
    return int(forms[0]["id"]) if forms else None, int(forms[0].get("submission_count") or 0) if forms else 0


def section_count(form_id):
    payload = admin.call("GET", f"/api/admin/dynamic-forms/{form_id}", what="form detail") or {}
    detail = payload.get("data", payload)
    structure = detail.get("structure") or detail
    return len(structure.get("sections") or [])


def retire(name):
    module_id = find_module(name)
    if module_id is None:
        return
    form_id, submissions = form_of(module_id)
    if submissions:
        print(f"  ! {name}: has {submissions} submission(s), left in place")
        return
    if admin.call("DELETE", f"/api/admin/dynamic-modules/{module_id}", what=f"retire {name}") is not None:
        print(f"  - {name}: replaced by the integrated form")


def install(name, builder, module_type, category):
    module_id = find_module(name)
    structure = builder()
    if module_id is None:
        created = admin.call("POST", "/api/admin/dynamic-modules", {
            "name": name, "description": structure["description"], "category": category, "module_type": module_type, "default_tat_days": 15,
            "requires_verification": True, "is_public": False, "create_default_form": True, "roles": []}, what=f"create module {name}")
        if not created:
            return None
        payload = created.get("data", created)
        module_id, form_id = int(payload["moduleId"]), int(payload["formId"])
        print(f"  + module {name}")
    else:
        form_id, submissions = form_of(module_id)
        if form_id is None:
            print(f"  ! {name}: the module has no form")
            return None
        if section_count(form_id) > 0:
            note = " (it has submissions, so it was not rebuilt)" if submissions else ""
            print(f"  = {name}: already installed{note}")
            return module_id, form_id
    if not admin.call("PUT", f"/api/admin/dynamic-forms/{form_id}", structure, what=f"structure {name}"):
        return None
    admin.call("POST", f"/api/admin/dynamic-forms/{form_id}/publish", {}, what=f"publish form {name}")
    admin.call("POST", f"/api/admin/dynamic-modules/{module_id}/publish", {}, what=f"publish module {name}")
    fields = sum(len(s["fields"]) for s in structure["sections"])
    tables = sum(len(s["tables"]) for s in structure["sections"])
    print(f"  + {name}: {len(structure['sections'])} sections, {fields} fields, {tables} tables")
    return module_id, form_id


print("Forms")
for name in RETIRE:
    retire(name)
installed = {}
for name, builder, module_type, category, codes in [*AA_SITE_CATALOGUE, *AA_ENV_CATALOGUE, *AA_STUDIES_CATALOGUE, *AA_BATCH3_CATALOGUE, *AA_ETP_CATALOGUE]:
    result = install(name, builder, module_type, category)
    if result:
        installed[name] = (result[0], result[1], codes)

print("Auditor types -> forms")
types = {str(t.get("code")): int(t["id"]) for t in rows(admin.call("GET", "/api/admin/auditor-types?limit=100", what="auditor types"))}
for code in sorted({c for _, _, codes in installed.values() for c in codes}):
    type_id = types.get(code)
    if not type_id:
        print(f"  ! no auditor type {code}")
        continue
    state = admin.call("GET", f"/api/admin/auditor-types/{type_id}/modules", what=f"modules of {code}") or {}
    state = state.get("data", state)
    current = {int(m["id"]) for m in (state.get("assigned") or [])}
    wanted = {module_id for module_id, _, codes in installed.values() if code in codes}
    merged = sorted(current | wanted)
    if merged != sorted(current):
        admin.call("PUT", f"/api/admin/auditor-types/{type_id}/modules", {"module_ids": merged}, what=f"map {code}")
    print(f"  {code:8s} {len(merged)} form module(s)")

print("Audit and Assessment entries")
entries = rows(admin.call("GET", "/api/compliance-register/types", what="audit types"))
for new_name in NEW_ENTRIES:
    if not any(str(e["name"]) == new_name for e in entries) and admin.call("POST", "/api/compliance-register/types", {"name": new_name}, what=f"add {new_name}") is not None:
        print(f"  + entry {new_name}")
entries = rows(admin.call("GET", "/api/compliance-register/types", what="audit types"))
for entry in entries:
    for prefix, names in LINKS.items():
        if not str(entry["name"]).startswith(prefix):
            continue
        wanted = []
        for n in names:
            if n in installed:
                wanted.append(installed[n][1])
            elif find_module(n) is not None:
                form_id, _ = form_of(find_module(n))
                if form_id:
                    wanted.append(form_id)
        if not wanted:
            continue
        current = [int(form["id"]) for form in entry.get("forms", [])]
        merged = current + [f for f in wanted if f not in current]
        if merged != current:
            result = admin.call("PUT", f"/api/compliance-register/types/{entry['id']}", {"name": entry["name"], "form_ids": merged}, what=f"link {entry['name']}")
            if result is not None:
                print(f"  + {entry['name'][:60]}: {len(merged)} form(s)")
        else:
            print(f"  = {entry['name'][:60]}: already linked")
print("Done.")
