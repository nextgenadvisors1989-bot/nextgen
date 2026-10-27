"""Rebuild the Phase 3 fixture through the public API.

Creates module -> form structure -> publishes -> auditor draft -> submit ->
verifier approve, printing each step so the UI pages have real data to render.
"""
import json
import subprocess
import sys

BASE = "http://127.0.0.1:3001"
ADMIN = "/tmp/fx_admin.txt"
AUD = "/tmp/fx_aud.txt"
VER = "/tmp/fx_ver.txt"


def csrf_from(jar):
    try:
        with open(jar, encoding="utf-8") as handle:
            for line in handle:
                parts = line.split("\t")
                if len(parts) >= 7 and parts[5] == "cos_csrf":
                    return parts[6].strip()
    except FileNotFoundError:
        pass
    return ""


def curl(args, jar, data=None, method=None):
    cmd = ["curl", "-s", "-b", jar, "-c", jar]
    if method:
        cmd += ["-X", method]
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        cmd += ["-H", f"x-csrf-token: {csrf_from(jar)}"]
    if data is not None:
        cmd += ["-H", "content-type: application/json", "-d", json.dumps(data)]
    cmd.append(BASE + args)
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"_raw": out[:400]}


SIGNATURE_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000" "01f15c4890000000d4944415478da63f8cf00000301010018"
    "dd8db00000000049454e44ae426082"
)


def upload_signature(jar, submission_id):
    """POST the signature image exactly the way the renderer does."""
    with open("/tmp/fx_signature.png", "wb") as handle:
        handle.write(SIGNATURE_PNG)
    cmd = [
        "curl", "-s", "-b", jar, "-c", jar, "-X", "POST",
        "-H", f"x-csrf-token: {csrf_from(jar)}",
        "-F", "files=@/tmp/fx_signature.png;type=image/png",
        "-F", "entityType=SUBMISSION",
        "-F", f"entityId={submission_id}",
        "-F", "category=signature",
        BASE + "/api/files/upload",
    ]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"_raw": out[:300]}


def login(jar, identifier, password):
    subprocess.run(["rm", "-f", jar])
    body = curl("/api/auth/login", jar, {"identifier": identifier, "password": password}, "POST")
    ok = body.get("success")
    print(f"login {identifier}: {'200' if ok else 'FAILED ' + str(body)[:200]}")
    return ok


def main():
    if not login(ADMIN, __import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026")):
        sys.exit(1)

    module = curl("/api/admin/dynamic-modules", ADMIN, {
        "name": "Fire Safety Compliance Audit",
        "description": "Statutory fire-safety walkthrough used by fire auditors on site visits.",
        "category": "Fire & Safety",
        "module_type": "AUDIT",
        "default_tat_days": 15,
        "requires_verification": True,
        "is_public": False,
        "create_default_form": True,
        "roles": ["auditor"],
    }, "POST")
    print("create module:", json.dumps(module)[:220])
    if not module.get("success"):
        sys.exit(1)
    module_id = module["moduleId"]
    form_id = module["formId"]

    structure = {
        "name": "Fire Safety Walkthrough",
        "description": "Site inspection covering fire prevention, extinguishers and evacuation readiness.",
        "form_type": "AUDIT",
        "layout_columns": 2,
        "requires_signature": True,
        "requires_attachments": False,
        "allow_draft": True,
        "auto_number_prefix": "FSA",
        "sections": [
            {
                "title": "Site particulars", "section_code": "SITE", "layout_columns": 2,
                "is_collapsible": False, "is_collapsed": False, "show_in_pdf": True,
                "page_break_before": False, "fields": [
                    {"field_key": "site_name", "label": "Site name", "field_type": "text",
                     "is_required": True, "column_width": 6, "placeholder": "Registered premises name"},
                    {"field_key": "inspection_date", "label": "Inspection date", "field_type": "date",
                     "is_required": True, "column_width": 6},
                    {"field_key": "occupancy_type", "label": "Occupancy type", "field_type": "select",
                     "is_required": True, "column_width": 6, "options": [
                         {"option_key": "industrial", "option_label": "Industrial"},
                         {"option_key": "commercial", "option_label": "Commercial"},
                         {"option_key": "residential", "option_label": "Residential"},
                     ]},
                    {"field_key": "remarks", "label": "Observations", "field_type": "textarea",
                     "column_width": 6},
                ], "tables": [],
            },
            {
                "title": "Fire prevention", "section_code": "PREV", "layout_columns": 2,
                "is_collapsible": False, "is_collapsed": False, "show_in_pdf": True,
                "page_break_before": False, "fields": [
                    {"field_key": "extinguisher_coverage", "label": "Fire extinguisher coverage",
                     "field_type": "radio", "is_required": True, "column_width": 6, "options": [
                         {"option_key": "adequate", "option_label": "Adequate", "score": 10},
                         {"option_key": "partial", "option_label": "Partially adequate", "score": 5},
                         {"option_key": "missing", "option_label": "Inadequate", "score": 0},
                     ]},
                    {"field_key": "exit_signage", "label": "Exit signage and lighting",
                     "field_type": "radio", "is_required": True, "column_width": 6, "options": [
                         {"option_key": "compliant", "option_label": "Fully compliant", "score": 10},
                         {"option_key": "minor", "option_label": "Minor gaps", "score": 6},
                         {"option_key": "noncompliant", "option_label": "Non-compliant", "score": 0},
                     ]},
                    {"field_key": "training_drills", "label": "Drills conducted in the last 6 months",
                     "field_type": "number", "is_required": True, "column_width": 4,
                     "validation_json": {"max_score": 10}},
                    {"field_key": "defects_found", "label": "Number of defects identified",
                     "field_type": "number", "column_width": 4,
                     "validation_json": {"max_score": 10}},
                    {"field_key": "risk_score", "label": "Weighted risk score (auto)",
                     "field_type": "formula", "column_width": 4,
                     "formula_expression": "extinguisher_coverage + exit_signage + training_drills - defects_found"},
                ], "tables": [],
            },
            {
                "title": "Extinguisher register", "section_code": "REG", "layout_columns": 1,
                "is_collapsible": True, "is_collapsed": False, "show_in_pdf": True,
                "page_break_before": True, "fields": [], "tables": [
                    {"table_key": "extinguisher_register", "table_name": "Extinguisher register",
                     "description": "Every extinguisher inspected during the walkthrough.",
                     "is_repeatable": True, "min_rows": 1, "max_rows": 50,
                     "show_row_numbers": True, "show_totals": True, "show_in_pdf": True, "columns": [
                         {"column_key": "location", "column_label": "Location", "column_type": "text",
                          "is_required": True, "is_editable": True, "width_pct": 30},
                         {"column_key": "type", "column_label": "Type", "column_type": "select",
                          "is_required": True, "is_editable": True, "width_pct": 20, "options_json": [
                              {"option_key": "co2", "option_label": "CO2"},
                              {"option_key": "foam", "option_label": "Foam"},
                              {"option_key": "dry_powder", "option_label": "Dry powder"},
                          ]},
                         {"column_key": "capacity_kg", "column_label": "Capacity (kg)",
                          "column_type": "decimal", "is_editable": True, "is_total": True, "width_pct": 20},
                         {"column_key": "verified", "column_label": "Verified", "column_type": "checkbox",
                          "is_editable": True, "width_pct": 15},
                     ]},
                ],
            },
            {
                "title": "Sign-off", "section_code": "SIGN", "layout_columns": 2,
                "is_collapsible": False, "is_collapsed": False, "show_in_pdf": True,
                "page_break_before": False, "fields": [
                    {"field_key": "declaration", "label": "I confirm the walkthrough was carried out in person",
                     "field_type": "checkbox", "is_required": True, "column_width": 12},
                    {"field_key": "auditor_signature", "label": "Auditor signature",
                     "field_type": "signature", "is_required": True, "column_width": 12},
                ], "tables": [],
            },
        ],
    }
    saved = curl(f"/api/admin/dynamic-forms/{form_id}", ADMIN, structure, "PUT")
    print("save structure:", json.dumps(saved)[:200])
    published = curl(f"/api/admin/dynamic-forms/{form_id}/publish", ADMIN, {}, "POST")
    print("publish form:", json.dumps(published)[:200])
    module_pub = curl(f"/api/admin/dynamic-modules/{module_id}/publish", ADMIN, {}, "POST")
    print("publish module:", json.dumps(module_pub)[:200])

    if not login(AUD, "auditor.test@complianceos.local", "Auditor@2026"):
        sys.exit(1)
    started = curl("/api/auditor/submissions", AUD, {"form_id": form_id}, "POST")
    print("start submission:", json.dumps(started)[:200])
    submission_id = started["submissionId"]
    number = started["submissionNumber"]

    draft = curl(f"/api/auditor/submissions/{submission_id}", AUD, {
        "values": {
            "site_name": "Ambattur Unit II",
            "inspection_date": "2026-10-05",
            "occupancy_type": "industrial",
            "remarks": "Sprinkler line on the north wall needs re-painting.",
            "extinguisher_coverage": "adequate",
            "exit_signage": "minor",
            "training_drills": 2,
            "defects_found": 1,
        },
        "table_rows": {"extinguisher_register": [
            {"location": "Store 1", "type": "co2", "capacity_kg": 4.5, "verified": True},
            {"location": "Packing bay", "type": "foam", "capacity_kg": 9, "verified": True},
            {"location": "Generator room", "type": "dry_powder", "capacity_kg": 5, "verified": False},
        ]},
    }, "PUT")
    print("save draft:", json.dumps({k: v for k, v in draft.items() if k in ("success", "status", "score", "issues", "filled", "requiredMissing")})[:320])

    upload = upload_signature(AUD, submission_id)
    file_id = None
    if upload.get("success"):
        payload = upload.get("data") or upload
        if isinstance(payload, dict) and isinstance(payload.get("files"), list) and payload["files"]:
            file_id = payload["files"][0].get("id")
        file_id = file_id or payload.get("id")
    print("signature upload:", json.dumps(upload)[:200])

    signed = curl(f"/api/auditor/submissions/{submission_id}", AUD, {
        "values": {
            "site_name": "Ambattur Unit II",
            "inspection_date": "2026-10-05",
            "occupancy_type": "industrial",
            "remarks": "Sprinkler line on the north wall needs re-painting.",
            "extinguisher_coverage": "adequate",
            "exit_signage": "minor",
            "training_drills": 2,
            "defects_found": 1,
            "declaration": True,
            "auditor_signature": file_id,
        },
        "table_rows": {"extinguisher_register": [
            {"location": "Store 1", "type": "co2", "capacity_kg": 4.5, "verified": True},
            {"location": "Packing bay", "type": "foam", "capacity_kg": 9, "verified": True},
            {"location": "Generator room", "type": "dry_powder", "capacity_kg": 5, "verified": False},
        ]},
    }, "PUT")
    print("save signed draft:", json.dumps({k: v for k, v in signed.items() if k in ("success", "status", "score", "issues", "requiredMissing")})[:320])

    submitted = curl(f"/api/auditor/submissions/{submission_id}/submit", AUD, {"send_to_reviewer": True}, "POST")
    print("submit:", json.dumps({k: v for k, v in submitted.items() if k in ("success", "status", "scorePercentage", "message")})[:240])

    if not login(VER, "verifier.test@complianceos.local", "Verifier@2026"):
        sys.exit(1)
    queue = curl("/api/verifier/submissions", VER)
    print("verifier queue total:", (queue.get("pagination") or {}).get("total"), "| stats:", json.dumps(queue.get("stats"))[:160])
    reviewed = curl(f"/api/verifier/submissions/{submission_id}", VER, {
        "action": "approve",
        "comments": "Walkthrough is thorough; the generator-room extinguisher must be re-verified within 30 days.",
        "score_obtained": 8,
        "score_max": 10,
        "notify_submitter": True,
    }, "PUT")
    print("verifier approve:", json.dumps(reviewed)[:240])

    print(f"\nFIXTURE module={module_id} form={form_id} submission={submission_id} number={number}")


if __name__ == "__main__":
    main()
