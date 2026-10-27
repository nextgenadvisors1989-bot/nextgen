"""Seed stages: dynamic modules + submissions, payroll/leave/attendance, calendar, CMS."""
import struct
import zlib

from seed_common import admin, employers_map, iso, login_as
from seed_lib import db, make_pdf, multipart, q1, section, sql_text

# ── Dynamic modules ─────────────────────────────────────────────────────────

RATING = [{"option_key": "good", "option_label": "Satisfactory", "score": 10},
          {"option_key": "fair", "option_label": "Needs improvement", "score": 5},
          {"option_key": "poor", "option_label": "Unsatisfactory", "score": 0}]


def simple_structure(name, description, prefix, form_type, checks, signature=True):
    fields = [
        {"field_key": "site_name", "label": "Site / premises", "field_type": "text", "is_required": True, "column_width": 6},
        {"field_key": "inspection_date", "label": "Date", "field_type": "date", "is_required": True, "column_width": 6},
    ]
    for key, label in checks:
        fields.append({"field_key": key, "label": label, "field_type": "radio", "is_required": True, "column_width": 6, "options": RATING})
    fields.append({"field_key": "remarks", "label": "Observations", "field_type": "textarea", "column_width": 12})
    sections = [{"title": "Details", "section_code": "MAIN", "layout_columns": 2, "is_collapsible": False, "is_collapsed": False,
                 "show_in_pdf": True, "page_break_before": False, "fields": fields, "tables": []}]
    if signature:
        sections.append({"title": "Sign-off", "section_code": "SIGN", "layout_columns": 2, "is_collapsible": False, "is_collapsed": False,
                         "show_in_pdf": True, "page_break_before": False, "tables": [], "fields": [
                             {"field_key": "declaration", "label": "I confirm this was carried out in person", "field_type": "checkbox", "is_required": True, "column_width": 12}]})
    return {"name": name, "description": description, "form_type": form_type, "layout_columns": 2, "requires_signature": False,
            "requires_attachments": False, "allow_draft": True, "auto_number_prefix": prefix, "sections": sections}


def fire_structure():
    return {
        "name": "Fire Safety Walkthrough", "description": "Site inspection covering fire prevention, extinguishers and evacuation readiness.",
        "form_type": "AUDIT", "layout_columns": 2, "requires_signature": False, "requires_attachments": False, "allow_draft": True, "auto_number_prefix": "FSA",
        "sections": [
            {"title": "Site particulars", "section_code": "SITE", "layout_columns": 2, "is_collapsible": False, "is_collapsed": False, "show_in_pdf": True,
             "page_break_before": False, "tables": [], "fields": [
                 {"field_key": "site_name", "label": "Site name", "field_type": "text", "is_required": True, "column_width": 6},
                 {"field_key": "inspection_date", "label": "Inspection date", "field_type": "date", "is_required": True, "column_width": 6},
                 {"field_key": "occupancy_type", "label": "Occupancy type", "field_type": "select", "is_required": True, "column_width": 6, "options": [
                     {"option_key": "industrial", "option_label": "Industrial"}, {"option_key": "commercial", "option_label": "Commercial"}]},
                 {"field_key": "remarks", "label": "Observations", "field_type": "textarea", "column_width": 6}]},
            {"title": "Fire prevention", "section_code": "PREV", "layout_columns": 2, "is_collapsible": False, "is_collapsed": False, "show_in_pdf": True,
             "page_break_before": False, "tables": [], "fields": [
                 {"field_key": "extinguisher_coverage", "label": "Fire extinguisher coverage", "field_type": "radio", "is_required": True, "column_width": 6, "options": [
                     {"option_key": "adequate", "option_label": "Adequate", "score": 10}, {"option_key": "partial", "option_label": "Partially adequate", "score": 5},
                     {"option_key": "missing", "option_label": "Inadequate", "score": 0}]},
                 {"field_key": "exit_signage", "label": "Exit signage and lighting", "field_type": "radio", "is_required": True, "column_width": 6, "options": [
                     {"option_key": "compliant", "option_label": "Fully compliant", "score": 10}, {"option_key": "minor", "option_label": "Minor gaps", "score": 6},
                     {"option_key": "noncompliant", "option_label": "Non-compliant", "score": 0}]},
                 {"field_key": "training_drills", "label": "Drills conducted in last 6 months", "field_type": "number", "is_required": True, "column_width": 6,
                  "validation_json": {"max_score": 10}}]},
            {"title": "Extinguisher register", "section_code": "REG", "layout_columns": 1, "is_collapsible": True, "is_collapsed": False, "show_in_pdf": True,
             "page_break_before": False, "fields": [], "tables": [
                 {"table_key": "extinguisher_register", "table_name": "Extinguisher register", "description": "Every extinguisher inspected.",
                  "is_repeatable": True, "min_rows": 1, "max_rows": 50, "show_row_numbers": True, "show_totals": True, "show_in_pdf": True, "columns": [
                      {"column_key": "location", "column_label": "Location", "column_type": "text", "is_required": True, "is_editable": True, "width_pct": 40},
                      {"column_key": "type", "column_label": "Type", "column_type": "select", "is_required": True, "is_editable": True, "width_pct": 25, "options_json": [
                          {"option_key": "co2", "option_label": "CO2"}, {"option_key": "foam", "option_label": "Foam"}, {"option_key": "dry_powder", "option_label": "Dry powder"}]},
                      {"column_key": "capacity_kg", "column_label": "Capacity (kg)", "column_type": "decimal", "is_editable": True, "is_total": True, "width_pct": 20}]}]},
            {"title": "Sign-off", "section_code": "SIGN", "layout_columns": 2, "is_collapsible": False, "is_collapsed": False, "show_in_pdf": True,
             "page_break_before": False, "tables": [], "fields": [
                 {"field_key": "declaration", "label": "I confirm the walkthrough was carried out in person", "field_type": "checkbox", "is_required": True, "column_width": 12}]},
        ]}


MODULES = [
    # name, module_type, category, roles, structure builder, desc
    ("Fire Safety Compliance Audit", "AUDIT", "Fire & Safety", ["auditor"], fire_structure, "Statutory fire-safety walkthrough used by auditors on site visits."),
    ("Workplace Hazard Assessment", "ASSESSMENT", "Safety", ["auditor", "employer"],
     lambda: simple_structure("Workplace Hazard Assessment", "Scored hazard assessment of a work area.", "WHA", "ASSESSMENT",
                              [("ventilation", "Ventilation and dust control"), ("lighting", "Illumination levels"), ("ergonomics", "Ergonomics and manual handling")]),
     "Structured assessment filed against an establishment."),
    ("Chemical Handling Risk Register", "RISK", "Risk", ["auditor", "employer"],
     lambda: simple_structure("Chemical Handling Risk Register", "Risk review of chemical storage and handling.", "CHR", "STANDARD",
                              [("storage", "Storage segregation"), ("labelling", "Labelling and SDS availability"), ("spill", "Spill response readiness")]),
     "Hazard and control register for chemicals."),
    ("Working Conditions Study", "STUDY", "Studies", ["auditor"],
     lambda: simple_structure("Working Conditions Study", "Industrial working-conditions survey.", "WCS", "STANDARD",
                              [("temperature", "Temperature and humidity"), ("noise", "Noise exposure"), ("welfare", "Welfare facilities")]),
     "Industrial studies and surveys."),
    ("Hot Work Permit", "WORK_PERMIT", "Permits", ["auditor", "employer"],
     lambda: simple_structure("Hot Work Permit", "Permit to work for welding, cutting and grinding.", "HWP", "CHECKLIST",
                              [("fire_watch", "Fire watch arranged"), ("isolation", "Energy isolation confirmed"), ("ppe", "PPE verified")]),
     "Permit to work for hot work."),
]


def stage_modules():
    section("Dynamic modules, forms and submissions")
    made = {}
    for name, mtype, category, roles, builder, desc in MODULES:
        existing = q1(f"SELECT id FROM dynamic_modules WHERE name={sql_text(name)} AND deleted_at IS NULL")
        if existing:
            form_id = int(q1(f"SELECT id FROM dynamic_forms WHERE module_id={existing} ORDER BY id LIMIT 1", 0))
            made[name] = (int(existing), form_id)
            if int(q1(f"SELECT COUNT(*) FROM dynamic_form_sections WHERE form_id={form_id}", 0)) == 0:  # repair a half-built module
                admin.call("PUT", f"/api/admin/dynamic-forms/{form_id}", builder(), what=f"structure {name}")
                admin.call("POST", f"/api/admin/dynamic-forms/{form_id}/publish", {}, what=f"publish form {name}")
                admin.call("POST", f"/api/admin/dynamic-modules/{existing}/publish", {}, what=f"publish module {name}")
            continue
        module = admin.call("POST", "/api/admin/dynamic-modules", {
            "name": name, "description": desc, "category": category, "module_type": mtype, "default_tat_days": 15,
            "requires_verification": True, "is_public": False, "create_default_form": True, "roles": roles}, what=f"module {name}")
        if not module:
            continue
        module_id, form_id = int(module["moduleId"]), int(module["formId"])
        admin.call("PUT", f"/api/admin/dynamic-forms/{form_id}", builder(), what=f"structure {name}")
        admin.call("POST", f"/api/admin/dynamic-forms/{form_id}/publish", {}, what=f"publish form {name}")
        admin.call("POST", f"/api/admin/dynamic-modules/{module_id}/publish", {}, what=f"publish module {name}")
        made[name] = (module_id, form_id)
        print(f"  + module {name}")

    auditor = login_as("auditor.test@complianceos.local", "auditor")
    auditor2 = login_as("karthik.auditor@demo.complianceos.local", "auditor")
    verifier = login_as("verifier.test@complianceos.local", "verifier")
    employer = login_as("balaji.hr@demo.complianceos.local", "employer")
    if int(q1("SELECT COUNT(*) FROM dynamic_form_submissions", 0)) >= 6:
        print("  submissions already present")
        return

    def fire_values(site, drills, coverage="adequate"):
        return ({"site_name": site, "inspection_date": iso(-6), "occupancy_type": "industrial", "remarks": "Sprinkler line on the north wall needs re-painting.",
                 "extinguisher_coverage": coverage, "exit_signage": "minor", "training_drills": drills, "declaration": True},
                {"extinguisher_register": [{"location": "Store 1", "type": "co2", "capacity_kg": 4.5}, {"location": "Packing bay", "type": "foam", "capacity_kg": 9},
                                           {"location": "Generator room", "type": "dry_powder", "capacity_kg": 5}]})

    def simple_values(site, keys, level="good"):
        values = {"site_name": site, "inspection_date": iso(-4), "remarks": "Demo observation recorded during the visit.", "declaration": True}
        values.update({key: level for key in keys})
        return values, {}

    def file_submission(session, name, values, tables, action):
        if name not in made or not session:
            return
        form_id = made[name][1]
        started = session.call("POST", f"/api/{'auditor' if session is not employer else 'employer'}/submissions", {"form_id": form_id}, what=f"start {name}")
        if not started:
            return
        submission_id = int(started["submissionId"])
        saved = session.call("PUT", f"/api/{'auditor' if session is not employer else 'employer'}/submissions/{submission_id}",
                             {"values": values, "table_rows": tables}, what=f"draft {name}")
        if action == "draft" or not saved:
            return
        session.call("POST", f"/api/{'auditor' if session is not employer else 'employer'}/submissions/{submission_id}/submit",
                     {"send_to_reviewer": True}, what=f"submit {name}")
        if action == "approve" and verifier:
            verifier.call("PUT", f"/api/verifier/submissions/{submission_id}", {
                "action": "approve", "comments": "Walkthrough is thorough; closing observations noted.", "score_obtained": 8, "score_max": 10,
                "notify_submitter": True}, what=f"approve {name}")
        elif action == "return" and verifier:
            verifier.call("PUT", f"/api/verifier/submissions/{submission_id}", {
                "action": "return", "comments": "Please add the missing detail on exits and resubmit.", "notify_submitter": True}, what=f"return {name}")

    fv, ft = fire_values("Spinning Unit - Coimbatore", 2)
    file_submission(auditor, "Fire Safety Compliance Audit", fv, ft, "approve")
    fv, ft = fire_values("Ambattur Plant - Chennai", 1, "partial")
    file_submission(auditor2, "Fire Safety Compliance Audit", fv, ft, "submit")
    fv, ft = fire_values("Processing Plant - Madurai", 3)
    file_submission(auditor, "Fire Safety Compliance Audit", fv, ft, "draft")
    for name, keys, session, action in (
        ("Workplace Hazard Assessment", ["ventilation", "lighting", "ergonomics"], auditor, "approve"),
        ("Chemical Handling Risk Register", ["storage", "labelling", "spill"], auditor2, "submit"),
        ("Working Conditions Study", ["temperature", "noise", "welfare"], auditor, "return"),
        ("Hot Work Permit", ["fire_watch", "isolation", "ppe"], auditor2, "approve"),
    ):
        values, tables = simple_values("Sri Balaji Textiles - Spinning Unit", keys, "fair" if action == "return" else "good")
        file_submission(session, name, values, tables, action)
    print("  done")


# ── Payroll, attendance and leave ───────────────────────────────────────────

def stage_payroll():
    section("Salary structures, attendance, leave, payroll runs")
    emp = employers_map()
    month, year = 9, 2026
    for code, employer_id in emp.items():
        employees = db(f"SELECT id, basic_salary, status FROM employees WHERE employer_id={employer_id} AND deleted_at IS NULL ORDER BY id")
        if not employees:
            continue
        # salary structures
        for employee_id, basic, status in employees:
            if status != "active" and status != "resigned":
                continue
            if q1(f"SELECT id FROM salary_structures WHERE employee_id={employee_id} LIMIT 1"):
                continue
            basic = float(basic) if basic not in (None, "", "NULL") else 12000.0
            basic = basic or 12000.0
            admin.call("POST", "/api/admin/payroll/structures", {
                "employee_id": int(employee_id), "structure_name": "Standard wage structure", "effective_from": iso(-400),
                "basic": basic, "da": round(basic * 0.25), "hra": round(basic * 0.2), "ta": 500, "pa": 300, "ea": 200, "npba": 100,
                "other_allowances": 400, "wage_type": "Per Month", "pf_applicable": basic <= 21000, "esi_applicable": basic <= 21000,
                "pt_state": "Tamil Nadu", "lwf_applicable": True, "revision_reason": "Initial structure"}, what=f"structure {employee_id}")
        # attendance September and the first days of October
        if int(q1(f"SELECT COUNT(*) FROM attendance WHERE employer_id={employer_id} AND month={month} AND year={year}", 0)) == 0:
            admin.call("PUT", "/api/admin/payroll/attendance", {"employer_id": employer_id, "month": month, "year": year, "default_status": "Present"}, what=f"attendance {code}")
            for index, (employee_id, _basic, status) in enumerate(employees[:4]):
                admin.call("POST", "/api/admin/payroll/attendance", {"employee_id": int(employee_id), "attendance_date": f"2026-09-{10 + index:02d}", "status": "Absent",
                                                                     "remarks": "Unauthorised absence"}, what="absent")
        if int(q1(f"SELECT COUNT(*) FROM attendance WHERE employer_id={employer_id} AND month=10 AND year=2026", 0)) == 0:
            admin.call("PUT", "/api/admin/payroll/attendance", {"employer_id": employer_id, "month": 10, "year": 2026, "default_status": "Present"}, what=f"attendance Oct {code}")
        admin.call("POST", "/api/admin/payroll/leave/ledger", {"employer_id": employer_id, "year": year}, what=f"leave ledger {code}")

        # payroll run for September
        run_id = q1(f"SELECT id FROM payroll_runs WHERE employer_id={employer_id} AND month={month} AND year={year} AND deleted_at IS NULL")
        if not run_id:
            run = admin.call("POST", "/api/admin/payroll", {"employer_id": employer_id, "month": month, "year": year, "calculation_notes": "September 2026 payroll"}, what=f"run {code}")
            if run:
                run_id = run["id"]
                admin.call("POST", f"/api/admin/payroll/{run_id}/calculate", {}, what="calculate")
                if code != "GFP":  # leave one company's run at Calculated for the approval flow
                    admin.call("POST", f"/api/admin/payroll/{run_id}/status", {"status": "Approved", "note": "Checked and approved"}, what="approve run")
                    admin.call("POST", f"/api/admin/payroll/{run_id}/generate", {}, what="generate payslips")
                    if code == "SBT":
                        admin.call("POST", f"/api/admin/payroll/{run_id}/publish", {}, what="publish")
                print(f"  + payroll run {code} {month}/{year}")

    section("Leave applications")
    for email in db("SELECT u.email FROM users u JOIN employees e ON e.user_id=u.id WHERE u.email LIKE '%@emp.demo.complianceos.local' ORDER BY e.id LIMIT 8"):
        email = email[0]
        if int(q1(f"SELECT COUNT(*) FROM leave_applications la JOIN employees e ON e.id=la.employee_id JOIN users u ON u.id=e.user_id WHERE u.email={sql_text(email)}", 0)):
            continue
        session = login_as(email, "employee")
        if not session:
            continue
        types = session.call("GET", "/api/employee/leave/types") or {}
        rows = types.get("data") or types.get("types") or []
        if not rows:
            continue
        type_id = int(rows[0].get("id") or rows[0].get("value"))
        session.call("POST", "/api/employee/leave", {"leave_type_id": type_id, "date_from": iso(9), "date_to": iso(10), "reason": "Family function"}, what="leave apply")
    # employers decide on some of them
    for code in ("SBT", "KEW"):
        email = {"SBT": "balaji.hr@demo.complianceos.local", "KEW": "kaveri.hr@demo.complianceos.local"}[code]
        session = login_as(email, "employer")
        if not session:
            continue
        pending = (session.call("GET", "/api/employer/leave?status=Pending&limit=20") or {}).get("data") or []
        for index, row in enumerate(pending[:3]):
            if index == 0:
                session.call("POST", f"/api/employer/leave/{row['id']}/decision", {"decision": "approve", "approver_comments": "Approved"}, what="approve leave")
            elif index == 1:
                session.call("POST", f"/api/employer/leave/{row['id']}/decision", {"decision": "reject", "approver_comments": "Peak production week"}, what="reject leave")

    section("Statutory registers: bonus, gratuity, settlement")
    employer_id = emp.get("SBT")
    if employer_id and int(q1("SELECT COUNT(*) FROM bonus_records", 0)) == 0:
        ids = [int(r[0]) for r in db(f"SELECT id FROM employees WHERE employer_id={employer_id} AND status='active' AND deleted_at IS NULL LIMIT 5")]
        admin.call("POST", "/api/admin/payroll/bonus", {"employee_ids": ids, "bonus_year": 2025, "bonus_type": "Statutory Bonus", "payment_date": iso(-5), "remarks": "FY 2025-26 bonus"}, what="bonus")
    if employer_id and int(q1("SELECT COUNT(*) FROM gratuity_records", 0)) == 0:
        for (employee_id,) in db(f"SELECT id FROM employees WHERE employer_id={employer_id} AND status='active' AND deleted_at IS NULL LIMIT 2"):
            admin.call("POST", "/api/admin/payroll/gratuity", {"employee_id": int(employee_id), "service_from": "2018-06-01", "service_to": iso(0), "last_drawn_wages": 22000,
                                                              "calculation_note": "Demo gratuity computation"}, what="gratuity")
    if int(q1("SELECT COUNT(*) FROM full_final_settlements", 0)) == 0:
        for (employee_id,) in db("SELECT id FROM employees WHERE status='resigned' AND deleted_at IS NULL LIMIT 2"):
            result = admin.call("POST", "/api/admin/payroll/settlements", {"employee_id": int(employee_id), "resignation_date": iso(-40), "last_working_day": iso(-10),
                                                                          "notice_period_days": 30, "notice_period_served_days": 25, "remarks": "Resigned - full and final"}, what="settlement")
            if result and int(employee_id) % 2 == 0:
                for step in ("Submitted", "Approved", "Paid"):
                    admin.call("POST", f"/api/admin/payroll/settlements/{result['id']}/status", {"status": step}, what=f"settlement {step}")
    print("  done")


# ── Calendar ────────────────────────────────────────────────────────────────

def stage_calendar():
    section("Holidays and calendar events")
    for year in (2026, 2027):
        admin.call("POST", "/api/admin/calendar/holidays/national", {"year": year}, expect=(200, 201), what=f"national holidays {year}")
    extra = [("Deepavali", "2026-11-08", "Festival"), ("Pongal", "2027-01-15", "Festival"), ("Thiruvalluvar Day", "2027-01-16", "State"),
             ("Tamil New Year", "2027-04-14", "State"), ("Ayudha Pooja", "2026-10-19", "Festival"), ("Christmas Day", "2026-12-25", "Festival")]
    for name, day, kind in extra:
        if q1(f"SELECT id FROM holidays WHERE holiday_name={sql_text(name)} AND holiday_date={sql_text(day)} AND deleted_at IS NULL"):
            continue
        admin.call("POST", "/api/admin/calendar/holidays", {"holiday_name": name, "holiday_date": day, "holiday_type": "National" if kind == "National" else "Festival",
                                                            "description": f"{name} - public holiday (demo)"}, what=f"holiday {name}")
    events = [
        ("Quarterly compliance review meeting", "MEETING", 3, "10:00", "11:30", "High", "Head office - conference room"),
        ("PF / ESI monthly return due", "REMINDER", 4, "09:00", "10:00", "High", "Online portal"),
        ("Safety committee meeting", "MEETING", 8, "15:00", "16:00", "Medium", "Plant safety room"),
        ("Auditor allocation planning", "REMINDER", 12, "11:00", "11:30", "Low", "Admin office"),
        ("Fire mock drill - all units", "TRAINING", 15, "14:00", "15:00", "Medium", "All units"),
        ("Factory licence renewal follow-up", "REMINDER", 22, "10:00", "10:30", "High", "Inspector of Factories office"),
        ("Verifier calibration session", "TRAINING", -2, "16:00", "17:00", "Medium", "Online"),
        ("Boiler statutory inspection", "INSPECTION", 28, "10:00", "13:00", "High", "Boiler house - Ambattur Plant"),
    ]
    for title, etype, offset, start, end, priority, location in events:
        if q1(f"SELECT id FROM calendar_events WHERE title={sql_text(title)} AND deleted_at IS NULL"):
            continue
        admin.call("POST", "/api/admin/calendar", {
            "title": title, "description": "Demo calendar entry.", "event_type": etype, "start_datetime": f"{iso(offset)} {start}",
            "end_datetime": f"{iso(offset)} {end}", "all_day": False, "location": location, "attendees": ["ops@example.com"], "reminder_minutes": 60,
            "priority": priority, "visibility": "all"}, what=f"event {title}")
    print("  done")


# ── CMS ─────────────────────────────────────────────────────────────────────

def png(width=64, height=40, color=(30, 90, 200)):
    raw = b"".join(b"\x00" + bytes(color) * width for _ in range(height))

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def stage_cms():
    section("CMS pages, resources, media")
    pages = [
        ("Frequently Asked Questions", "faq", "<h2>Frequently asked questions</h2><p><strong>Who can use the platform?</strong> Employers, employees, auditors and verifiers each get their own workspace.</p>"
                                          "<p><strong>How are audits tracked?</strong> Every audit moves from assignment to report, verification and closure with a full trail.</p>"),
        ("Compliance Calendar Guide", "compliance-calendar-guide", "<h2>Staying ahead of due dates</h2><p>Monthly PF and ESI returns, annual returns under the Factories Act and licence renewals are tracked on the compliance calendar.</p>"),
        ("Why Statutory Audits Matter", "why-statutory-audits-matter", "<h2>Audits protect people and the business</h2><p>A statutory audit is the quickest way to find gaps before an inspector does.</p>"),
    ]
    for title, slug, html in pages:
        if q1(f"SELECT id FROM cms_pages WHERE slug={sql_text(slug)} AND deleted_at IS NULL"):
            continue
        result = admin.call("POST", "/api/admin/cms/pages", {"title": title, "slug": slug, "page_type": "page", "template": "default", "content_html": html, "status": "published"},
                            what=f"page {slug}")
        if result:
            print(f"  + page {slug}")
    body, ctype = multipart([("folder", "Banners"), ("alt_text", "Compliance banner"), ("tags", "demo,banner")],
                            [("files", "compliance-banner.png", "image/png", png(320, 120))])
    if int(q1("SELECT COUNT(*) FROM cms_media", 0)) == 0:
        status, payload = admin.send("POST", "/api/admin/cms/media/upload", body, content_type=ctype)
        print(f"  media upload: {status}")

    resources = [
        ("Monthly Statutory Compliance Checklist", "Checklist", False),
        ("Factories Act Quick Reference", "Guide", False),
        ("PF and ESI Contribution Guide", "Guide", True),
    ]
    for title, rtype, gated in resources:
        if q1(f"SELECT id FROM cms_resources WHERE title={sql_text(title)} AND deleted_at IS NULL"):
            continue
        uploaded = admin.upload(f"{title.lower().replace(' ', '-')}.pdf", make_pdf(title, [f"{title}", "Prepared by the ComplianceOS content team (demo)."] + [f"{i}. Review item {i}" for i in range(1, 12)]),
                                "OTHER", 0, "Resource")
        file_id = (uploaded or {}).get("id")
        payload = {"title": title, "resource_type": rtype, "status": "published", "requires_login": gated}
        if file_id:
            payload["file_id"] = int(file_id)
        else:
            payload["external_url"] = "https://example.org/guide"
        if admin.call("POST", "/api/admin/cms/resources", payload, what=f"resource {title}"):
            print(f"  + resource {title}")
    print("  done")

    if int(q1("SELECT COUNT(*) FROM contact_enquiries", 0)) < 4:
        for name, company, subject, kind, message in (
            ("Anitha Rajendran", "Rajendran Spinning Mills", "Annual compliance audit quote", "sales", "We employ about 260 workers across two shifts and need an annual compliance audit including PF/ESI and Factories Act registers."),
            ("Mohamed Farook", "Farook Leather Exports", "Request for a product demo", "demo", "Please arrange a walkthrough of the payroll and statutory registers modules for our HR team."),
            ("Selvi Murugesan", "", "Support - cannot download payslip", "support", "One of our employees cannot download the September payslip PDF from the self-service portal."),
        ):
            payload = {"name": name, "email": name.split()[0].lower() + "@example.com", "mobile": "9840022222", "company_name": company,
                       "subject": subject, "message": message, "enquiry_type": kind}
            status, body = admin.send("POST", "/api/public/contact", payload)
            print(f"  enquiry {subject}: {status}")

