"""The third batch of the client's reports (2026-11-05, 16:09 - 16:36), built from the files the client sent. A heading in the client's chat names the audit,
"integrated" means several files become ONE form:

    Fire Safety Audit        fire-audit-18-Dec-19 (1).pdf + 032_FSA_Report_Gardenia.pdf            -> Fire Safety Audit Report
    Safety Audit             Final-Report_External-Safety-Audit.pdf + External safety audit report -2022.pdf + Safety-Audit-Report-2024-Rams -> Safety Audit Report
    Factory Capability and Capacity Audit   b9c2a2a5...pdf (FCCA, 10 sections)                  -> Factory Capability and Capacity Audit
    Life Cycle Assessment    Example_LCA_Report.pdf                                                -> Life Cycle Assessment Report
    Integrated CHWTSDF Audit Common and Captive TSDF Audit Report.pdf (Form-1 + EIA / EMP)         -> Integrated CHWTSDF Audit Report
    "Please refer this structure"   Certified Compliance Reports (CCR) for EC expansion EIA .pdf   -> Certified Compliance Report (CCR)
    "Data management with calculation"   Energy 2023 - 2024 - WATER, ELECTRICAL, WOOD, WASTE ... .xlsx -> Resource Data Management
    49 1 Ground Water Extract NOC Application.pdf                                                  -> Ground Water Extraction NOC Application

Chapters, questionnaires and tables of the documents are the sections, fields and tables of the forms; nothing of the sample organisations is pre-filled.
The text editor is used for narrative parts and attach fields for photographs, drawings, certificates and annexures. Filled forms print as reports.
"""
from forms_dsl import (
    _field, area, checklist, col, coldate, colformula, colnum, colsel, date, form, formula, header, multi, note, num, picture, reset_keys, rich, sec, select, signoff, table, table_sec,
    text, unique, upload,
)
from forms_catalogue_aa_studies import MONTHS, PRIORITY, STATUS, cover, eia_report

OKNG = ["OK", "NG", "NA"]
COMPLIANCE3 = ["Compliant", "Non-compliant", "Partly compliant", "Not applicable"]
TIMELINE = ["Immediate", "1-2 weeks", "6 weeks", "6 months", "Compliant", "Not applicable"]


# ───────────────────────────── fire safety audit ─────────────────────────────

FIRE_CHECKSHEET = [
    "Are all areas clean and tidy (5S being maintained properly)? Flammable / combustible material kept separate from source of ignition / heat / electrical panel. Is a smoking zone available and followed?",
    "Are electrical wiring / fittings in good condition (no chance of short circuiting near the combustible material storage area)?",
    "Is a hot work permit system available / adequate and followed properly, with check points: no flammable material near the hot work area, fire extinguisher ready during hot work, monitoring of the area, flashback arrestor in the gas cutting set?",
    "Are enough number and appropriate type of fire extinguishers provided and maintained in good working condition? (within 15 m in low and moderate hazard or each 200 m2; within 10 m radius or each 100 m2 in high hazard; or as per IS 2190)",
    "Are certified trained fire volunteers and first aiders / security staff (minimum 10 % of total employees) available 24 x 7? (as per State Factory Rules)",
    "Are periodic firefighting drills using fire extinguishers and other firefighting equipment conducted? (once in 2 months or 3 months as per State Factory Rules)",
    "Are emergency exits, signage (self-illuminated type) and emergency light (with battery backup) available? Are emergency exit routes free from obstruction and are employees aware of them?",
    "Is the emergency contact number of the nearest fire station readily available to make the call in case of emergency and displayed at prominent places?",
    "Is an automatic fire detection / alarm system provided and maintained in working condition? (as per National Building Code)",
    "Is an appropriate fire suppression system provided and maintained in working condition in high fire hazard areas like paint shop, paint and thinner store, gasoline storage and other similar areas? (as per NBC)",
    "Are hose reels provided and maintained in working condition? (as per NBC)",
    "Is a fire hydrant system provided with a dedicated fire water tank and maintained in working condition? (as per NBC)",
]
FIRE_SECTIONS = ["Evacuation pathway", "Stairways", "Discharge level", "Fire separation", "Safety systems", "Management"]
FIRE_CHECKPOINTS = [
    "Have all evacuation pathways the minimum required width in accordance with the guideline?", "Are all evacuation pathways free of any permanent obstacles?",
    "Are all evacuation pathways free of any temporary stored items?", "Do all evacuation ramps comply with the maximum allowable slope?",
    "Do all floor exit doors and final exit doors swing in the direction of evacuation?", "Do the doors in the egress route open easily? Doors cannot be locked at any time in the direction of evacuation.",
    "Is the width of emergency exits satisfactory?", "Does the sum of the width of all emergency exits meet the requirement?", "Does the number of stairs meet the requirement based on the number of occupants per floor?",
    "Does the minimum width of stairs meet the requirement of the code?", "Does the sum of the width of all staircases meet the requirement in accordance with the code?", "Are handrails provided in all stairways?",
    "Is the tread / riser relationship consistent on all stairways?", "Are internal stairways linking more than two floors fire separated with fire rated walls?", "Are stairways free of any obstacles?",
    "Are stairways free of any combustibles?", "Is proper protection (e.g. fire rated barriers) provided for exterior stairs so that the exit path is not obstructed?",
    "Is the discharge floor exit / premises exit width based on the number of occupants and minimum allowable width?", "Do all stairways finish directly to outside or via a fire separated corridor?",
    "Are evacuation routes protected from production areas and high risk uses all the way to outside?", "Are any atria present linking more than two floors? If yes, are the upper floors fire separated from the atria?",
    "Are any mezzanines present? If yes, are travel distances to a protected stairway or final exit within the maximum allowable limits?",
    "Are permanent / designated storage areas (if adjacent to production area) separated with fire rated walls / doors?", "Are all high risk rooms fire separated from the rest of the operational areas?",
    "Are any smoke and heat vents required at any atria or storage area?", "Is there any opening or penetration in a slab or wall? If yes, is it properly sealed with appropriate fire rating?",
    "Are all evacuation pathways appropriately signed?", "Are all evacuation pathways appropriately illuminated with emergency lighting?", "Are all evacuation stairways appropriately illuminated with emergency lighting?",
    "Is the emergency lighting system provided with back-up power supply?", "Are detectors provided? Which type of detectors are provided?", "Is there an automatic detection and alarm system that complies with the guidelines?",
    "Are the manual activation points appropriately spaced?", "Does the alarm system cover all floors?", "Is the number of detectors sufficient for coverage of the production floors and stores as per the standard?",
    "Does the factory have a provision of periodic checking of the alarm call point, alarm and detection system with records maintained?", "Are the right number of portable fire extinguishers present and properly tagged?",
    "Are the portable fire extinguishers appropriately spaced?", "Does the factory have a dedicated fire pump or hydrant system?", "Does the dedicated fire pump or hydrant system have an alternative power backup?",
    "Does the factory have a provision of periodic checking of the fire pump or hydrant system with records maintained?", "Does the number of hose meet the requirement of the code on all floors?",
    "Does the diameter of the first aid hose and standpipe meet the requirement?", "Is the performance of the hose (water pressure) satisfactory?", "Are the standpipe and first aid hose performance checked periodically and tagged properly?",
    "Does the factory have sufficient water capacity connected to the hose to supply water during peak demand?", "Is a fire-fighting lift provided in high rise buildings?", "Are fire-fighting truck access roads wide enough and free of obstacles?",
    "Are fire-fighting additional equipment (sand, water, buckets etc.) provided at the right location?", "Is a fire command station provided at the ground floor in high rise buildings?",
    "Is there a PA (public address) system audible from all corners of the factory?", "Is there back-up power supply provided for the alarm system (battery, IPS etc.)?", "Is the visual alarm placed and in working condition where required?",
    "Does the factory have a valid fire licence / permit?", "Does the factory building have approval from the authority?", "Are all production units / floors covered in the fire licence?",
    "Does the factory have a single fire safety management system in case of multi tenancy?", "Does the factory have a boiler licence?", "Does the factory have a boiler operator licence?",
    "Does the factory conduct a fire drill regularly covering all shifts, maintaining records properly?",
]

# the checkpoints of the client's sample, grouped as its six sections (the sample report lists 67; the other seven are added as findings below)
FIRE_GROUPS = dict(zip(FIRE_SECTIONS, (FIRE_CHECKPOINTS[a:b] for a, b in [(0, 9), (9, 17), (17, 20), (20, 26), (26, 53), (53, 60)])))
assert sum(len(v) for v in FIRE_GROUPS.values()) == len(FIRE_CHECKPOINTS) == 60


def fire_safety_audit():
    reset_keys()
    return form("Fire Safety Audit Report", "Fire safety audit of a factory: the fire risk assessment check sheet (sections A and B, first audit and follow-up, OK / NG / NA) and the fire safety "
                "assessment report (checkpoints in six sections with priority timelines, discharge floor capacity, distribution of checkpoints and recommendations for corrective action).", "FSR", [
        cover("Fire Safety Audit Report", text("Report no.", key="report_no"), text("Inspector / auditor and report generator", key="inspector")),
        header("Fire safety audit", extra=[
            text("GPS coordinates (latitude, longitude)", key="gps"), select("Audit round", ["First audit", "Follow-up audit"], key="audit_round"), date("Follow-up audit date", key="followup_date"),
            text("Guideline / standard followed", key="guideline", placeholder="e.g. National Building Code; the buyer's fire risk check sheet; guidelines for fire safety of existing factory buildings"),
            text("Supplier tier and code (if a buyer's supplier)", key="supplier_tier"), text("Nearest local fire station and distance (km)", key="fire_station"), text("Year plant operation started", key="year_started"),
            num("Plot area (sq m)", key="plot_area"), num("Covered area (sq m)", key="covered_area"), num("Employees (number)", key="employees"), text("About the company (products, process)", key="about_company", w=12),
            text("Fire NOC / licence no., date and validity", key="fire_noc", w=12), text("Managing director / contact person, phone and e-mail", key="contact", w=12)]),
        table_sec("Opening and closing meeting", table("meeting", "Persons present at the opening and closing meeting", [
            colsel("Meeting", ["Opening meeting", "Closing meeting"], "meeting"), col("Role (auditor, director, plant head, MR, HR / safety, maintenance)", "role", width=24), col("Name", "name"), col("Mobile", "mobile"), col("E-mail", "email"),
            col("Signature", "signature")], min_rows=1, max_rows=40)),
        sec("Executive summary",
            rich("Executive summary (the survey of the existing fire safety condition: date, standard followed, purpose of the assessment, buildings surveyed, ownership, approvals)", key="summary"),
            rich("Major issues of the fire safety assessment (e.g. aisle marking, exit signs, emergency lights, detection and alarm coverage, standpipe and hose system, additional fire-fighting equipment)", key="major_issues"),
            rich("Overall remark and immediate action by management (consequence of hazards with observation)", key="overall_remark"), cols=1),
        table_sec("Buildings and occupancy", table("buildings", "Factory information: buildings and the work activities", [
            col("Building", "building", width=22), col("Type of construction (shed, RCC ...)", "construction"), colnum("Number", "number"), col("Floors", "floors"), col("Year of construction (phase)", "year"),
            col("Used for / work activities", "use", width=24)], min_rows=1, max_rows=40)),
        table_sec("Discharge floor capacity check", table("discharge", "Discharge floor capacity check", [
            col("Level / building", "level"), colnum("Occupants (approx.)", "occupants"), colnum("Discharge floor exits", "exits"), colnum("Connected staircases", "stairs"), colnum("Total width of connected staircases (m)", "stair_width"),
            colnum("Total width of discharge floor exit (m)", "exit_width"), colnum("Required width by formula (m)", "required"), colsel("Status of discharge exit", COMPLIANCE3, "status")], min_rows=0, max_rows=30)),
        sec("Fire risk check sheet - points and score",
            num("Points applicable (section A and B)", key="points_total"), num("First audit - OK", key="first_ok"), num("First audit - NG", key="first_ng"), num("First audit - NA", key="first_na"),
            formula("First audit score (%)", "IF(first_ok + first_ng == 0, 0, ROUND(first_ok / (first_ok + first_ng) * 100, 1))", key="first_score"),
            num("Follow-up audit - OK", key="follow_ok"), num("Follow-up audit - NG", key="follow_ng"), num("Follow-up audit - NA", key="follow_na"),
            formula("Follow-up audit score (%)", "IF(follow_ok + follow_ng == 0, 0, ROUND(follow_ok / (follow_ok + follow_ng) * 100, 1))", key="follow_score"),
            select("Rating", ["OK", "Can improve", "NG"], key="rating"), text("Prepared by", key="prepared_by_name"), text("Approved by", key="approved_by"), cols=2),
        checklist("Fire risk check sheet - first audit", FIRE_CHECKSHEET, options=OKNG, description="Section A: points applicable to all; section B: other points as applicable. OK / NG / NA."),
        checklist("Fire risk check sheet - follow-up audit", FIRE_CHECKSHEET, options=OKNG, description="The same check points at the follow-up audit."),
        *[checklist(f"Checkpoints - {name}", FIRE_GROUPS[name], options=COMPLIANCE3) for name in FIRE_SECTIONS],
        table_sec("Detailed observations of non-conformities", table("checkpoints", "Non-conformities, priority and corrective action", [
            colsel("Section", FIRE_SECTIONS, "section"), col("No.", "no"), colsel("Checkpoint", FIRE_CHECKPOINTS, "checkpoint", width=26), colsel("Status", COMPLIANCE3, "status"), colsel("Priority / timeline", TIMELINE, "priority"),
            col("Location", "location"), col("Description of the non-conformity", "description", width=22), col("Corrective action", "action", width=22), col("References (code clause)", "reference")],
            min_rows=1, max_rows=200)),
        sec("Distribution of checkpoints",
            num("Immediate - the facility should not continue to be occupied until rectified", key="n_immediate", w=4), num("1-2 weeks - action in the fire safety management plan", key="n_weeks_2", w=4),
            num("6 weeks - remedy work", key="n_weeks_6", w=4), num("6 months - remedy work", key="n_months_6", w=4), num("Compliant - no corrective action", key="n_compliant", w=4),
            num("Not applicable", key="n_na", w=4), formula("Total checkpoints", "n_immediate + n_weeks_2 + n_weeks_6 + n_months_6 + n_compliant + n_na", key="n_total"), cols=3),
        table_sec("Checkpoints by section", table("sections", "Number of checkpoints and non-compliances in every section", [
            colsel("Section", FIRE_SECTIONS, "section", width=30), colnum("No. of checkpoints", "checkpoints", total=True), colnum("No. of non-compliances", "noncompliances", total=True)], min_rows=0, max_rows=12, totals=True)),
        sec("Summary and recommendations",
            rich("Summary (the fire authority / DIFE summary of the findings)", key="authority_summary"),
            upload("Floor layout plans, location map, photographs of the factory building and of the non-conformities", key="fire_files"), cols=1),
        table_sec("Recommendations for corrective action", table("recommendations", "Recommendations for corrective action", [
            col("Recommendation", "recommendation", width=40), colsel("Priority / timeline", TIMELINE, "priority"), col("Responsible", "owner"), coldate("Target date", "target"), colsel("Status", STATUS, "status")], min_rows=1, max_rows=80)),
        sec("Disclaimer", rich("Disclaimer", key="disclaimer"), cols=1),
        signoff(),
    ], form_type="AUDIT", report=True)


# ───────────────────────────── safety audit (IS 14489, third party external) ─────────────────────────────

IS_14489 = ["Occupational health and safety (OH&S) management", "Physical hazard", "Chemical hazard", "Fire and explosion hazard", "Industrial hygiene / occupational health",
            "Accident / incident reporting, investigation and analysis", "Emergency preparedness (on-site / off-site)", "Safety inspection"]


def safety_audit():
    reset_keys()
    return form("Safety Audit Report", "Third party external safety audit report (IS 14489:2018 elements): preamble, executive summary with good practices and non-conformities, audit checklists, "
                "regulatory compliance and the annexures (attendance sheets, records examined, team).", "SAR", [
        cover("Third Party External Safety Audit Report", text("Report no.", key="report_no"), text("Revision, date of issue", key="revision"), text("Reviewed by", key="reviewed_by")),
        header("Safety audit", extra=[text("Audit dates (from - to)", key="audit_dates"), text("Audit agency", key="agency"), text("Audit team (team leader and members)", key="team", w=12),
                                      text("Standard / scope reference", key="standard", default="IS 14489:2018"), text("Nature of the plant / facility", key="plant_nature")]),
        sec("Acknowledgement and disclaimer", rich("Acknowledgement", key="acknowledgement"), rich("Disclaimer (terms and conditions on which the report is issued)", key="disclaimer"), cols=1),
        sec("Part 1 - Preamble",
            rich("1.1 Introduction", key="introduction"), rich("1.2 Scope", key="scope_text"),
            multi("Elements covered by the audit (IS 14489)", IS_14489, key="elements", w=12),
            rich("1.3 Objectives", key="objectives"), rich("1.4 Methodology (audit plan, questionnaire / checklist, document study, field inspections)", key="methodology"),
            rich("1.5 Opening meeting", key="opening"), rich("1.6 Field inspections / process-related audits", key="inspections"), rich("1.7 Discussions", key="discussions"),
            rich("1.8 Study of documents", key="documents"), rich("1.9 Concluding meeting", key="concluding"), rich("1.10 Brief description of the facility (location, process, products, utilities, layout)", key="description"),
            upload("Site layout, process flow diagram and location map", key="layout_files"), cols=1),
        table_sec("1.11 Human resources", table("human", "Human resources", [
            col("Category (managers, engineers, operators, contract workers, security ...)", "category", width=34), colnum("Number", "number", total=True), col("Remarks", "remarks")], min_rows=1, max_rows=20, totals=True)),
        table_sec("1.12 Licences available", table("licences", "Licences and statutory approvals", [
            col("Licence / approval", "licence", width=26), col("Number", "number"), col("Issued by", "issued_by"), coldate("Valid up to", "valid"), colsel("Status", ["Valid", "Expired", "Applied", "Not applicable"], "status")], min_rows=1, max_rows=40)),
        sec("Part 2 - Executive summary", rich("Executive summary (overall impression of the safety management, main strengths, main gaps)", key="summary"), cols=1),
        table_sec("2.1 Noteworthy efforts / strengths / good practices", table("good_practices", "Good practices", [col("Area / location", "area", width=22), col("Good practice", "practice", width=50), col("Remarks", "remarks")], min_rows=0, max_rows=60)),
        table_sec("2.2 Non-conformities / observations (areas for improvement)", table("observations", "Non-conformities and observations", [
            col("Sl. no.", "no"), col("Area / location", "area", width=16), colsel("IS 14489 element", IS_14489, "element", width=18), col("Observation", "observation", width=28), col("Recommendation", "recommendation", width=28),
            colsel("Priority / risk", PRIORITY, "priority"), col("Responsibility", "owner"), coldate("Target date", "target"), colsel("Status", STATUS, "status")], min_rows=1, max_rows=300)),
        table_sec("2.3 Electrical safety observations", table("electrical", "Electrical safety observations", [
            col("Location / equipment", "location"), col("Observation", "observation", width=34), col("Recommendation", "recommendation", width=30), colsel("Priority", PRIORITY, "priority"), colsel("Status", STATUS, "status")], min_rows=0, max_rows=80)),
        table_sec("Part 3 - Audit checklist", table("checklist", "Safety audit checklist (response of the auditee and finding of the auditor)", [
            colsel("Element", IS_14489, "element", width=18), col("Clause / item no.", "item"), col("Requirement / question", "requirement", width=30), col("Response of the auditee", "response", width=18),
            colsel("Finding", COMPLIANCE3, "finding"), col("Remarks / recommendation", "remarks", width=22)], min_rows=1, max_rows=600)),
        table_sec("Regulatory compliance", table("regulatory", "Regulatory compliance", [
            col("Act / rule", "act", width=24), col("Requirement", "requirement", width=28), col("Licence / registration no.", "number"), coldate("Valid up to", "valid"), colsel("Status", COMPLIANCE3, "status"), col("Remarks", "remarks")], min_rows=1, max_rows=120)),
        table_sec("Annexure - attendance sheet (opening and closing meetings)", table("attendance", "Attendance sheet", [
            colsel("Meeting", ["Opening meeting", "Closing meeting"], "meeting"), col("Name", "name"), col("Designation", "designation"), col("Department", "department"), col("Signature", "signature")], min_rows=1, max_rows=80)),
        table_sec("Annexure - records examined during the audit", table("records", "Records examined", [
            col("Record / document", "record", width=34), col("Reference / date", "reference"), colsel("Available", ["Yes", "No", "Partly"], "available"), col("Remarks", "remarks")], min_rows=1, max_rows=120)),
        table_sec("Audit team", table("audit_team", "Profile of the audit team", [col("Name", "name"), col("Role", "role"), col("Qualification and experience", "experience", width=40)], min_rows=0, max_rows=20)),
        sec("Attachments", upload("Photographs, test reports, records and the annexures", key="safety_files"), cols=1),
        signoff(),
    ], form_type="AUDIT", report=True)


# ───────────────────────────── factory capability and capacity audit (FCCA) ─────────────────────────────

FCCA_CATEGORIES = ["1.0 Factory facility and environment", "2.0 Quality management system", "3.0 Incoming material quality control", "4.0 Process and production control",
                   "5.0 In-house lab testing", "6.0 Final inspection", "7.0 People resources and training"]


def _fcca_scoring():
    fields = []
    for i, category in enumerate(FCCA_CATEGORIES, start=1):
        fields += [num(f"{category} - total possible points", key=f"c{i}_possible", w=3), num(f"{category} - total actual points", key=f"c{i}_actual", w=3),
                   num(f"{category} - total N/A points", key=f"c{i}_na", w=3),
                   formula(f"{category} - percentage (%)", f"IF(c{i}_possible - c{i}_na == 0, 0, ROUND(c{i}_actual / (c{i}_possible - c{i}_na) * 100, 0))", key=f"c{i}_pct", w=3)]
    count = range(1, len(FCCA_CATEGORIES) + 1)
    total = lambda part: " + ".join(f"c{i}_{part}" for i in count)
    return fields + [formula("Overall - total possible points", total("possible"), key="all_possible", w=3), formula("Overall - total actual points", total("actual"), key="all_actual", w=3),
                     formula("Overall - total N/A points", total("na"), key="all_na", w=3),
                     formula("Overall - percentage (%) of the adjusted points", f"IF(all_possible - all_na == 0, 0, ROUND(all_actual / (all_possible - all_na) * 100, 0))", key="all_pct", w=3)]


def fcca():
    reset_keys()
    return form("Factory Capability and Capacity Audit", "FCCA report in 10 sections: overall information, scoring summary, executive summary, basic information, factory contacts, factory details, "
                "capability, capacity, corrective action plan and the clauses assessed.", "FCC", [
        cover("Factory Capability and Capacity Audit (FCCA)", text("Third party audit company", key="audit_company"), text("Audited by / reviewed by (with dates)", key="audited_reviewed")),
        header("FCCA", extra=[
            text("Request ID", key="request_id"), select("Audit type", ["Initial audit", "Follow-up audit", "Annual audit"], key="audit_type"), date("Scheduled date", key="scheduled_date"),
            select("Overall audit result", ["Pass", "Fail", "Pending"], key="result"), text("Product category", key="product_category"), select("Factory type", ["Existing", "New"], key="factory_type"),
            text("Factory ID", key="factory_id"), text("Supplier name", key="supplier_name"), text("Supplier ID", key="supplier_id"), text("Proposed brands", key="brands"), text("Brand", key="brand"),
            text("Reviewer", key="reviewer"), date("Reviewed date", key="reviewed_date"), text("Sourcing contact (name, phone, e-mail)", key="sourcing_contact", w=12), text("Credit office", key="credit_office"),
            text("Sourcing channel", key="channel"), text("Products made in the factory", key="products_made", w=12), select("Virtual audit", ["No", "Yes"], key="virtual")]),
        table_sec("Retail market and department", table("retail", "Retail market and department number", [col("Retail market", "market", width=40), col("Department number", "department", width=30)], min_rows=0, max_rows=10)),
        sec("General photos", upload("Exterior of the factory, address board, gate, production buildings, reception, show room, certificates, business licence, test reports", key="general_photos"), cols=1),
        sec("Section 2: Scoring summary", *_fcca_scoring(), cols=4, description="The overall score is the total of the actual points over the adjusted points (possible minus N/A)."),
        sec("Section 3: Executive summary",
            rich("Basic information (founded, production and warehouse area, employees, years of experience, exports, main markets and clients)", key="summary_basic"),
            rich("Capability (manufacturing capability, main processes, equipment and its maintenance)", key="summary_capability"),
            rich("Capacity (space, lead times, maximum monthly output, quality department)", key="summary_capacity"),
            rich("Quality management system (certification, procedures, incoming, in-process and final inspection)", key="summary_quality"),
            rich("In-house laboratory, people resources and training", key="summary_lab"), rich("Conclusion and areas for improvement", key="summary_conclusion"), cols=1),
        sec("Section 4: Basic information",
            text("Factory address", key="f_address", w=12), text("Factory country / region", key="f_country"), text("Factory telephone", key="f_phone"), text("Factory mobile", key="f_mobile"), text("Factory e-mail", key="f_email"),
            text("Key contact person for the buyer (factory)", key="f_contact", w=12),
            text("Supplier address", key="s_address", w=12), text("Supplier country / region", key="s_country"), text("Supplier telephone", key="s_phone"), text("Supplier mobile", key="s_mobile"),
            text("Supplier e-mail", key="s_email"), text("Key contact person for the buyer (supplier)", key="s_contact", w=12)),
        table_sec("Section 5: Factory contacts", table("contacts", "Factory contacts", [
            col("Name", "name"), col("Title (R&D manager, production manager, general manager, quality manager ...)", "title", width=26), col("E-mail", "email"), col("Phone", "phone"), colnum("Years in position", "years")], min_rows=1, max_rows=20)),
        sec("Section 6: Factory details",
            select("1. Type of ownership", ["Totally owned by supplier", "Joint venture", "Leased", "Other"], key="ownership"), num("2. Year established", key="established"),
            multi("3. Certification", ["ISO 9001:2015", "ISO 14001", "ISO 45001", "BSCI", "SEDEX", "WRAP", "ICTI / ICTI Ethical Toy Program", "Other"], key="certification", w=12),
            multi("4a. Product safety compliance", ["CE", "UL", "CSA", "ASTM", "EN 71", "Other"], key="safety_compliance", w=12),
            multi("4b. EU REACH (SVHC) and 4c. RoHS", ["REACH test report", "REACH product certificate", "RoHS test report", "RoHS product certificate"], key="reach_rohs", w=12),
            select("5. Factory setup", ["Vertical production", "Assembly only", "Outsourced production"], key="setup"), text("6. Product category produced", key="category_produced"),
            num("7a. Export rate (%)", key="export_rate"), num("7b. Domestic rate (%)", key="domestic_rate"), text("7c. Please specify", key="export_specify"), cols=2),
        table_sec("8. Current major customers", table("customers", "Current major customers", [
            col("Name", "name"), col("Product produced", "product"), colnum("Percentage (%)", "percentage", total=True), colnum("Years in business with", "years")], min_rows=1, max_rows=20, totals=True)),
        table_sec("9. Current sub-contracted factories", table("subcontractors", "Sub-contracted factories", [col("Process", "process"), col("Sub-contractor name", "name"), col("Factory address", "address", width=34)], min_rows=0, max_rows=20)),
        sec("Section 7: Capability",
            num("1. Sampling lead time - new item (days from order release)", key="sampling_new"), num("1. Sampling lead time - modified item (days)", key="sampling_modified"),
            num("2. Production lead time - new item (days from sample approval)", key="production_new"), num("2. Production lead time - rebuy item (days)", key="production_rebuy"),
            num("3. Material purchasing lead time - new item (days from order release)", key="material_new"), num("3. Material purchasing lead time - rebuy item (days)", key="material_rebuy"), cols=2),
        table_sec("4. Product range (past 2 years)", table("range", "Products and quantity produced in the past 2 years", [
            col("Product", "product"), colnum("Total quantity", "quantity", total=True), colnum("Years of experience producing the product", "years"), col("Remarks", "remarks")], min_rows=1, max_rows=30, totals=True)),
        table_sec("5. Current items being produced", table("current_items", "Current items being produced", [
            col("Product", "product"), col("Material", "material"), col("Customer", "customer"), coldate("Ship date", "ship"), colnum("Quantity", "quantity", total=True)], min_rows=0, max_rows=40, totals=True)),
        table_sec("6. Machinery", table("machinery", "Type and number of machineries", [col("Machine type", "type", width=26), colnum("Machine age (years)", "age"), col("Brand", "brand"), colnum("No. of units", "units", total=True)], min_rows=1, max_rows=80, totals=True)),
        table_sec("9. In-house testing capability", table("testing", "In-house testing capability", [col("Test", "test", width=24), col("Test equipment used", "equipment", width=28), col("Comments", "comments")], min_rows=0, max_rows=40)),
        table_sec("Section 8: Capacity", table("capacity", "Capacity", [
            col("Product category (SBU / department / category / subcategory)", "category", width=34), colnum("Units per month", "units", total=True), colnum("% of capacity occupied by supplier", "occupied"),
            colnum("Containers per month (x 40)", "containers"), colnum("Last year annual volume (USD)", "last_year"), colnum("This year estimated annual volume (USD)", "this_year")], min_rows=1, max_rows=20, totals=True)),
        sec("Capacity - factory",
            num("6. Number of employees", key="employees"), num("7. Number of production lines", key="lines"), rich("8. Production line details", key="line_details"),
            num("9a. Production area (sq m)", key="production_area"), num("9b. Finished / packed goods warehouse (sq m)", key="warehouse_area"), num("9c. Others (sq m)", key="other_area"),
            formula("10. Total storage capacity (sq m)", "warehouse_area + other_area", key="storage_total"), cols=2),
        table_sec("Section 9: Corrective action plan", table("cap", "Corrective action plan", [
            col("Clause", "clause"), col("Requirement", "requirement", width=24), col("Comments / finding", "comments", width=24), col("Root cause", "root_cause", width=18), col("Corrective action", "action", width=24),
            col("Owner", "owner"), coldate("Agreed completion date", "date"), colsel("Status", STATUS, "status")], min_rows=1, max_rows=200)),
        table_sec("Section 10: Clauses", table("clauses", "Clauses assessed", [
            colsel("Category", FCCA_CATEGORIES, "category", width=20), col("Clause", "clause"), col("Requirement", "requirement", width=34), colnum("Points possible", "possible", total=True), colnum("Points scored", "scored", total=True),
            colsel("Result", ["Compliant", "Non-compliant", "Not applicable"], "result"), col("Comments", "comments", width=24)], min_rows=1, max_rows=400, totals=True)),
        sec("Photographs and attachments", upload("Photographs of the findings, certificates and the audit working papers", key="fcca_files"), cols=1),
        signoff(),
    ], form_type="AUDIT", report=True)


# ───────────────────────────── life cycle assessment ─────────────────────────────

LCA_IMPACTS = [("Global Warming Potential, GWP", "kg CO2 eq"), ("Ozone Depletion Potential, ODP", "kg CFC-11 eq"), ("Acidification Potential for Soil and Water, AP", "kg SO2 eq"),
               ("Eutrophication Potential, EP", "kg PO4 eq"), ("Photochemical Ozone Creation Potential, POCP", "kg ethylene"), ("Abiotic Depletion Potential - Elements, ADPE", "kg antimony"),
               ("Abiotic Depletion Potential - Fossil Fuels, ADPF", "MJ"), ("Net use of fresh water, FW", "kg")]
LCA_STAGES = ["A1-A3 Product stage", "A4 Transport to site", "A5 Construction process", "B1 Use", "B2 Maintenance", "B3 Repair", "B4 Replacement", "B5 Refurbishment", "B6 Operational energy use",
              "B7 Operational water use", "C1 Deconstruction", "C2 Transport", "C3 Waste processing", "C4 Disposal", "D Benefits and loads beyond the system boundary"]


def _lca_impacts():
    fields = []
    for i, (name, unit) in enumerate(LCA_IMPACTS, start=1):
        label = f"{name} ({unit})"
        fields += [num(f"{label} - benchmark design", key=f"i{i}_bench", w=3), num(f"{label} - final design", key=f"i{i}_final", w=3),
                   formula(f"{label} - change (%)", f"IF(i{i}_bench == 0, 0, ROUND((i{i}_final - i{i}_bench) / i{i}_bench * 100, 1))", key=f"i{i}_change", w=3),
                   formula(f"{label} - final as % of benchmark", f"IF(i{i}_bench == 0, 0, ROUND(i{i}_final / i{i}_bench * 100, 0))", key=f"i{i}_ratio", w=3)]
    return fields


def lca_report():
    reset_keys()
    impact = [col("Indicator", "indicator"), colnum("GWP", "gwp"), colnum("ODP", "odp"), colnum("AP", "ap"), colnum("EP", "ep"), colnum("POCP", "pocp"), colnum("ADPE", "adpe"), colnum("ADPF", "adpf"), colnum("FW", "fw")]
    return form("Life Cycle Assessment Report", "Life cycle assessment (ISO 14040 / 14044, EN 15978): goal and scope, inventory analysis, life cycle impact assessment, interpretation, low impact strategies and conclusions.", "LCA", [
        cover("Life Cycle Assessment", text("Authors (name, phone, address, e-mail)", key="authors", w=12), text("Peer reviewer", key="peer_reviewer"), text("Version", key="version"), text("Software used", key="software")),
        header("Life cycle assessment", extra=[text("Project (building / product / system assessed)", key="project"), text("Standards followed", key="standards", default="ISO 14040, ISO 14044, EN 15978")]),
        sec("Disclaimer and executive summary",
            rich("Software disclaimer", key="disclaimer"), rich("Executive summary (what was assessed, the goal, the standard, design options compared, expected performance against the business as usual benchmark)", key="summary"), cols=1),
        sec("Characterised impacts per occupant per year", note("Benchmark (business as usual) design against the final design, per occupant per year."), *_lca_impacts(), cols=4),
        table_sec("Design strategies in the final design", table("strategies", "Design strategies and their performance (improvement % against the benchmark)", [
            col("Design strategy", "strategy", width=26), colnum("GWP %", "gwp"), colnum("ODP %", "odp"), colnum("AP %", "ap"), colnum("EP %", "ep"), colnum("POCP %", "pocp"), colnum("ADPE %", "adpe"),
            colnum("ADPF %", "adpf"), colnum("FW %", "fw")], min_rows=1, max_rows=80)),
        sec("1. Introduction and 2. Goal of the study", rich("1. Introduction (project, client, location, why the assessment was commissioned)", key="introduction"),
            rich("2. Goal of the study (intended application, reasons, intended audience, whether comparative assertions are disclosed to the public)", key="goal"), cols=1),
        sec("3. Scope of the study",
            text("Project location", key="location"), text("Building type / product system", key="system"), num("Gross floor area (m2)", key="floor_area"), num("Number of occupants", key="occupants"), num("Design life (years)", key="design_life", default=50),
            multi("Life cycle stages in the system boundary", LCA_STAGES, key="boundary_stages", w=12),
            rich("Functional unit and reference flow", key="functional_unit"), rich("System boundary (included and excluded processes, cut-off criteria)", key="boundary"),
            rich("Assumptions and limitations", key="assumptions"), rich("Data quality requirements and data sources (databases, region, age, representativeness)", key="data_quality"),
            rich("Allocation procedures and life cycle impact assessment methods", key="methods"), upload("System boundary diagram and the building model views", key="scope_files"), cols=1),
        table_sec("4. Inventory analysis - materials", table("materials", "Materials and building elements", [
            col("Building element", "element"), col("Material", "material", width=24), colnum("Quantity", "quantity"), col("Unit", "unit"), colnum("Embodied GWP (kg CO2 eq)", "gwp", total=True), col("Data source", "source")], min_rows=1, max_rows=300, totals=True)),
        table_sec("4. Inventory analysis - operational energy and water", table("operation", "Operational energy and water", [
            colsel("Use", ["Heating", "Cooling", "Hot water", "Lighting", "Appliances", "Cooking", "Ventilation", "Water supply", "Other"], "use"), col("Energy source / water source", "source"),
            colnum("Annual consumption", "consumption"), col("Unit", "unit"), colnum("Emission factor (kg CO2 eq per unit)", "factor"), colformula("kg CO2 eq per year", "consumption * factor", "emissions", total=True)], min_rows=1, max_rows=60, totals=True)),
        table_sec("4. Inventory analysis - transport, construction and end of life", table("transport", "Transport, construction and end-of-life scenarios", [
            colsel("Stage", ["A4 Transport to site", "A5 Construction waste and site activities", "C1 Deconstruction", "C2 Transport to waste processing", "C3 Waste processing", "C4 Disposal"], "stage", width=28),
            col("Scenario / assumption", "scenario", width=34), colnum("Quantity", "quantity"), col("Unit", "unit"), colnum("kg CO2 eq", "gwp", total=True)], min_rows=0, max_rows=40, totals=True)),
        table_sec("5. Life cycle impact assessment - results by life cycle stage", table("stages", "Results by life cycle stage", [colsel("Life cycle stage", LCA_STAGES, "stage", width=30)] + impact[1:], min_rows=1, max_rows=20)),
        sec("6. Life cycle interpretation",
            rich("6. Interpretation (significant issues, hot spots, completeness, sensitivity and consistency checks, uncertainty)", key="interpretation"),
            rich("Sensitivity analysis", key="sensitivity"), upload("Charts: contribution by life cycle stage, final design performance against the benchmark", key="lca_charts"), cols=1),
        table_sec("Hot spots", table("hotspots", "Significant contributors (hot spots)", [col("Element / process", "element", width=26), colsel("Impact", [name for name, _ in LCA_IMPACTS], "impact", width=26), colnum("Contribution (%)", "share"), col("Comment", "comment", width=28)], min_rows=0, max_rows=60)),
        table_sec("7. Low impact strategies", table("low_impact", "Low impact strategies", [
            col("Strategy", "strategy", width=22), col("Description (benchmark and design option)", "description", width=36), colnum("GWP saving (kg CO2 eq)", "gwp", total=True), colnum("Cost impact", "cost"), col("Remarks", "remarks")], min_rows=1, max_rows=100, totals=True)),
        sec("8. Conclusions", rich("8. Conclusions and recommendations", key="conclusions"), rich("Critical review / peer review statement", key="review"), upload("Model files, reports and supporting documents", key="lca_files"), cols=1),
        signoff(),
    ], form_type="ASSESSMENT", report=True)


# ───────────────────────────── integrated CHWTSDF audit (Form-1 + EIA / EMP) ─────────────────────────────

FORM1_BASIC = [
    ("Name of the project", "name"), ("Sr. no. in the schedule (EIA notification 2006)", "schedule"), ("Proposed capacity / area / length / tonnage to be handled / command area / lease area", "capacity"),
    ("New / expansion / modernisation", "kind"), ("Existing capacity / area etc.", "existing"), ("Category of project, i.e. A or B", "category"),
    ("Does it attract the general condition? If yes, please specify", "general"), ("Does it attract the specific condition? If yes, please specify", "specific"),
    ("Location: plot / survey / khasra no., village, tehsil, district, state", "location"), ("Nearest railway station / airport along with distance (km)", "nearest_station"),
    ("Nearest town, city, district headquarters along with distance (km)", "nearest_town"), ("Village panchayats, zilla parishad, municipal corporation, local body (postal address with telephone nos.)", "local_body"),
    ("Name of the applicant", "applicant"), ("Registered address", "registered_address"), ("Address for correspondence: name, designation, address, pin code, e-mail, telephone, fax", "correspondence"),
    ("Details of alternative sites examined, if any (location of these sites on a topo sheet)", "alternatives"), ("Interlinked projects", "interlinked"),
    ("Whether separate application of interlinked project has been submitted? If yes, date of submission; if no, reason", "interlinked_application"),
    ("Whether the proposal involves approval / clearance under the Forest (Conservation) Act, 1980; the Wildlife (Protection) Act, 1972; the CRZ Notification, 1991? If yes, details and status", "clearances"),
    ("Whether there is any Government order / policy relevant / relating to the site?", "policy"), ("Forest land involved (hectares)", "forest_land"),
    ("Whether there is any litigation pending against the project and / or land: name of the court, case no., orders / directions of the court and their relevance", "litigation"),
]

FORM1_CHECKLIST = [
    ("1", "Construction, operation or decommissioning of the project involving actions which will cause physical changes in the locality (topography, land use, changes in water bodies, etc.)", [
        "Permanent or temporary change in land use, land cover or topography including increase in intensity of land use (with respect to local land use plan)", "Clearance of existing land, vegetation and buildings?",
        "Creation of new land uses?", "Pre-construction investigations e.g. bore houses, soil testing?", "Construction works?", "Demolition works?", "Temporary sites used for construction works or housing of construction workers?",
        "Above ground buildings, structures or earthworks including linear structures, cut and fill or excavations", "Underground works including mining or tunnelling?", "Reclamation works?", "Dredging?", "Offshore structures?",
        "Production and manufacturing processes?", "Facilities for storage of goods or materials?", "Facilities for treatment or disposal of solid waste or liquid effluents?", "Facilities for long term housing of operational workers?",
        "New road, rail or sea traffic during construction or operation?", "New road, rail, air, waterborne or other transport infrastructure including new or altered routes and stations, ports, airports etc?",
        "Closure or diversion of existing transport routes or infrastructure leading to changes in traffic movements?", "New or diverted transmission lines or pipelines?",
        "Impoundment, damming, culverting, realignment or other changes to the hydrology of watercourses or aquifers?", "Stream crossings?", "Abstraction or transfers of water from ground or surface waters?",
        "Changes in water bodies or the land surface affecting drainage or run-off?", "Transport of personnel or materials for construction, operation or decommissioning?", "Long-term dismantling or decommissioning or restoration works?",
        "Ongoing activity during decommissioning which could have an impact on the environment?", "Influx of people to an area in either temporarily or permanently?", "Introduction of alien species?",
        "Loss of native species or genetic diversity?", "Any other actions?"]),
    ("2", "Use of natural resources for construction or operation of the project (such as land, water, materials or energy, especially any resources which are non-renewable or in short supply)", [
        "Land especially undeveloped or agricultural land (ha)", "Water (expected source and competing users) unit: KLD", "Minerals (MT)", "Construction material: stone, aggregates, sand / soil (expected source - MT)",
        "Forests and timber (source - MT)", "Energy including electricity and fuels (source, competing users) unit: fuel (MT), energy (MW)", "Any other natural resources (use appropriate standard units)"]),
    ("3", "Use, storage, transport, handling or production of substances or materials which could be harmful to human health or the environment or raise concerns about actual or perceived risks to human health", [
        "Use of substances or materials which are hazardous (as per MSIHC rules) to human health or the environment (flora, fauna, and water supplies)",
        "Changes in occurrence of disease or affect disease vectors (e.g. insect or water borne diseases)", "Affect the welfare of people e.g. by changing living conditions?",
        "Vulnerable groups of people who could be affected by the project e.g. hospital patients, children, the elderly etc.", "Any other causes"]),
    ("4", "Production of solid wastes during construction or operation or decommissioning (MT / month)", [
        "Spoil, overburden or mine wastes", "Municipal waste (domestic and or commercial wastes)", "Hazardous wastes (as per Hazardous Waste Management Rules)", "Other industrial process wastes", "Surplus product",
        "Sewage sludge or other sludge from effluent treatment", "Construction or demolition wastes", "Redundant machinery or equipment", "Contaminated soils or other materials", "Agricultural wastes", "Other solid wastes"]),
    ("5", "Release of pollutants or any hazardous, toxic or noxious substances to air (kg / hr)", [
        "Emissions from combustion of fossil fuels from stationary or mobile sources", "Emissions from production processes", "Emissions from materials handling including storage or transport",
        "Emissions from construction activities including plant and equipment", "Dust or odours from handling of materials including construction materials, sewage and waste", "Emissions from incineration of waste",
        "Emissions from burning of waste in open air (e.g. slash materials, construction debris)", "Emissions from any other sources"]),
    ("6", "Generation of noise and vibration, and emissions of light and heat", [
        "From operation of equipment e.g. engines, ventilation plant, crushers", "From industrial or similar processes", "From construction or demolition", "From blasting or piling",
        "From construction or operational traffic", "From lighting or cooling systems", "From any other sources"]),
    ("7", "Risks of contamination of land or water from releases of pollutants into the ground or into sewers, surface waters, groundwater, coastal waters or the sea", [
        "From handling, storage, use or spillage of hazardous materials", "From discharge of sewage or other effluents to water or the land (expected mode and place of discharge)",
        "By deposition of pollutants emitted to air into the land or into water", "From any other sources", "Is there a risk of long term build up of pollutants in the environment from these sources?"]),
    ("8", "Risk of accidents during construction or operation of the project which could affect human health or the environment", [
        "From explosions, spillages, fires etc. from storage, handling, use or production of hazardous substances", "From any other causes",
        "Could the project be affected by natural disasters causing environmental damage (e.g. floods, earthquakes, landslides, cloudburst etc.)?"]),
    ("9", "Factors which should be considered (such as consequential development) which could lead to environmental effects or the potential for cumulative impacts with other existing or planned activities in the locality", [
        "Lead to development of supporting facilities, ancillary development or development stimulated by the project which could have an impact on the environment (supporting infrastructure, housing development, extractive industries, supply industries, other)",
        "Lead to after-use of the site which could have an impact on the environment", "Set a precedent for later developments", "Have cumulative effects due to proximity to other existing or planned projects with similar effects"]),
]

SENSITIVE_AREAS = [
    "Areas protected under international conventions, national or local legislation for their ecological, landscape, cultural or other related value",
    "Areas which are important or sensitive for ecological reasons: wetlands, watercourses or other water bodies, coastal zone, biospheres, mountains, forests",
    "Areas used by protected, important or sensitive species of flora or fauna for breeding, nesting, foraging, resting, over wintering, migration",
    "Inland, coastal, marine or underground waters", "State, national boundaries", "Routes or facilities used by the public for access to recreation or other tourist, pilgrim areas", "Defence installations",
    "Densely populated or built-up area", "Areas occupied by sensitive man-made land uses (hospitals, schools, places of worship, community facilities)",
    "Areas containing important, high quality or scarce resources (ground water resources, surface resources, forestry, agriculture, fisheries, tourism, minerals)",
    "Areas already subjected to pollution or environmental damage (those where existing legal environmental standards are exceeded)",
    "Areas susceptible to natural hazard which could cause the project to present environmental problems (earthquakes, subsidence, landslides, erosion, flooding or extreme or adverse climatic conditions)",
]


def _chapters(sections):
    """The EIA form's many sections grouped by chapter: a section whose title starts with 'Chapter' opens a group, the table sections after it join it."""
    groups, current = [], None
    for section in sections:
        if str(section["title"]).startswith("Chapter") or current is None:
            current = {"title": section["title"], "section_code": section["section_code"], "layout_columns": 2, "is_collapsible": False, "is_collapsed": False, "show_in_pdf": True,
                       "page_break_before": False, "fields": [], "tables": []}
            groups.append(current)
        elif section["fields"]:
            current["fields"].append({"field_key": unique("chapter_heading"), "label": str(section["title"])[:250], "field_type": "heading", "column_width": 12, "show_in_pdf": True})
        current["fields"].extend(section["fields"])
        current["tables"].extend(section["tables"])
    return groups


def tsdf_audit():
    reset_keys()
    eia = eia_report()["sections"]
    chapters = _chapters(eia[2:])  # the EIA's own cover and details are replaced by this form's
    chapters[0]["title"] = "EIA - declarations and ToR compliance"
    sections = [
        cover("Integrated Common Hazardous Waste Treatment, Storage and Disposal Facility Audit", text("Project proponent (name and address)", key="proponent", w=12), text("Consultant", key="consultant")),
        header("CHWTSDF audit", extra=[text("Environmental clearance reference (proposal no., file no.)", key="ec_ref"), text("Project name and capacity", key="project_name"), text("Consultant accreditation (NABET / QCI no.)", key="accreditation")]),
        sec("Annexure 1 - Replies to the points raised by the expert committee (ADS)",
            rich("Points sought by the committee and the compliance (revised Form-1, EIA / EMP report, layout, land use, water, hazardous waste details ...)", key="ads_points"),
            upload("Replies, annexures and the letters enclosed", key="ads_files"), cols=1),
        sec("Revised Form-1 - I. Basic information", *[text(f"{i}. {label}", key=f"f1_basic_{key}", w=12) for i, (label, key) in enumerate(FORM1_BASIC, start=1)], cols=1),
    ]
    for number, title, items in FORM1_CHECKLIST:
        fields = []
        for j, item in enumerate(items, start=1):
            label = f"{number}.{j} {item}"
            fields.append(select(label if len(label) < 250 else label[:247] + "...", ["Yes", "No", "Not applicable"], key=f"f1_{number}_{j}", w=5))
            fields.append(text(f"Details of {number}.{j} (with approximate quantities / rates, wherever possible, with source of information data)", key=f"f1_{number}_{j}_details", w=7))
        sections.append(sec(f"Form-1 checklist {number}. {title[:150]}", *fields, cols=2))
    sections += [
        table_sec("Form-1 - Environmental sensitivity", table("sensitivity", "Environmental sensitivity: areas within 15 km", [
            colsel("Areas", SENSITIVE_AREAS, "area", width=40), col("Name / identity", "name"), col("Aerial distance (within 15 km) and direction", "distance"), col("Remarks", "remarks")], min_rows=1, max_rows=40)),
        sec("Facility description (integrated CHWTSDF)",
            rich("Scope of the facility: collection, transportation, receipt, short-term storage, pre-landfill processing (stabilisation), landfilling, incineration and leachate treatment", key="facility_scope"),
            num("Land area (ha)", key="land_area"), num("Secured landfill capacity (million MT)", key="landfill_capacity"), num("Incinerator capacity phase I (T/day)", key="incin_1"), num("Incinerator capacity phase II (T/day)", key="incin_2"),
            num("Common effluent treatment plant (MLD)", key="cetp_mld"), text("Storage shed (area, flooring, leachate collection)", key="storage_shed"), text("Power, fuel and water requirement", key="utilities"),
            num("Trucks of waste at peak operation (per day)", key="trucks"), rich("Transport of hazardous waste (vehicles, route, manifest system under the Hazardous and Other Wastes Rules)", key="transport"),
            rich("Landfill design (cells, liner and leachate collection system, leak detection, cover, post-closure care)", key="landfill_design"),
            rich("Incinerator design (stationary hearth / rotary kiln, air pollution control, flue gas monitoring)", key="incinerator_design"),
            rich("Leachate and effluent treatment, ground water monitoring wells, greenbelt", key="leachate"), upload("Layout plan, landfill cross sections, flow diagrams and maps", key="facility_files"), cols=2),
        table_sec("Hazardous wastes accepted at the facility", table("wastes", "Hazardous waste categories, quantities and treatment / disposal route", [
            col("Waste category (Schedule of the Hazardous Waste Rules)", "category", width=30), col("Source / industry", "source"), colnum("Quantity (TPA)", "quantity", total=True),
            colsel("Route", ["Secured landfill", "Pre-treatment and landfill", "Incineration", "Co-processing", "Recycling / recovery", "Other"], "route"), col("Remarks", "remarks")], min_rows=1, max_rows=120, totals=True)),
        table_sec("Waste acceptance, treatment and disposal records", table("disposal_records", "Waste acceptance and disposal records", [
            coldate("Date", "date"), col("Generator", "generator"), col("Waste", "waste"), colnum("Quantity (MT)", "quantity", total=True), col("Manifest no.", "manifest"), colsel("Treatment / disposal", ["Landfilled", "Incinerated", "Stored", "Rejected"], "route")], min_rows=0, max_rows=500, totals=True)),
    ]
    sections += chapters
    sections += [sec("Annexures", upload("Annexures 2 to 7 and other attachments (KIADB allotment letter, EC letters, maps, test reports)", key="annexures_tsdf"), cols=1),
                 sec("Auditor sign-off", area("Overall conclusion and recommendations", key="audit_conclusion", w=12),
                     _field("I confirm this audit was carried out on site and the entries above are true to the records seen", "checkbox", key="audit_declaration", w=12, req=True), cols=1)]
    return form("Integrated CHWTSDF Audit Report", "Integrated common hazardous waste treatment, storage and disposal facility (CHWTSDF) audit: the revised Form-1 with its checklist and environmental sensitivity, the facility "
                "description and the EIA / EMP chapters of the clearance proposal.", "TSD", sections, form_type="AUDIT", report=True)


# ───────────────────────────── certified compliance report (CCR) ─────────────────────────────

def ccr():
    reset_keys()
    return form("Certified Compliance Report (CCR)", "Application for a Certified Compliance Report for an EC expansion proposal and its processing by the Regional Office: proposal and project details, clearances, "
                "EMP, CTE / CTO, production, litigation, EC conditions compliance, site visit, approval and e-signing.", "CCR", [
        cover("Certified Compliance Report", text("Regional Office / issuing authority", key="regional_office")),
        header("CCR", extra=[text("Proposal no. of the latest EC issued to the existing project", key="proposal_no"), select("Reason for seeking the CCR", ["Expansion - EC proposal", "Other"], key="reason"),
                             text("Other reason (specify)", key="reason_other"), text("Name of the proposal as per the latest EC", key="proposal_name", w=12)]),
        sec("Application - project proponent and applicant",
            text("Name of the project proponent", key="proponent"), text("Applicant: name", key="applicant_name"), text("Applicant: designation", key="applicant_designation"), text("Applicant: mobile", key="applicant_mobile"),
            text("Applicant: e-mail", key="applicant_email"), text("Address for correspondence", key="correspondence", w=12),
            select("Latest half-yearly compliance report submitted", ["Yes", "No"], key="half_yearly"), text("Half-yearly compliance report period", key="half_yearly_period"), cols=2),
        sec("Details of the clearances issued to the existing project",
            text("EC issued under the provision of (EIA Notification 2006 and amendments / other)", key="ec_provision", w=12), text("Applicable notification", key="notification"), text("CRZ classification", key="crz"),
            select("Status of forest clearance (FC)", ["Not applicable", "Obtained", "Applied", "Not required"], key="fc_status"), upload("FC letter and additional documents", key="fc_files"),
            select("Wildlife clearance (NBWL / SBWL recommendation)", ["Not applicable", "Obtained", "Applied", "Not required"], key="wlc_status"), upload("NBWL / SBWL recommendation, if any", key="wlc_files"),
            upload("KML file of the project location", key="kml"), cols=2),
        sec("EMP, pollution status and consents",
            num("Cost of EMP - capital (Rs lakhs)", key="emp_capital"), num("Cost of EMP - recurring (Rs lakhs per year)", key="emp_recurring"), num("Actual expenditure for EMP (Rs lakhs)", key="emp_actual"), text("Remarks", key="emp_remarks"),
            select("Project located in a severely polluted area (as on date)", ["No", "Yes"], key="severely"), select("Project located in a critically polluted area (as on date)", ["No", "Yes"], key="critically"),
            select("Status of construction / operation of the existing project", ["Under construction", "Partly operational", "Operational", "Closed"], key="status_op"),
            select("CTE available for the existing project", ["Yes", "No"], key="cte"), date("Date of CTE", key="cte_date"), upload("Copy of CTE", key="cte_file"),
            select("Latest CTO available for the existing project", ["Yes", "No"], key="cto"), date("Date of latest CTO", key="cto_date"), upload("Copy of latest CTO", key="cto_file"), cols=2),
        table_sec("Annual production details", table("production", "Annual production details", [col("Product", "product", width=30), coldate("From date", "from"), coldate("To date", "to"), colnum("Quantity", "quantity", total=True), col("Unit", "unit")], min_rows=1, max_rows=60, totals=True)),
        table_sec("Litigation details", table("litigation", "Litigation details", [col("Name of the court", "court"), col("Case no.", "case"), col("Orders / directions of the court", "order", width=34), col("Relevance to the project", "relevance")], min_rows=0, max_rows=20)),
        table_sec("EC conditions and the compliance status", table("conditions", "Compliance status of the EC conditions", [
            col("Condition no.", "no"), col("EC condition", "condition", width=34), colsel("Status of compliance", ["Complied", "Partly complied", "Not complied", "Not applicable", "Under implementation"], "status", width=14),
            col("Details of compliance", "details", width=28), col("Documents / evidence (annexure no.)", "evidence")], min_rows=1, max_rows=300,
            description="General conditions and specific conditions of the EC letter; a condition missing from the proposal can be added.")),
        sec("Processing by the Regional Office",
            text("Forwarded to (official of the Regional Office)", key="forwarded_to"), date("Date of forwarding", key="forwarded_date"), date("Date of site visit", key="visit_date"), text("Officials who visited the site", key="visit_team"),
            rich("Site visit report and observations (status of compliance of the conditions, pollution control systems, monitoring, greenbelt, discrepancies)", key="visit_report"),
            upload("Site visit photographs and the supporting documents", key="visit_files"), cols=2),
        table_sec("Observations of the site visit", table("visit_observations", "Observations and discrepancies", [col("Condition no.", "no"), col("Observation", "observation", width=40), col("Action required", "action", width=26), coldate("Target date", "target")], min_rows=0, max_rows=120)),
        sec("Approval and e-signing",
            select("Decision", ["Approved", "Returned for correction", "Rejected"], key="decision"), text("Approved by (name, designation)", key="approved_by"), date("Date of approval", key="approval_date"),
            text("CCR e-signed by (name, designation)", key="esigned_by"), date("Date of e-signing", key="esign_date"), upload("Signed CCR", key="signed_ccr"), cols=2),
        signoff(),
    ], form_type="AUDIT", report=True)


# ───────────────────────────── resource data management (water, waste, energy) ─────────────────────────────

def resource_data_management():
    reset_keys()
    months12 = [colnum(f"{m[:3]}", f"m{i:02d}", total=True) for i, m in enumerate(MONTHS, start=1)]
    total12 = "m01 + m02 + m03 + m04 + m05 + m06 + m07 + m08 + m09 + m10 + m11 + m12"
    return form("Resource Data Management (Water, Waste and Energy)", "Monthly data management with calculation: water consumption (fresh, purified, rain water, recycled), waste produced and disposed by stream, "
                "electricity, solar, boiler steam, wood and ash, with totals and shares calculated.", "RDM", [
        header("Resource data", extra=[text("Year of the data", key="year", placeholder="e.g. January to December 2025"), text("Prepared by", key="prepared_by")]),
        table_sec("Water consumption - fresh water", table("water", "Fresh water consumption for the year (KL)", [
            colsel("Month", MONTHS, "month"), coldate("Reading date", "reading"), colnum("Bore well output (M1)", "borewell", total=True),
            colnum("RO feed water (FW)", "ro_feed", total=True), colnum("Canteen washing (FW)", "canteen", total=True), colnum("Toilet and hand wash (FW)", "toilet", total=True), colnum("Guest house flush (FW)", "guest", total=True),
            colnum("Hydrant input (FW)", "hydrant", total=True), colnum("Gardening (FW)", "garden_fw", total=True),
            colformula("Fresh water usage (FW)", "ro_feed + canteen + toilet + guest + hydrant + garden_fw", "fresh", total=True)], min_rows=12, max_rows=60, totals=True)),
        table_sec("Water consumption - purified, rain and recycled water", table("water_other", "Purified water, rain water and recycled water for the year (KL)", [
            colsel("Month", MONTHS, "month"), colnum("RO processed water", "ro_out", total=True), colnum("Drinking (RO)", "drinking", total=True), colnum("Laboratory (RO)", "lab", total=True),
            colnum("Boiler (RO)", "boiler", total=True), colformula("Purified water consumption", "drinking + lab + boiler", "purified", total=True), colnum("Rain water collection", "rain", total=True),
            colnum("Gardening (RW)", "garden_rw", total=True), colnum("Recycled and reused water", "recycled", total=True)], min_rows=12, max_rows=60, totals=True)),
        table_sec("Waste produced and disposed (kg per month)", table("waste", "Waste stream by month", [
            colsel("Waste stream", ["Non-hazardous", "Hazardous"], "stream", width=14), colsel("Category", ["Fabric", "Plastic", "Paper", "Metal", "Wood", "E-waste", "Food / organic", "Chemical / ETP sludge", "Used oil", "Other"], "category", width=14),
            col("Waste item", "item", width=18)] + months12 + [colformula("Total", total12, "total", total=True)], min_rows=1, max_rows=300, totals=True)),
        table_sec("Waste disposal records", table("disposal", "Disposal of waste (out-stock)", [
            coldate("Date", "date"), col("Waste item", "item"), colnum("Quantity (kg)", "quantity", total=True), col("Disposed to (agency / recycler)", "agency"), col("Authorisation / permit", "authorisation"), col("Manifest / invoice no.", "document")], min_rows=0, max_rows=500, totals=True)),
        table_sec("Electricity", table("electricity", "Electricity consumption for the year", [
            colsel("Month", MONTHS, "month"), colnum("Purchased from the grid (kWh)", "grid", total=True), colnum("Cost of grid power (Rs)", "grid_cost", total=True), colnum("Renewable energy - solar (kWh)", "solar", total=True),
            colnum("Cost of solar (Rs)", "solar_cost", total=True), colformula("Total electricity (kWh)", "grid + solar", "total", total=True), colformula("Solar share (%)", "IF(grid + solar == 0, 0, ROUND(solar / (grid + solar) * 100, 1))", "solar_share"),
            col("Remark", "remark")], min_rows=12, max_rows=24, totals=True)),
        table_sec("Electricity - energy users", table("energy_users", "Energy users and their consumption", [
            colsel("Month", MONTHS, "month"), col("Energy user (production, utilities, ETP, lighting, office ...)", "user", width=26), colnum("Consumption (kWh)", "consumption", total=True), colnum("Share (%)", "share"), col("Remark", "remark")], min_rows=0, max_rows=200, totals=True)),
        table_sec("Boiler steam, wood and ash", table("boiler", "Boiler steam, wood and ash for the year", [
            colsel("Month", MONTHS, "month"), colnum("Water used (KL)", "water", total=True), colnum("Wood purchased (kg)", "purchased", total=True), colnum("Wood consumed (kg)", "consumed", total=True), colnum("Cost (Rs)", "cost", total=True),
            colnum("Steam produced (kg)", "steam", total=True), col("Energy user of the steam", "user"), colnum("Ash produced (kg)", "ash", total=True),
            colformula("Steam per kg of wood", "IF(consumed == 0, 0, ROUND(steam / consumed, 2))", "ratio")], min_rows=12, max_rows=24, totals=True)),
        sec("Annual summary and remarks", rich("Remarks, calculations and observations (hazardous and non-hazardous waste, energy intensity, water balance)", key="remarks"),
            upload("Meter reading photographs, bills, weighbridge slips and the workbook", key="data_files"), cols=1),
        signoff(),
    ], form_type="ASSESSMENT", report=True)


# ───────────────────────────── ground water extraction NOC application ─────────────────────────────

def groundwater_noc_application():
    reset_keys()
    place = lambda p, label: [text(f"{label} (i) T.S. / S.F. no.", key=f"{p}_sf"), text(f"{label} (ii) Village name (revenue village if a hamlet)", key=f"{p}_village"),
                              text(f"{label} (iii) Firka name and category", key=f"{p}_firka"), text(f"{label} (iv) Taluk name", key=f"{p}_taluk"), text(f"{label} (v) District name", key=f"{p}_district")]
    return form("Ground Water Extraction NOC Application", "Application for the issue of a No Objection Certificate to extract ground water for industrial / domestic purpose within the premises or by transport "
                "(water intensive / non water intensive): the covering letter, the 17 items of the application, the declaration and the e-challan.", "GWN", [
        sec("Covering letter",
            date("Date of the letter", key="letter_date"), text("Addressed to (Chief Engineer / authority)", key="addressed_to", default="The Chief Engineer, State Ground and Surface Water Resources Data Centre (SG & SWRDC), Taramani, Chennai", w=12),
            text("Subject", key="subject", default="Submission of application for groundwater NOC", w=12), rich("Body of the letter (nature of the establishment, purpose, documents enclosed and the e-challan)", key="letter_body"),
            date("Application received on (office stamp)", key="received_date"), text("Received by (name and designation)", key="received_by"), cols=2),
        sec("Application for issue of No Objection Certificate to extract ground water",
            text("1. Name of the applicant / company", key="applicant", w=12), text("2. Father's / husband's name (in the case of individuals)", key="father", w=12),
            area("3. Complete postal address and contact no.", key="address"), text("4. Industry name and address (nature of the industry)", key="industry", w=12),
            select("5. Applicant's own land / registered lease agreement", ["Own land", "Registered lease agreement"], key="land"),
            note("6. Place of ground water extraction proposed"), *place("extract", "6."),
            note("7. Place of ground water utilisation / transportation proposed"), *place("use", "7."),
            select("8. Ground water requirement for", ["Existing", "New"], key="requirement_for"), text("8(i) Type of industry / firm / company / plant", key="industry_type"),
            select("Water intensive / non water intensive", ["Non water intensive", "Water intensive"], key="intensity"),
            num("9. Required quantity of ground water (litres per day)", key="quantity_lpd"),
            num("10(i) Domestic purpose (LPD)", key="domestic_lpd"), num("10(ii) Gardening (LPD)", key="garden_lpd"), num("10(iii) Others (LPD)", key="other_lpd"),
            formula("Total of purposes (LPD)", "domestic_lpd + garden_lpd + other_lpd", key="purposes_total"),
            note("11. Details of existing well"), select("11(i) Type of well", ["Bore well", "Open well", "Tube well", "Dug-cum-bore well"], key="well_type"),
            num("11(ii) Diameter of well (in inches / m)", key="well_diameter"), num("11(iii) Depth of well (m)", key="well_depth"), text("11(iv) Rock type", key="rock_type"),
            select("12. Well location", ["Non ayacut", "Ayacut", "Residential"], key="well_location"), text("12(i) If ayacut / residential: copy of land conversion proposal applied to the concerned department", key="conversion"),
            select("13. Type of pump used for extraction", ["Submersible", "Centrifugal", "Jet", "Other"], key="pump_type"), num("13(i) Horse power (HP)", key="pump_hp"),
            num("14. Hours of pumping per day", key="pump_hours"), num("15. Total number of abstraction structures", key="structures"),
            num("16(i) Distance from the nearest river (m)", key="river_distance"), num("16(ii) Distance from the nearest channel (m)", key="channel_distance"), num("16(iii) Distance from the nearest tank (m)", key="tank_distance"),
            note("17. Details of fees paid"), text("E challan no.", key="challan_no"), date("Date", key="challan_date"), text("Bank name", key="bank"), text("Bank branch", key="branch"), num("Amount (Rs)", key="fees"), cols=2),
        sec("Declaration",
            rich("Declaration (the details are true; the industry is non water intensive / water intensive and located in an over exploited / critical firka; the purpose of the NOC will be strictly followed)", key="declaration_text",
                 default="<p>I hereby declare that the details and information furnished above are true to the best of my knowledge and belief and I am aware that if any part of the data / information submitted is found to be false or misleading at any stage the application will be rejected outright. I will forego the charges and I will not claim the refund of service charges in the case of incorrectness of facts in the certificates.</p><p>I hereby assure that my industry is a non water intensive / water intensive and located in over exploited / critical firka. I am applying for domestic purpose only. I also assure that the purpose of NOC mentioned in the application will be strictly followed; if any deviation is found at a later date, the NOC is liable to be cancelled.</p>"),
            text("Place", key="place"), date("Date", key="declaration_date"), text("Name and designation of the authorised signatory", key="signatory"), cols=2),
        sec("Enclosures", upload("E-challan (remitter copy), land documents, well details, identity and authorisation documents", key="enclosures"), upload("Signed application and covering letter", key="signed_application"), cols=1),
        signoff(),
    ], form_type="PERMIT")


AA_BATCH3_CATALOGUE = [
    ("Fire Safety Audit Report", fire_safety_audit, "AUDIT", "Fire Safety", ["FIRE", "SAFETY"]),
    ("Safety Audit Report", safety_audit, "AUDIT", "Safety", ["SAFETY", "FIRE"]),
    ("Factory Capability and Capacity Audit", fcca, "AUDIT", "Social Compliance", ["SOCIAL", "SAFETY"]),
    ("Life Cycle Assessment Report", lca_report, "STUDY", "Energy and GHG", ["ENV", "GHG"]),
    ("Integrated CHWTSDF Audit Report", tsdf_audit, "AUDIT", "Environment", ["ENV"]),
    ("Certified Compliance Report (CCR)", ccr, "AUDIT", "Legal", ["ENV", "LEGAL"]),
    ("Resource Data Management (Water, Waste and Energy)", resource_data_management, "STUDY", "Energy and GHG", ["GHG", "WATER", "ENV"]),
    ("Ground Water Extraction NOC Application", groundwater_noc_application, "CUSTOM", "Water", ["WATER", "ENV", "LEGAL"]),
]
