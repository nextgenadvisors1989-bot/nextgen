"""Seed stages: documents, compliance register entries, audits + reports + verification."""
from seed_common import admin, employers_map, iso, login_as
from seed_lib import db, make_pdf, multipart, q1, section, sql_text

EMP_DOCS = [("Aadhaar Card", "AAD"), ("PAN Card", "PAN"), ("Bank Passbook", "BNK"), ("Educational Certificate", "EDU")]


def stage_documents():
    section("Employee documents (uploaded through each employee's own login)")
    rows = db("SELECT e.id, e.name, u.email FROM employees e JOIN users u ON u.id = e.user_id "
              "WHERE e.deleted_at IS NULL AND u.email LIKE '%@emp.demo.complianceos.local' ORDER BY e.id")
    for employee_id, name, email in rows:
        if int(q1(f"SELECT COUNT(*) FROM employee_documents WHERE employee_id={employee_id}", 0)) >= 2:
            continue
        session = login_as(email, "employee")
        if not session:
            continue
        for index, (title, short) in enumerate(EMP_DOCS[: 2 + int(employee_id) % 3]):
            pdf = make_pdf(f"{title} - {name}", [f"Employee: {name}", f"Document: {title}", f"Reference: {short}-{int(employee_id):04d}-{index + 1}",
                                                 "Scanned copy filed for the personal file (demo data)."])
            body, ctype = multipart(
                [("document_type", title), ("document_name", f"{title} - {name}"), ("document_number", f"{short}{int(employee_id):04d}{index}")],
                [("file", f"{short.lower()}-{employee_id}.pdf", "application/pdf", pdf)])
            status, payload = session.send("POST", "/api/employee/documents", body, content_type=ctype)
            if status not in (200, 201):
                print(f"  ! employee doc {name}: {status} {payload.get('message') if isinstance(payload, dict) else payload}")
        print(f"  + documents for {name}")

    section("Auditor certificates and employer registrations")
    for auditor_id, name in db("SELECT id, name FROM auditors WHERE deleted_at IS NULL"):
        if int(q1(f"SELECT COUNT(*) FROM files WHERE entity_type='AUDITOR' AND entity_id={auditor_id}", 0)):
            continue
        for cert in ("Professional certificate", "ID proof"):
            admin.upload(f"{cert.lower().replace(' ', '-')}-{auditor_id}.pdf",
                         make_pdf(f"{cert} - {name}", [f"Auditor: {name}", "Issued by the certifying body (demo)."]), "AUDITOR", auditor_id, cert)
    for employer_id, name in db("SELECT id, company_name FROM employers WHERE deleted_at IS NULL"):
        if int(q1(f"SELECT COUNT(*) FROM files WHERE entity_type='EMPLOYER' AND entity_id={employer_id}", 0)):
            continue
        for cert in ("GST certificate", "Certificate of incorporation"):
            admin.upload(f"{cert.lower().replace(' ', '-')}-{employer_id}.pdf",
                         make_pdf(f"{cert} - {name}", [f"Establishment: {name}", "Registered copy (demo data)."]), "EMPLOYER", employer_id, cert)
    print("  done")


def stage_compliance():
    section("Compliance documents per employer")
    options = admin.call("GET", "/api/admin/compliance/options") or {}
    acts = options.get("acts") or options.get("actOptions") or []

    def act_for(keyword):
        for act in acts:
            label = str(act.get("act_name") or act.get("label") or act.get("name") or "")
            if keyword.lower() in label.lower():
                return int(act.get("id") or act.get("value"))
        return None

    catalogue = [
        ("Factory Licence", "Licence", "Inspector of Factories", "Factories", 400, 730, "Safety Officer"),
        ("PF Establishment Registration", "Registration", "EPFO Regional Office", "Provident", None, None, "HR Manager"),
        ("ESI Registration", "Registration", "ESIC Sub-Regional Office", "State Insurance", None, None, "HR Manager"),
        ("Fire NOC", "Certificate", "Tamil Nadu Fire & Rescue Services", "Factories", 24, 365, "Safety Officer"),
        ("Boiler Inspection Certificate", "Certificate", "Directorate of Boilers", "Factories", -18, 365, "Plant Manager"),
        ("Contract Labour Licence", "Licence", "Labour Department", "Contract Labour", 120, 365, "Contractor Manager"),
        ("Trade Licence", "Licence", "Municipal Corporation", None, 200, 365, "Admin Manager"),
        ("Factory Insurance Policy", "Insurance", "New India Assurance", None, 15, 365, "Finance Manager"),
    ]
    for code, employer_id in employers_map().items():
        if int(q1(f"SELECT COUNT(*) FROM compliance_documents WHERE employer_id={employer_id} AND deleted_at IS NULL", 0)) >= 5:
            continue
        for index, (name, dtype, authority, act_keyword, expiry_days, validity, owner) in enumerate(catalogue):
            payload = {
                "employer_id": employer_id, "document_name": name, "document_type": dtype, "issuing_authority": authority,
                "document_number": f"{code}/{name[:3].upper()}/2026/{100 + index}", "renewal_responsibility": owner, "remind_days_before": 30,
                "issue_date": iso(expiry_days - validity) if expiry_days is not None else iso(-500),
                "expiry_date": iso(expiry_days) if expiry_days is not None else None,
                "fee_amount": 1500 + index * 750, "notes": "Demo record.", "is_verified": index % 2 == 0,
            }
            keyword_act = act_for(act_keyword) if act_keyword else None
            if keyword_act:
                payload["act_id"] = keyword_act
            result = admin.call("POST", "/api/admin/compliance/documents", payload, what=f"{code} {name}")
            if result:
                admin.upload(f"{name.lower().replace(' ', '-')}-{code.lower()}.pdf",
                             make_pdf(name, [f"Establishment code: {code}", f"Issued by: {authority}", f"Number: {payload['document_number']}",
                                             f"Valid until: {payload['expiry_date'] or 'Perpetual'}"]),
                             "COMPLIANCE_DOCUMENT", result.get("documentId"), name)
        print(f"  + compliance documents for {code}")


def report_body(theme, variant):
    findings = [
        {"severity": "Critical", "clause": "Factories Act 1948 - s.21", "description": f"{theme}: guarding interlock found bypassed on one machine, exposing the operator.",
         "evidence": "Photograph P-07; operator interview", "recommendation": "Restore the interlock and lock out the machine until repaired.", "status": "Open"},
        {"severity": "Major", "clause": "Tamil Nadu Factories Rules 1950 - Rule 61", "description": f"{theme}: PPE issue register unsigned for several operators during the audit window.",
         "evidence": "Register page 42", "recommendation": "Reconstruct the register and enforce daily sign-off.", "status": "Open"},
        {"severity": "Minor", "clause": "Factories Act 1948 - s.41C", "description": f"{theme}: safety committee minutes were not circulated to the shop floor.",
         "evidence": "Notice board inspection", "recommendation": "Circulate minutes within 7 days of each meeting.", "status": "In Progress"},
    ]
    scores = [(40, 32 + variant % 5), (30, 18 + variant % 6), (30, 24 - variant % 3)]
    names = ("Machine guarding", "PPE compliance", "Training records")
    remarks = ("Interlock gap", "Register incomplete", "Refresher overdue")
    return {
        "executive_summary": f"{theme} was reviewed end to end. Controls are broadly in place; the gaps noted below need closure before the next cycle.",
        "methodology": "Walk-through of the premises, document verification against statutory registers, interviews with the safety officer and shop-floor staff.",
        "scorecard": [{"section": n, "max_score": m, "obtained_score": o, "remarks": r} for n, (m, o), r in zip(names, scores, remarks)],
        "findings": findings[: 3 - (variant % 2)],
        "observations": ["Housekeeping has improved since the last audit", "Emergency exits are unobstructed"],
        "recommendations": ["Fit tamper-proof interlock housings", "Digitise the PPE register"],
        "regulatory_references": ["Factories Act, 1948 - s.21, s.41C", "Tamil Nadu Factories Rules, 1950 - Rule 61"],
    }


def stage_audits():
    section("Audit assignments and reports")
    verifier_user = q1("SELECT id FROM users WHERE email='verifier.test@complianceos.local'")
    second_verifier = q1("SELECT id FROM users WHERE email='senior.verifier@demo.complianceos.local'")
    auditors = {name: int(i) for i, name in db("SELECT id, name FROM auditors WHERE deleted_at IS NULL")}
    emp = employers_map()
    plan = [
        ("SBT", "Priya Venkatesan", "Annual Factories Act compliance audit 2026", -60, "approved"),
        ("SBT", "Karthik Rajan", "Electrical safety and earthing audit", -35, "under_review"),
        ("SBT", "Priya Venkatesan", "Contract labour compliance audit", -5, "in_progress"),
        ("KEW", "Anand Krishnan", "Fire safety and emergency preparedness audit", -45, "changes_requested"),
        ("KEW", "Karthik Rajan", "Machine guarding and safety audit", -20, "submitted"),
        ("KEW", "Deepa Narayanan", "Wage register and statutory returns audit", 7, "scheduled"),
        ("GFP", "Deepa Narayanan", "Payroll and PF/ESI compliance audit", -30, "approved"),
        ("GFP", "Anand Krishnan", "Food factory hygiene and fire audit", -3, "draft_report"),
        ("GFP", "Priya Venkatesan", "Women employees welfare and creche audit", 21, "scheduled"),
    ]
    verifier = login_as("verifier.test@complianceos.local", "verifier") if verifier_user else None
    verifier2 = login_as("senior.verifier@demo.complianceos.local", "verifier") if second_verifier else None

    for index, (code, auditor_name, title, start, path) in enumerate(plan):
        employer_id = emp.get(code)
        auditor_id = auditors.get(auditor_name)
        if not employer_id or not auditor_id:
            continue
        verifier_id = int(verifier_user if index % 2 == 0 else (second_verifier or verifier_user))
        reviewer = verifier if verifier_id == int(verifier_user) else (verifier2 or verifier)

        assignment_id = q1(f"SELECT id FROM audit_assignments WHERE audit_title={sql_text(title)} AND employer_id={employer_id}")
        if not assignment_id:
            unit_id = q1(f"SELECT id FROM company_units WHERE employer_id={employer_id} ORDER BY id LIMIT 1")
            department_id = q1(f"SELECT id FROM departments WHERE employer_id={employer_id} ORDER BY id LIMIT 1")
            result = admin.call("POST", "/api/admin/audit-assignments", {
                "assignment_type": "AUDIT", "audit_title": title, "employer_id": employer_id,
                "unit_id": int(unit_id) if unit_id else None, "department_id": int(department_id) if department_id else None,
                "auditor_id": auditor_id, "verifier_id": verifier_id,
                "start_date": iso(start), "end_date": iso(start + 4), "due_date": iso(start + 14),
                "priority": ["High", "Medium", "Urgent", "Low"][index % 4], "fee_amount": 30000 + index * 4000,
                "scope": "Registers, welfare amenities, safety committee records, canteen and creche, statutory returns.",
                "instructions": "Carry the previous audit report. Photograph all findings.",
            }, what=f"assignment {title}")
            if not result:
                continue
            assignment_id = result["assignmentId"]
            print(f"  + {title} ({path})")
            if path != "scheduled":
                admin.call("PUT", f"/api/admin/audit-assignments/{assignment_id}", {"status": "In Progress", "progress_percent": 40 + index * 3}, what="progress")
        assignment_id = int(assignment_id)
        if path in ("scheduled", "in_progress"):
            continue

        report_id = q1(f"SELECT id FROM audit_reports WHERE assignment_id={assignment_id} AND deleted_at IS NULL")
        if not report_id:
            report = admin.call("POST", "/api/admin/audit-reports", {
                "assignment_id": assignment_id, "employer_id": employer_id, "auditor_id": auditor_id,
                "audit_title": f"{title} - report", "report_type": "AUDIT",
                "audit_period_from": iso(start), "audit_period_to": iso(start + 4), "audit_date": iso(start + 4),
                "body": report_body(title, index), "next_audit_due": iso(start + 365),
            }, what=f"report {title}")
            if not report:
                continue
            report_id = report["reportId"]
        report_id = int(report_id)

        def status():
            return q1(f"SELECT status FROM audit_reports WHERE id={report_id}")

        if path == "draft_report":
            continue
        if status() == "Draft":
            admin.call("POST", f"/api/admin/audit-reports/{report_id}/submit",
                       {"change_summary": "Initial submission", "verifier_id": verifier_id, "send_to_verifier": True}, what="submit report")
        if path == "submitted" or not reviewer:
            continue
        if status() == "Submitted":
            reviewer.call("POST", f"/api/verifier/reports/{report_id}/start-review", {}, what="start review")
        if path == "under_review":
            continue
        if status() == "Under Review":
            if path == "changes_requested":
                reviewer.call("POST", f"/api/verifier/reports/{report_id}/review", {
                    "action": "return", "reason": "Evidence gaps on two findings",
                    "comments": "The interlock repair evidence is missing and the PPE register still shows gaps. Please strengthen both before approval.",
                    "corrections": [
                        {"section_ref": "Finding F-01", "field_ref": "evidence", "severity": "critical", "note": "Attach the repair work order and the post-repair test record."},
                        {"section_ref": "Finding F-02", "field_ref": "evidence", "severity": "major", "note": "Reconcile the PPE register and attach the corrected pages."},
                    ], "notify_auditor": True}, what="return report")
            elif path == "approved":
                reviewer.call("POST", f"/api/verifier/reports/{report_id}/review", {
                    "action": "approve", "comments": "Findings are well evidenced and recommendations are actionable. Report approved.",
                    "next_audit_due": iso(start + 365), "notify_auditor": True, "notify_employer": True}, what="approve report")
    print("  done")
