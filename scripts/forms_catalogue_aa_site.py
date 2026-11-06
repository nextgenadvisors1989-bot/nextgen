"""Audit and Assessment forms built from the client's sample files (2026-11-05), part 1: the three site reports.

    H&M_ETP Assessment Document List 1.pdf          -> ETP Assessment Document List
    Environmental-aspects-and-impacts-register.pdf  -> Environmental Aspects and Impacts Register (SR - Form 001)
    RISK ENGINEERING COMPLIANCE REPORT.docx         -> Risk Engineering Compliance Report

Every heading, question and table column of the sample is a field of the form, so the auditor can fill it in on the platform
or download the empty form as a PDF / Word file. Ordinary form-builder structures, editable afterwards in the form builder.
"""
from forms_dsl import (
    COMPLIANCE, area, checklist, col, coldate, colformula, colnum, colsel, date, form, header, note, num, reset_keys, sec, select, signoff,
    table, table_sec, text, yesno,
)

PROVIDED = ["Provided", "Partly provided", "Not provided", "Not applicable"]


# ───────────────────────────── ETP assessment document list (H&M) ─────────────────────────────

ETP_DOCUMENTS = [
    "1. Production facility layout",
    "2. Wet production record - for the last 6 months (in XL file)",
    "3. Production facility drainage plan - including stormwater and wastewater",
    "4. Permit on ETP operation",
    "5. Permit on wastewater discharge",
    "6. Water consumption meter records - for the last 6 months (in XL file)",
    "7. ETP piping layout",
    "8. ETP operation manual / procedure and records (including the items listed below)",
    "8a. List of all key process parameters for all treatment levels with desirable operating range",
    "8b. Log sheet of in-house test results",
    "8c. In-house lab test standard operating procedures (pH, DO, Temp, COD, BOD, TSS, MLSS, SV, SVI, Jar test etc.)",
    "8d. Sampling routines (internal)",
    "8e. Calculation of daily wet and dry sludge generation (weight and volume in kg and m3 respectively)",
    "8f. Sludge handling, storing and disposal method",
    "8g. Preventive and corrective actions of any kind of emergency",
    "8h. Cleaning and maintenance schedule",
    "8i. Actions to deal with mechanical fault and upsets",
    "9. ETP proposal / design document including hydraulic diagram and anticipated flow rate during ETP design stage, considering maximum wastewater generation capability of all wet production machines",
    "10. Latest discharge water test report for ZDHC",
    "11. Water balance diagram",
    "12. Production machinery (dyeing, washing, etc.) loading capacity (in XL file)",
    "13. Preventive maintenance documents for ETP",
    "14. Operator training records for ETP and chemical",
    "15. GPS coordinate of the facility",
]


def etp_document_list():
    reset_keys()
    return form("ETP Assessment Document List", "Documents a facility must provide for an ETP assessment (H&M ETP Assessment Document List): 15 items, with the ETP operation manual's sub-items 8a to 8j.", "ETD", [
        header("ETP document list", extra=[text("Buyer / brand"), text("Name of the ETP")]),
        sec("Facility details asked for in the list",
            text("GPS coordinate of the facility (latitude, longitude)", key="gps", placeholder="e.g. 11.0305, 77.3107"),
            text("Period covered by the wet production record (last 6 months)", key="wet_period"),
            text("Period covered by the water consumption meter records (last 6 months)", key="meter_period"),
            date("Date of the latest ZDHC discharge water test report", key="zdhc_date")),
        checklist("Documents provided", ETP_DOCUMENTS, options=PROVIDED, description="Items 2, 6 and 12 are to be supplied as Excel files."),
        table_sec("Documents received", table("received", "Document register", [
            col("Item no.", "item", width=8), col("File name / reference", "file", width=30), coldate("Document date", "date"), colsel("Format", ["PDF", "Excel", "Word", "Photo", "Hard copy"], "format"), col("Remarks", "remarks", width=30)], min_rows=0)),
        signoff(),
    ], form_type="CHECKLIST", report=True)


# ───────────────────────────── environmental aspects and impacts register ─────────────────────────────

LIKELIHOOD = [
    "1 - Very unlikely: a freak combination of factors would be required to create an incident",
    "2 - Unlikely: a rare combination of factors would be required to create an incident",
    "3 - Possible: could happen when additional factors are present, but otherwise unlikely to occur",
    "4 - Likely: not certain to happen, but an additional factor may result in an incident",
    "5 - Very likely: almost inevitable that an incident would result",
]
SEVERITY = [
    "1 - Negligible: negligible harm to the environment",
    "2 - Slight: minor environmental incident",
    "3 - Moderate: injury leading to a moderate environmental incident",
    "4 - High: major incident (spill / chemical release / fish kill)",
    "5 - Very high: catastrophic incident impacting more than the company",
]
MATRIX = [  # likelihood 1..5 (rows) x severity 1..5 (columns)
    ["LOW", "LOW", "LOW", "LOW", "MEDIUM"],
    ["LOW", "LOW", "LOW", "MEDIUM", "MEDIUM"],
    ["LOW", "LOW", "MEDIUM", "MEDIUM", "HIGH"],
    ["LOW", "MEDIUM", "MEDIUM", "HIGH", "HIGH"],
    ["MEDIUM", "MEDIUM", "HIGH", "HIGH", "HIGH"],
]


def aspects_register():
    reset_keys()
    methodology = [note("Risk rating (R) = Likelihood (L) x Severity (S).")]
    methodology.append(note("Likelihood of occurrence (L): " + "  |  ".join(LIKELIHOOD)))
    methodology.append(note("Hazard severity (S): " + "  |  ".join(SEVERITY)))
    methodology.append(note("Environmental risk rating matrix (rows: likelihood 1 to 5, columns: severity 1 to 5): "
                            + "  |  ".join(f"L{i + 1}: " + " / ".join(row) for i, row in enumerate(MATRIX))))
    methodology.append(note("Significance test: a score of 6 or less is not significant within the EMS. A score above 6 up to 12 is significant: monitoring and improvement required. "
                            "A score above 12 is very significant: further urgent controls required."))
    return form("Environmental Aspects and Impacts Register", "Activities, aspects, impacts, risk rating (likelihood x severity), significance and controls (Document SR - Form 001, with its assessment methodology).", "EAI", [
        header("SR - Form 001", extra=[text("Document no.", placeholder="SR - Form 001"), date("Document date"), date("Review date")]),
        table_sec("Aspects and impacts", table("aspects", "Environmental aspects and impacts register", [
            col("Activities", "activity", width=12), col("Aspect", "aspect", width=12), col("Consumption (e.g. electricity, water, diesel / oil)", "consumption", width=10),
            col("Emission (e.g. CO2, noise, dust, fumes, waste water)", "emission", width=10), col("Impact", "impact", width=14), colsel("Type", ["Normal", "Abnormal", "Emergency"], "condition"),
            colnum("Likelihood (L, 1-5)", "likelihood"), colnum("Severity (S, 1-5)", "severity"), colformula("Risk rating (L x S)", "likelihood * severity", "rating"),
            colsel("Significance", ["Not significant (6 or less)", "Significant (7 to 12)", "Very significant (above 12)"], "significance"),
            col("Controls", "controls", width=14), col("Objectives", "objectives", width=12)], min_rows=1)),
        sec("Assessment methodology (environmental risk rating)", *methodology, cols=1),
        signoff(),
    ], report=True)


# ───────────────────────────── risk engineering compliance report ─────────────────────────────

RISK_COMPLIANCE = ["Compliant", "Non-compliant", "Partly compliant", "Not applicable"]


def _topic(number, title, findings_label="Findings"):
    """One row of the report's CONTENT / FINDINGS / NON COMPLIANCE / COMPLIANCE table."""
    return [area(f"{number} {title} - {findings_label.lower()}", key=f"t{number.replace('.', '_')}_findings", w=8),
            select(f"{number} {title} - compliance", RISK_COMPLIANCE, key=f"t{number.replace('.', '_')}_compliance", w=4)]


def risk_engineering():
    reset_keys()
    sections = [
        header("Risk engineering report", extra=[
            text("Site latitude and longitude", key="latlong", placeholder="e.g. 11°01'50.1\"N 77°18'38.6\"E"),
            text("Survey carried out on behalf of (insurer / client)"), text("Survey number (first, second ...)"),
            text("Policy / property and perils covered under the survey")]),
        sec("1. Introduction and overview", *_topic("2.1", "Scope of survey"), cols=2),
        sec("2.2 Client information",
            text("Year plant production started", key="started"), text("Distance from sister plant (km)", key="sister_distance"),
            area("Nature of the factory (activities carried out)", key="nature"), area("Major raw materials", key="raw_materials", w=6),
            num("Total area of the unit (acres)", key="area_acres"), num("Built-up area (sq m)", key="built_up"),
            text("Operational schedule (shifts)", key="schedule"), text("Entry / exit gates (number and name)", key="gates"),
            text("Compound wall / fencing (type and height)", key="compound_wall"), text("Plant elevation relative to the road level", key="elevation"),
            *_topic("2.2", "Client information")),
        sec("2.3 Overall summary",
            area("Positive features of the plant", key="positive", w=12, help="e.g. non-combustible construction, CCTV, hydrant system, documented emergency response plan"),
            area("Areas of concern at the site", key="concerns", w=12, help="e.g. no automatic detection, work permit not followed, no CO2 flooding in electrical panels"),
            *_topic("2.3", "Overall summary")),
        sec("2.4 Conduct of operations",
            select("Operating pattern", ["Continuous, seven days a week", "Six days a week", "Five days a week", "Seasonal"], key="pattern"),
            text("Shift 1 timing", key="shift1"), text("General shift timing", key="shift_general"), text("Other shift timings", key="shift_other"),
            num("Total work force", key="workforce"), num("Permanent employees", key="permanent"), num("Contract labour", key="contract"),
            select("Smoking inside the premises", ["Prohibited", "Allowed in designated areas", "Not controlled"], key="smoking"),
            *_topic("2.4", "Conduct of operations")),
        sec("2.5 Claims history", text("Claims in the last years", key="claims", placeholder="e.g. Nil claim"), *_topic("2.5", "Claims history")),
        sec("2. Plant layout and construction",
            area("Blocks in the unit (admin, utility, FG warehouse, RM storage, fire pump house, canteen ...)", key="blocks", w=12),
            select("Plinth of buildings against the external road level", ["Above the road level", "At the road level", "Below the road level"], key="plinth"),
            text("Boundary (brick wall / metal fencing, height)", key="boundary"), select("Drainage for rain and storm water", ["Sufficient", "Partly sufficient", "Not sufficient"], key="drainage"),
            *_topic("3.1", "Layout")),
        table_sec("3.2 Construction of the blocks", table("construction", "Construction of the blocks", [
            col("Block (process, FG storage, DG room, RM block, utility, boiler house ...)", "block", width=24), col("Walls / structure", "walls", width=22), col("Roof", "roof", width=22),
            colsel("Combustibility", ["Non-combustible", "Partly combustible", "Combustible"], "combustibility")], min_rows=1)),
        sec("3.2 Construction - findings", *_topic("3.2", "Construction")),
        sec("3. Occupancy - 4.1 Process description",
            text("Products manufactured", key="products"), num("Production capacity (pieces per day)", key="capacity"),
            text("Major raw material and its source", key="rm_source"), text("Export share of finished goods and key customers", key="customers"),
            area("Process steps (checking, cutting, stitching, ironing, testing, labelling, packing, shipping ...)", key="process_steps", w=12),
            area("Other steps (embroidery, printing, embellishment) and quality control checks", key="other_steps", w=12),
            *_topic("4.1", "Process description")),
        sec("4.2 Process machineries", area("Machinery (make and origin: stitching machines, cutting machines ...)", key="machinery", w=12), *_topic("4.2", "Process machineries")),
        sec("4.3 Utilities",
            text("Power supply (grid voltage and substation)", key="grid"), num("Sanctioned load (kVA)", key="sanctioned"), num("Present demand (kVA)", key="demand"),
            text("Diesel storage (tanks and location)", key="diesel_storage"), num("Air compressors (number)", key="compressors"),
            text("Boiler (type, capacity, fuel, make)", key="boiler"), text("Boiler feed water capacity and fuel storage", key="boiler_storage"),
            *_topic("4.3", "Utilities")),
        table_sec("Diesel generator sets", table("dg", "Power back-up (DG sets)", [col("DG set (make)", "make"), colnum("Capacity (kVA)", "capacity"), col("Location / enclosure", "location", width=30)], min_rows=0)),
        sec("4. Fire protection systems - 5.1 Detection systems",
            text("Areas with smoke detectors", key="smoke_areas"), text("Areas without detectors (e.g. process block)", key="no_detectors"),
            select("Manual call points and fire alarm", ["Provided", "Partly provided", "Not provided"], key="mcp"), text("Fire alarm panel location and repeater panel", key="panel"),
            *_topic("5.1", "Detection systems")),
        sec("5.2 Protection systems",
            num("Portable fire extinguishers (number)", key="extinguishers"), num("Modular sprinklers (number)", key="sprinklers"),
            select("Fire hydrant system", ["Provided", "Partly provided", "Not provided"], key="hydrant"), *_topic("5.2", "Protection systems")),
        sec("5.3 Fire pump and water details",
            num("Jockey pump flow (m3/hr)", key="jockey"), num("Main pump flow (m3/hr)", key="main_pump"), num("Fire water storage tank (kilolitres)", key="tank_kl"),
            text("Pump panel mode observed", key="pump_mode", placeholder="Auto / Manual / OFF"), num("Fire water tank level observed (%)", key="tank_level"),
            *_topic("5.3", "Fire pump and water details")),
        sec("5.4 Fire proofing", *_topic("5.4", "Fire proofing")),
        sec("5.5 Fire brigade and mutual aid",
            text("Nearest fire station", key="station"), num("Distance to the plant (km)", key="station_km"), text("Expected time to reach (minutes)", key="station_time"),
            *_topic("5.5", "Fire brigade and mutual aid")),
        sec("5. Risk management", *_topic("6.1", "Housekeeping"), *_topic("6.2", "Electrical installations"), *_topic("6.4", "Maintenance"),
            num("Maintenance team (members)", key="maintenance_team"), select("Critical spares list established", ["Yes", "No"], key="critical_spares"),
            select("Maintenance and procurement system", ["Computerised (CMMS)", "Excel based", "Paper based"], key="maintenance_system"),
            *_topic("6.5", "Inspection"), *_topic("6.6", "Training"),
            text("Mock drill and safety training frequency", key="drill_freq", placeholder="e.g. every six months, by an external fire agency")),
        sec("6.7 Work permit systems",
            select("Work permit system followed", ["Yes", "No", "Partly"], key="permit_followed"), select("LOTO system followed", ["Yes", "No", "Partly"], key="loto_followed"),
            *_topic("6.7", "Work permit systems")),
        sec("6.8 Safety organisation",
            select("Dedicated safety team", ["Yes", "No - managed by HR / other department"], key="safety_team"), num("Safety committee (members)", key="committee"),
            *_topic("6.8", "Safety organisation")),
        sec("6.9 Emergency planning",
            select("Documented emergency response plan", ["Yes", "No"], key="erp"), num("Emergency response team (members)", key="ert"), *_topic("6.9", "Emergency planning")),
        sec("6.10 Security",
            num("Entry / exit gates (number)", key="security_gates"), select("CCTV cameras installed and monitored", ["Yes", "No"], key="cctv"), *_topic("6.10", "Security")),
        sec("6.11 Business continuity planning", select("Business continuity plan available", ["Yes", "No", "Details not available"], key="bcp"), *_topic("6.11", "Business continuity planning")),
        sec("6. Business interruption",
            select("Dependency on other plants for intermediate operations", ["Low", "Medium", "High"], key="dependency"), *_topic("7.1", "Dependencies"),
            select("Interdependencies within the plant", ["Low", "Medium", "High"], key="interdependency"), *_topic("7.2", "Interdependencies"),
            select("Contingent business interruption exposure", ["No such exposure", "Low", "Medium", "High"], key="contingent"), *_topic("7.3", "Contingent business interruption")),
        sec("7. Exposures - 8.2 Natural hazard mitigations",
            select("Earthquake exposure", ["Low", "Moderate", "High"], key="earthquake"), select("Hailstorm exposure", ["Low", "Moderate", "High"], key="hailstorm"),
            select("Windstorm exposure", ["Low", "Moderate", "High"], key="windstorm"), select("Flood / water accumulation exposure", ["Low", "Moderate", "High"], key="flood"),
            text("Plinth level of structures and machinery above the surrounding level (feet)", key="plinth_height"), select("Drain channels clean on the day of inspection", ["Yes", "No"], key="drains_clean"),
            *_topic("8.2", "Natural hazard mitigations")),
        sec("8.3 Third party exposure",
            select("Surrounding exposure", ["Low", "Moderate", "High"], key="third_party"), text("Neighbouring industries / residential blocks", key="neighbours"),
            *_topic("8.3", "Third party exposure")),
        sec("9. Loss control measures",
            note("The measures for risk improvement are prioritised as Critical, A and B. Critical: essential measures to reduce an increased probability of a fire or explosion, or to address major deficiencies in fire / explosion protection systems or plant safety standards. "
                 "A: measures not designated Critical but needed to maintain safe conditions and a basic fire / safety standard. B: measures to enhance existing arrangements and achieve an optimum safety level, considered current industry best standards."),
            note("The proposed measures do not supersede any obligation or requirement imposed by any statute or regulation."),
            cols=1),
        table_sec("Previous recommendations", table("previous", "Previous recommendations (open and closed)", [
            col("S.No. (year-number)", "serial", width=14), col("Description", "description", width=36), colsel("Status", ["Pending", "Implemented", "Partly implemented"], "status"),
            colsel("Compliance", RISK_COMPLIANCE, "compliance")], min_rows=1)),
        table_sec("New recommendations", table("new", "New recommendations", [
            col("S.No. (year-number)", "serial", width=14), col("Description", "description", width=36), colsel("Priority", ["Critical", "A", "B"], "priority"),
            colsel("Compliance", RISK_COMPLIANCE, "compliance"), col("Responsible", "owner"), coldate("Target date", "target")], min_rows=1)),
        signoff(),
    ]
    return form("Risk Engineering Compliance Report", "Risk engineering survey of a site: introduction, layout and construction, occupancy, fire protection, risk management, business interruption, exposures and loss control recommendations, each with findings and compliance.", "REC", sections, form_type="AUDIT", report=True)


AA_SITE_CATALOGUE = [
    ("ETP Assessment Document List", etp_document_list, "ASSESSMENT", "Environment", ["ENV"]),
    ("Environmental Aspects and Impacts Register", aspects_register, "RISK", "Environment", ["ENV"]),
    ("Risk Engineering Compliance Report", risk_engineering, "RISK", "Safety", ["SAFETY", "FIRE", "ENV"]),
]
