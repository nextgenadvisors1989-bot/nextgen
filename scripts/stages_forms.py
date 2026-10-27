"""Seed stage: the client's audit forms, the auditor types that own them, and the auditor-type -> forms mapping."""
from seed_common import admin, iso
from seed_lib import db, q1, section, sql_text

from forms_catalogue import AUDITOR_TYPES, CATALOGUE, EXISTING_MODULE_TYPES

# Forms whose structure changed after they were first seeded: the new structure replaces the old one.
REFRESH = {"ETP Functionality Assessment"}
NEW_AUDITORS = [
    ("Meenakshi Sundaram", "meenakshi.auditor@demo.complianceos.local", "+919790011005", "GHG", "Energy and GHG Auditor", "Environmental"),
    ("Rajesh Natarajan", "rajesh.auditor@demo.complianceos.local", "+919790011006", "TEXSTD", "Textile Standards Auditor", "Textiles"),
    ("Divya Ramesh", "divya.auditor@demo.complianceos.local", "+919790011008", "FOOD", "Food Safety Auditor", "Food Safety"),
    ("Suresh Kannan", "suresh.auditor@demo.complianceos.local", "+919790011009", "ELEC", "Electrical Safety Auditor", "Electrical Safety"),
    ("Latha Krishnamurthy", "latha.auditor@demo.complianceos.local", "+919790011007", "LEGAL", "Statutory Compliance Auditor", "Manufacturing"),
]
# demo auditor email -> type code (so each demo login sees the forms of its own kind of audit)
RETYPE = {
    "priya.auditor@demo.complianceos.local": "SAFETY", "karthik.auditor@demo.complianceos.local": "WATER",
    "deepa.auditor@demo.complianceos.local": "PAYROLL", "anand.auditor@demo.complianceos.local": "FIRE",
    "auditor.test@complianceos.local": "ENV",
}


def type_ids():
    return {code: int(i) for i, code in db("SELECT id, code FROM auditor_types WHERE deleted_at IS NULL")}


def stage_forms():
    section("Auditor types")
    ids = type_ids()
    for code, name, specialization, description in AUDITOR_TYPES:
        if code in ids:
            continue
        result = admin.call("POST", "/api/admin/auditor-types", {"name": name, "code": code, "description": description,
                                                                   "specialization": specialization, "status": "active"}, what=f"type {code}")
        if result:
            print(f"  + auditor type {name}")
    ids = type_ids()

    section("Form modules")
    modules = {}
    for name, builder, module_type, category, codes in CATALOGUE:
        existing = q1(f"SELECT id FROM dynamic_modules WHERE name={sql_text(name)} AND deleted_at IS NULL")
        structure = builder()
        if existing:
            module_id = int(existing)
            form_id = int(q1(f"SELECT id FROM dynamic_forms WHERE module_id={module_id} ORDER BY id LIMIT 1", 0))
            modules[name] = (module_id, codes)
            db(f"UPDATE dynamic_modules SET module_type={sql_text(module_type)} WHERE id={module_id}")
            if name in REFRESH and int(q1(f"SELECT COUNT(*) FROM dynamic_form_submissions WHERE form_id={form_id}", 0)) == 0:
                # old sections go (fields, options and tables cascade) so the new structure does not clash on field keys
                db(f"DELETE FROM dynamic_form_sections WHERE form_id={form_id}")
            if int(q1(f"SELECT COUNT(*) FROM dynamic_form_sections WHERE form_id={form_id}", 0)) == 0:
                admin.call("PUT", f"/api/admin/dynamic-forms/{form_id}", structure, what=f"structure {name}")
                admin.call("POST", f"/api/admin/dynamic-forms/{form_id}/publish", {}, what=f"publish form {name}")
                admin.call("POST", f"/api/admin/dynamic-modules/{module_id}/publish", {}, what=f"publish module {name}")
            continue
        module = admin.call("POST", "/api/admin/dynamic-modules", {
            "name": name, "description": structure["description"], "category": category, "module_type": module_type, "default_tat_days": 15,
            "requires_verification": True, "is_public": False, "create_default_form": True, "roles": []}, what=f"module {name}")
        if not module:
            continue
        module_id, form_id = int(module["moduleId"]), int(module["formId"])
        if not admin.call("PUT", f"/api/admin/dynamic-forms/{form_id}", structure, what=f"structure {name}"):
            continue
        admin.call("POST", f"/api/admin/dynamic-forms/{form_id}/publish", {}, what=f"publish form {name}")
        admin.call("POST", f"/api/admin/dynamic-modules/{module_id}/publish", {}, what=f"publish module {name}")
        modules[name] = (module_id, codes)
        print(f"  + {name}")

    for name, codes in EXISTING_MODULE_TYPES.items():
        row = q1(f"SELECT id FROM dynamic_modules WHERE name={sql_text(name)} AND deleted_at IS NULL")
        if row:
            modules[name] = (int(row), codes)

    section("Auditor type -> forms")
    wanted = {}
    for module_id, codes in modules.values():
        for code in codes:
            wanted.setdefault(code, set()).add(module_id)
    for code, module_ids in wanted.items():
        type_id = ids.get(code)
        if not type_id:
            continue
        current = {int(r[0]) for r in db(f"SELECT module_id FROM auditor_type_modules WHERE auditor_type_id={type_id}")}
        merged = sorted(current | module_ids)
        if merged != sorted(current):
            admin.call("PUT", f"/api/admin/auditor-types/{type_id}/modules", {"module_ids": merged}, what=f"map {code}")
        print(f"  {code:8s} {len(merged)} form module(s)")

    section("Demo auditors per type")
    for name, email, mobile, code, role_title, specialization in NEW_AUDITORS:
        if q1(f"SELECT id FROM auditors WHERE email={sql_text(email)}") or code not in ids:
            continue
        result = admin.call("POST", "/api/admin/auditors", {
            "name": name, "email": email, "mobile": mobile, "auditor_type_id": ids[code], "role_title": role_title, "specialization": specialization,
            "experience_years": 8, "city": "Tiruppur", "state": "Tamil Nadu", "date_of_joining": iso(-700), "max_concurrent_audits": 5, "status": "active",
            "create_portal_user": True, "portal_user_email": email, "portal_user_name": name}, what=f"auditor {name}")
        if result:
            print(f"  + auditor {name} ({code})")
    for email, code in RETYPE.items():
        if code in ids:
            db(f"UPDATE auditors SET auditor_type_id={ids[code]} WHERE email={sql_text(email)}")
    print("  done")
