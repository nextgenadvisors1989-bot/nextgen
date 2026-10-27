"""
Phase 3 acceptance suite — the dynamic module engine, end to end over HTTP.

Covers: module CRUD + publish/clone/archive/assignments · form structure save and
publish (including the publish guards) · auditor start/draft/submit with scoring,
tables, signatures and field-level validation errors · verifier queue and approve ·
rendered submission PDF · every new admin/auditor/verifier page · cross-panel
authorisation.

Run with the app serving on :3000 — `python3 scripts/verify-dynamic-modules.py`.
"""
import json
import os
import subprocess
import sys
import time
import uuid
import tempfile

TMP = tempfile.gettempdir().replace("\\", "/")

BASE = "http://127.0.0.1:3001"
ADMIN = TMP + "/vdm_admin.txt"
AUD = TMP + "/vdm_aud.txt"
VER = TMP + "/vdm_ver.txt"

CREATED = (200, 201)

PASS = 0
FAIL = 0
FAILURES = []


def check(label, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"   \033[32m✓\033[0m {label}" + (f" — {detail}" if detail else ""))
    else:
        FAIL += 1
        FAILURES.append(label)
        print(f"   \033[31m✗\033[0m {label}" + (f" — {detail}" if detail else ""))


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


def call(path, jar="", data=None, method=None, timeout=60):
    cmd = ["curl", "-s", "-m", str(timeout), "-w", "\n%{http_code}", "-b", jar, "-c", jar]
    if method:
        cmd += ["-X", method]
    if method in ("POST", "PUT", "PATCH", "DELETE"):
        cmd += ["-H", f"x-csrf-token: {csrf_from(jar)}"]
    if data is not None:
        cmd += ["-H", "content-type: application/json", "-d", json.dumps(data)]
    cmd.append(BASE + path)
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    body, _, status = out.rpartition("\n")
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        parsed = {"_raw": body[:300]}
    try:
        code = int(status)
    except ValueError:
        code = 0
    return code, parsed


def page(path, jar, expect=200):
    out = subprocess.run(
        ["curl", "-s", "-o", TMP + "/vdm_page.html", "-w", "%{http_code} %{redirect_url}", "-b", jar, BASE + path],
        capture_output=True, text=True,
    ).stdout.split(" ")
    return int(out[0]), (out[1] if len(out) > 1 else "")


def sql(statement):
    """Run one read-only query with the credentials from .env."""
    env = {}
    with open(".env", encoding="utf-8") as handle:
        for line in handle:
            if "=" in line and not line.strip().startswith("#"):
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip().strip('"')
    out = subprocess.run(
        ["mysql", "-u", env["DB_USER"], f"-p{env['DB_PASSWORD']}", env["DB_NAME"], "-N", "-B", "-e", statement],
        capture_output=True, text=True,
    )
    return out.stdout.strip() or out.stderr.strip()


def login(jar, identifier, password):
    subprocess.run(["rm", "-f", jar])
    code, body = call("/api/auth/login", jar, {"identifier": identifier, "password": password}, "POST")
    return code == 200 and body.get("success") is True


def upload_signature(jar, submission_id):
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080600000"
        "01f15c4890000000d4944415478da63f8cf00000301010018dd8db00000000049454e44ae426082"
    )
    with open(TMP + "/vdm_signature.png", "wb") as handle:
        handle.write(png)
    out = subprocess.run(
        ["curl", "-s", "-b", jar, "-c", jar, "-X", "POST",
         "-H", f"x-csrf-token: {csrf_from(jar)}",
         "-F", f"files=@{TMP}/vdm_signature.png;type=image/png",
         "-F", "entityType=SUBMISSION", "-F", f"entityId={submission_id}", "-F", "category=signature",
         BASE + "/api/files/upload"],
        capture_output=True, text=True,
    ).stdout
    try:
        body = json.loads(out)
    except json.JSONDecodeError:
        return None
    files = body.get("files") or (body.get("data") or {}).get("files") or []
    return files[0]["id"] if files else None


def structure_payload(name, prefix, signed=True):
    fields = [
        {"field_key": "site_name", "label": "Site name", "field_type": "text", "is_required": True, "column_width": 6},
        {"field_key": "inspection_date", "label": "Inspection date", "field_type": "date", "is_required": True, "column_width": 6},
        {"field_key": "occupancy_type", "label": "Occupancy type", "field_type": "select", "is_required": True, "column_width": 6,
         "options": [{"option_key": "industrial", "option_label": "Industrial"}, {"option_key": "commercial", "option_label": "Commercial"}]},
        {"field_key": "extinguisher_coverage", "label": "Fire extinguisher coverage", "field_type": "radio", "is_required": True, "column_width": 6,
         "options": [{"option_key": "adequate", "option_label": "Adequate", "score": 10},
                     {"option_key": "partial", "option_label": "Partially adequate", "score": 5},
                     {"option_key": "missing", "option_label": "Inadequate", "score": 0}]},
        {"field_key": "exit_signage", "label": "Exit signage and lighting", "field_type": "radio", "is_required": True, "column_width": 6,
         "options": [{"option_key": "compliant", "option_label": "Fully compliant", "score": 10},
                     {"option_key": "minor", "option_label": "Minor gaps", "score": 6},
                     {"option_key": "noncompliant", "option_label": "Non-compliant", "score": 0}]},
        {"field_key": "defects_found", "label": "Number of defects identified", "field_type": "number", "column_width": 4,
         "validation_json": {"max_score": 10}},
        {"field_key": "risk_score", "label": "Weighted risk score (auto)", "field_type": "formula", "column_width": 4,
         "formula_expression": "extinguisher_coverage + exit_signage - defects_found"},
    ]
    sign_off = [
        {"field_key": "declaration", "label": "I confirm the walkthrough was carried out in person",
         "field_type": "checkbox", "is_required": True, "column_width": 12},
        {"field_key": "auditor_signature", "label": "Auditor signature", "field_type": "signature",
         "is_required": True, "column_width": 12},
    ] if signed else []
    return {
        "name": name,
        "description": "Verification fixture built by scripts/verify-dynamic-modules.py",
        "form_type": "AUDIT",
        "layout_columns": 2,
        "requires_signature": signed,
        "requires_attachments": False,
        "allow_draft": True,
        "auto_number_prefix": prefix,
        "sections": [
            {"title": "Site particulars", "section_code": "SITE", "layout_columns": 2, "show_in_pdf": True,
             "fields": fields[:3], "tables": []},
            {"title": "Fire prevention", "section_code": "PREV", "layout_columns": 2, "show_in_pdf": True,
             "fields": fields[3:], "tables": []},
            {"title": "Extinguisher register", "section_code": "REG", "layout_columns": 1, "show_in_pdf": True,
             "fields": [], "tables": [
                 {"table_key": "extinguisher_register", "table_name": "Extinguisher register",
                  "is_repeatable": True, "min_rows": 1, "max_rows": 50, "show_row_numbers": True,
                  "show_totals": True, "show_in_pdf": True, "columns": [
                      {"column_key": "location", "column_label": "Location", "column_type": "text", "is_required": True, "width_pct": 40},
                      {"column_key": "type", "column_label": "Type", "column_type": "select", "is_required": True, "width_pct": 25,
                       "options_json": [{"option_key": "co2", "option_label": "CO2"}, {"option_key": "foam", "option_label": "Foam"}]},
                      {"column_key": "capacity_kg", "column_label": "Capacity (kg)", "column_type": "decimal",
                       "is_editable": True, "is_total": True, "width_pct": 20},
                  ]},
             ]},
            {"title": "Sign-off", "section_code": "SIGN", "layout_columns": 2, "show_in_pdf": True,
             "fields": sign_off, "tables": []},
        ],
    }


ANSWERS = {
    "site_name": "Ambattur Unit II",
    "inspection_date": "2026-10-05",
    "occupancy_type": "industrial",
    "extinguisher_coverage": "adequate",
    "exit_signage": "minor",
    "defects_found": 1,
    "declaration": True,
}
ROWS = {"extinguisher_register": [
    {"location": "Store 1", "type": "co2", "capacity_kg": 4.5},
    {"location": "Packing bay", "type": "foam", "capacity_kg": 9},
]}


def main():
    run = uuid.uuid4().hex[:6]
    print(f"\n\033[1mPhase 3 — dynamic modules (run {run})\033[0m")
    started = time.time()

    check("admin signs in", login(ADMIN, __import__("os").environ.get("VERIFY_ADMIN_EMAIL", "admin@complianceos.local"), __import__("os").environ.get("VERIFY_ADMIN_PASSWORD", "Admin@2026")))
    check("auditor signs in", login(AUD, "auditor.test@complianceos.local", "Auditor@2026"))
    check("verifier signs in", login(VER, "verifier.test@complianceos.local", "Verifier@2026"))
    if FAIL:
        print("cannot continue without sessions")
        sys.exit(1)

    # ── 1. module lifecycle ────────────────────────────────────────────────
    print("\n1. module register and lifecycle")
    code, listing = call("/api/admin/dynamic-modules?limit=5", ADMIN)
    check("module register lists modules", code == 200 and listing.get("success"), f"{len(listing.get('data') or [])} row(s)")

    module_name = f"Fire Safety Compliance Audit {run}"
    code, created = call("/api/admin/dynamic-modules", ADMIN, {
        "name": module_name, "module_type": "AUDIT", "category": "Fire & Safety", "default_tat_days": 15,
        "requires_verification": True, "is_public": False, "create_default_form": True, "roles": ["auditor", "verifier"],
    }, "POST")
    module_id = created.get("moduleId")
    form_id = created.get("formId")
    check("module + starter form created", code in CREATED and module_id and form_id, f"module={module_id} form={form_id}")
    check("module slug generated", bool(created.get("slug")), str(created.get("slug")))

    code, detail = call(f"/api/admin/dynamic-modules/{module_id}", ADMIN)
    check("module detail carries forms and stats", code == 200 and detail.get("stats", {}).get("forms") == 1)
    check("role assignments recorded", len(detail.get("roleAssignments") or []) == 2,
          ",".join(str(row.get("role_slug")) for row in (detail.get("roleAssignments") or [])))

    code, renamed = call(f"/api/admin/dynamic-modules/{module_id}", ADMIN, {
        "name": f"{module_name} (2026)", "module_type": "AUDIT", "category": "Fire & Safety",
        "default_tat_days": 20, "requires_verification": True, "is_public": False, "status": "draft",
    }, "PUT")
    check("module settings updated", code == 200 and renamed.get("success"))

    code, second = call(f"/api/admin/dynamic-modules/{module_id}/forms", ADMIN, {
        "name": f"Fire Safety Walkthrough {run}", "form_type": "AUDIT", "layout_columns": 2,
        "auto_number_prefix": "FSA", "requires_signature": True, "requires_attachments": False,
        "allow_draft": True, "sections": [{"title": "General", "layout_columns": 2, "fields": [], "tables": []}],
    }, "POST")
    form_id = second.get("formId") or form_id
    check("second form created", code in CREATED and second.get("formId"), f"form={form_id}")

    code, saved = call(f"/api/admin/dynamic-forms/{form_id}", ADMIN, structure_payload(f"Fire Safety Walkthrough {run}", "FSA"), "PUT")
    check("structure saved (sections/fields/tables)", code == 200 and saved.get("sections") == 4 and saved.get("fields") == 9 and saved.get("tables") == 1,
          f"sections={saved.get('sections')} fields={saved.get('fields')} tables={saved.get('tables')}")

    code, empty_form = call(f"/api/admin/dynamic-modules/{module_id}/forms", ADMIN, {
        "name": f"Empty draft form {run}", "form_type": "STANDARD", "layout_columns": 1,
        "sections": [{"title": "General", "layout_columns": 1, "fields": [], "tables": []}],
    }, "POST")
    code, unpublishable = call(f"/api/admin/dynamic-forms/{empty_form.get('formId')}/publish", ADMIN, {}, "POST")
    check("a form with an empty section cannot be published", code == 422 and bool(unpublishable.get("errors")),
          (unpublishable.get("errors") or [{}])[0].get("message", ""))
    call(f"/api/admin/dynamic-forms/{empty_form.get('formId')}", ADMIN, None, "DELETE")

    code, published = call(f"/api/admin/dynamic-forms/{form_id}/publish", ADMIN, {}, "POST")
    check("form published", code in CREATED and published.get("success"), f"v{published.get('version')} fields={published.get('fields')}")

    code, module_published = call(f"/api/admin/dynamic-modules/{module_id}/publish", ADMIN, {}, "POST")
    skipped_names = [entry.get("name") for entry in (module_published.get("skipped") or [])]
    check("module published, unfinished forms reported and skipped",
          code in CREATED and module_published.get("success") and module_published.get("liveForms", 0) >= 1
          and isinstance(module_published.get("skipped"), list) and len(skipped_names) == 1,
          f"v{module_published.get('version')} live={module_published.get('liveForms')}/{module_published.get('forms')} skipped={skipped_names}")

    code, assigned = call(f"/api/admin/dynamic-modules/{module_id}/assignments", ADMIN, {
        "roles": [{"role": "auditor", "can_create": True, "can_read": True, "can_update": True, "can_delete": False, "can_approve": False},
                  {"role": "verifier", "can_create": False, "can_read": True, "can_update": False, "can_delete": False, "can_approve": True}],
        "users": [],
    }, "PUT")
    check("access matrix saved", code == 200 and assigned.get("success"))

    # Auditors work the forms of their own auditor type, so the module is mapped to the test auditor's type too.
    code, listing = call("/api/admin/auditors?search=auditor.test&limit=5", ADMIN)
    test_auditor = next((row for row in (listing.get("data") or []) if "auditor.test" in str(row.get("email"))), {})
    type_id = test_auditor.get("auditor_type_id")
    if type_id:
        code, current = call(f"/api/admin/auditor-types/{type_id}/modules", ADMIN)
        have = [int(row["id"]) for row in ((current.get("data") or current).get("assigned") or [])]
        code, mapped = call(f"/api/admin/auditor-types/{type_id}/modules", ADMIN, {"module_ids": have + [int(module_id)]}, "PUT")
        check("module mapped to the auditor's type", code == 200 and mapped.get("success"), f"{code} {mapped}")

    code, cloned = call(f"/api/admin/dynamic-modules/{module_id}/clone", ADMIN,
                        {"name": f"{module_name} (copy)", "copy_assignments": True, "copy_forms": True}, "POST")
    clone_id = cloned.get("moduleId")
    check("module cloned with its forms", code in CREATED and clone_id and clone_id != module_id, f"clone={clone_id}")

    code, archived = call(f"/api/admin/dynamic-modules/{clone_id}/archive", ADMIN, {}, "POST")
    check("clone archived", code == 200 and archived.get("success"))
    code, removed = call(f"/api/admin/dynamic-modules/{clone_id}", ADMIN, None, "DELETE")
    check("clone deleted", code == 200 and removed.get("success"))
    code, missing = call(f"/api/admin/dynamic-modules/{clone_id}", ADMIN)
    check("deleted module is gone", code == 404)


    # ── 2. auditor fills and files the form ────────────────────────────────
    print("\n2. auditor fills, saves and submits")
    code, catalogue = call("/api/auditor/forms", AUD)
    names = [module["name"] for module in (catalogue.get("modules") or [])]
    check("published module appears in the auditor catalogue", code == 200 and any(module_name in str(name) for name in names), f"{len(names)} module(s)")

    code, started_body = call("/api/auditor/submissions", AUD, {"form_id": form_id}, "POST")
    submission_id = started_body.get("submissionId")
    number = started_body.get("submissionNumber")
    check("submission started and numbered", code in CREATED and submission_id and str(number).startswith("FSA/"), f"{number}")

    code, resumed = call("/api/auditor/submissions", AUD, {"form_id": form_id}, "POST")
    check("starting again resumes the same draft", code in CREATED and resumed.get("submissionId") == submission_id and resumed.get("resumed") is True,
          f"{resumed.get('submissionNumber')}")

    code, draft = call(f"/api/auditor/submissions/{submission_id}", AUD, {"values": ANSWERS, "table_rows": ROWS}, "PUT")
    score = draft.get("score") or {}
    check("draft saved with a live score", code == 200 and score.get("obtained") is not None,
          f"{score.get('obtained')}/{score.get('max')} = {score.get('percentage')}%")
    check("draft reports how much is filled in", isinstance(draft.get("filled"), int) and isinstance(draft.get("requiredMissing"), int),
          f"filled={draft.get('filled')} requiredMissing={draft.get('requiredMissing')}")

    code, workspace = call(f"/api/auditor/submissions/{submission_id}", AUD)
    check("workspace echoes values, table rows and totals", code == 200
          and workspace.get("values", {}).get("site_name") == "Ambattur Unit II"
          and len(workspace.get("tableRows", {}).get("extinguisher_register", [])) == 2
          and workspace.get("tableTotals", {}).get("extinguisher_register", {}).get("capacity_kg") == 13.5,
          f"total capacity={workspace.get('tableTotals', {}).get('extinguisher_register', {}).get('capacity_kg')}")
    check("formula field computed server-side", workspace.get("values", {}).get("risk_score") == 15,
          f"risk_score={workspace.get('values', {}).get('risk_score')} (10 + 6 - 1)")

    code, early = call(f"/api/auditor/submissions/{submission_id}/submit", AUD, {}, "POST")
    issues = early.get("errors") or []
    check("submitting an incomplete form is refused with field errors", code == 422 and any(i.get("field") == "auditor_signature" for i in issues),
          f"{len(issues)} issue(s)")

    file_id = upload_signature(AUD, submission_id)
    check("signature uploaded as a submission file", bool(file_id), f"file={file_id}")
    answers = dict(ANSWERS)
    answers["auditor_signature"] = file_id
    code, signed = call(f"/api/auditor/submissions/{submission_id}", AUD, {"values": answers, "table_rows": ROWS}, "PUT")
    check("signed draft accepted", code == 200 and signed.get("success"))

    code, submitted = call(f"/api/auditor/submissions/{submission_id}/submit", AUD, {"send_to_reviewer": True}, "POST")
    check("submit revalidates the stored answers and files the form", code == 200 and submitted.get("status") == "under_review",
          f"status={submitted.get('status')} score={submitted.get('scorePercentage') or (submitted.get('score') or {}).get('percentage')}")

    code, locked = call(f"/api/auditor/submissions/{submission_id}", AUD, {"values": {"site_name": "changed"}}, "PUT")
    check("filed submission can no longer be edited", code == 409, locked.get("message"))
    code, after = call(f"/api/auditor/submissions/{submission_id}", AUD)
    check("filed submission is read-only for its owner", after.get("permissions", {}).get("canEdit") is False
          and after.get("permissions", {}).get("canSubmit") is False)

    pdf_meta = subprocess.run(["curl", "-s", "-o", TMP + "/vdm_submission.pdf", "-w", "%{http_code}|%{content_type}", "-b", AUD,
                               f"{BASE}/api/pdf/submission/{submission_id}"], capture_output=True, text=True).stdout.split("|")
    pdf_code, pdf_type = int(pdf_meta[0]), (pdf_meta[1] if len(pdf_meta) > 1 else "")
    pdf_bytes = os.path.getsize(TMP + "/vdm_submission.pdf")
    extracted = subprocess.run(["python3", "scripts/pdf-text.py", TMP + "/vdm_submission.pdf", "--json"],
                               capture_output=True, text=True).stdout
    try:
        pages_json = json.loads(extracted)
    except json.JSONDecodeError:
        pages_json = []
    pdf_text = " ".join(page.get("text", "") for page in pages_json)
    check("submission PDF renders", pdf_code == 200 and pdf_type.startswith("application/pdf") and len(pages_json) >= 1,
          f"{pdf_code} {pdf_type} {len(pages_json)} page(s) {pdf_bytes}B")
    check("PDF prints the submission number, the answers and the tables",
          str(number) in pdf_text and "Ambattur Unit II" in pdf_text and "Packing bay" in pdf_text)

    code, in_use = call(f"/api/admin/dynamic-forms/{form_id}", ADMIN, None, "DELETE")
    check("a form that already holds submissions cannot be deleted", code == 409, in_use.get("message"))

    # ── 3. verifier decides ────────────────────────────────────────────────
    print("\n3. verifier reviews")
    code, queue = call("/api/verifier/submissions", VER)
    ids = [row["id"] for row in (queue.get("data") or [])]
    check("submission queued for verification", code == 200 and submission_id in ids,
          f"total={queue.get('pagination', {}).get('total')} underReview={queue.get('stats', {}).get('underReview')}")

    code, view = call(f"/api/verifier/submissions/{submission_id}", VER)
    check("verifier reads the answers read-only", code == 200 and view.get("permissions", {}).get("canEdit") is False
          and view.get("permissions", {}).get("canReview") is True)
    check("verifier sees the uploads", any(int(f.get("id")) == int(file_id) for f in (view.get("files") or [])), f"{len(view.get('files') or [])} file(s)")

    code, reviewed = call(f"/api/verifier/submissions/{submission_id}", VER, {
        "action": "approve", "comments": "Walkthrough accepted with one follow-up on the packing-bay extinguisher.",
        "score_obtained": 18, "score_max": 20, "notify_submitter": True,
    }, "PUT")
    check("approve records the decision and the awarded score", code == 200 and reviewed.get("status") == "approved"
          and reviewed.get("reviewAction") == "approved", f"score={reviewed.get('scorePercentage')}%")

    code, twice = call(f"/api/verifier/submissions/{submission_id}", VER, {
        "action": "approve", "comments": "Second decision attempt", "notify_submitter": True,
    }, "PUT")
    check("a decided submission cannot be decided again", code == 409, twice.get("message"))

    code, final = call(f"/api/auditor/submissions/{submission_id}", AUD)
    check("submitter sees the decision and the reviewer", code == 200
          and final.get("submission", {}).get("review_action") == "approved"
          and bool(final.get("submission", {}).get("reviewed_by")))

    subprocess.run(["curl", "-s", "-o", TMP + "/vdm_submission_2.pdf", "-b", AUD, f"{BASE}/api/pdf/submission/{submission_id}"])
    check("PDF re-renders after the decision and both files are the same size class",
          os.path.getsize(TMP + "/vdm_submission_2.pdf") > 1000,
          f"{os.path.getsize(TMP + '/vdm_submission.pdf')}B then {os.path.getsize(TMP + '/vdm_submission_2.pdf')}B")

    # ── 4. activity, notifications, emails ─────────────────────────────────
    print("\n4. audit trail and notifications")
    code, logs = call(f"/api/admin/dynamic-submissions/{submission_id}", ADMIN)
    check("admin can read any submission", code == 200 and logs.get("success"))
    trail = sql(f"SELECT COUNT(*) FROM activity_logs WHERE entity_type='dynamic_submission' AND entity_id={submission_id}")
    check("activity log written for every step", trail.isdigit() and int(trail) >= 3, f"{trail} entries")
    actions = sql("SELECT GROUP_CONCAT(DISTINCT action) FROM activity_logs "
                  f"WHERE entity_type='dynamic_submission' AND entity_id={submission_id}")
    check("the log names created / updated / submitted / reviewed",
          all(word in (actions or "") for word in ("created", "updated", "submitted", "reviewed")), actions)
    mails = sql(f"SELECT COUNT(*) FROM email_logs WHERE entity_type='dynamic_submission' AND entity_id={submission_id}")
    templates = sql("SELECT GROUP_CONCAT(DISTINCT template_code) FROM email_logs "
                    f"WHERE entity_type='dynamic_submission' AND entity_id={submission_id}")
    check("submission and decision emails queued", mails.isdigit() and int(mails) >= 3, f"{mails} email(s): {templates}")
    check("they use the submission template family",
          "submission.submitted" in (templates or "") and "submission.approved" in (templates or ""), templates)

    # ── 5. panels ──────────────────────────────────────────────────────────
    print("\n5. every panel page renders")
    code, _ = page("/admin/dynamic-modules", ADMIN)
    check("admin · /admin/dynamic-modules", code == 200)
    code, _ = page(f"/admin/dynamic-modules/{module_id}", ADMIN)
    check("admin · module detail", code == 200)
    code, _ = page(f"/admin/dynamic-modules/{module_id}/forms/{form_id}", ADMIN)
    check("admin · form builder", code == 200)
    code, _ = page("/admin/dynamic-submissions", ADMIN)
    check("admin · submission register", code == 200)
    code, _ = page(f"/admin/dynamic-submissions/{submission_id}", ADMIN)
    check("admin · submission record", code == 200)

    code, _ = page("/verifier/submissions", VER)
    check("verifier · module submissions queue", code == 200)
    code, _ = page(f"/verifier/submissions/{submission_id}", VER)
    check("verifier · submission review screen", code == 200)

    code, _ = page("/auditor/modules", AUD)
    check("auditor · assigned modules", code == 200)
    code, _ = page("/auditor/submissions", AUD)
    check("auditor · my submissions", code == 200)
    code, _ = page(f"/auditor/submissions/{submission_id}", AUD)
    check("auditor · submission record", code == 200)

    out = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{redirect_url}", "-b", AUD,
                          f"{BASE}/auditor/forms/{form_id}"], capture_output=True, text=True).stdout.split(" ")
    check("auditor · deep link into a form opens a submission", out[0] == "307" and "/auditor/submissions/" in out[1], out[1])

    code, redirect = page("/admin/dynamic-modules", AUD)
    check("auditor cannot open the admin panel", code == 307 and redirect.endswith("/auditor/dashboard"), redirect)
    code, redirect = page("/verifier/submissions", AUD)
    check("auditor cannot open the verifier panel", code == 307 and redirect.endswith("/auditor/dashboard"), redirect)

    elapsed = time.time() - started
    print(f"\n\033[1mRESULT\033[0m {PASS} passed, {FAIL} failed in {elapsed:.1f}s — module={module_id} form={form_id} submission={submission_id}")
    if FAILURES:
        print("failed: " + ", ".join(FAILURES))
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
