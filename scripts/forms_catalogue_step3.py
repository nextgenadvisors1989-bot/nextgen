"""Audit types, assessments, risk assessments, studies and work permits that the client's lists name but the platform did not yet have.

Same rules as the rest of the catalogue: ordinary form-builder structures, editable afterwards in the form builder."""
from forms_dsl import (
    COMPLIANCE, YES_NO_NA, area, checklist, col, coldate, colformula, colnum, colsel, date, form, formula, header, note, num, reset_keys, sec, select,
    signoff, table, table_sec, text,
)

STATUS = ["Open", "In progress", "Closed", "Verified"]
SATISFACTORY = ["Satisfactory", "Needs improvement", "Unsatisfactory", "Not applicable"]
LEVELS = ["Low", "Medium", "High", "Extreme"]


def findings_table(key="findings"):
    return table_sec("Findings and corrective actions", table(key, "Findings and corrective actions", [
        col("Finding", "finding", width=30), colsel("Priority", ["Critical", "High", "Medium", "Low"], "priority"), col("Corrective action", "action", width=26),
        col("Responsible", "owner"), coldate("Target date", "target"), colsel("Status", STATUS, "status")], min_rows=0))


def results_table(key, name, parameters):
    return table_sec(name, table(key, name, [
        colsel("Parameter", parameters, "parameter"), col("Unit", "unit"), colnum("Standard limit", "limit"), colnum("Result", "result"), colsel("Within limit", ["Yes", "No"], "within")], min_rows=0))


# ───────────────────────────── ENVIRONMENT ─────────────────────────────

WATER_PARAMS = ["pH", "BOD", "COD", "TSS", "TDS", "Oil and grease", "Ammonia nitrogen", "Total nitrogen", "Total phosphorus", "Fecal coliform", "Residual chlorine", "Other"]


def stp_assessment():
    reset_keys()
    return form("STP Functionality Assessment", "Sewage treatment plant: capacity, treatment scheme, operation, inlet and outlet quality, reuse and sludge handling.", "STP", [
        header("STP assessment"),
        sec("STP information", num("STP capacity (KLD)"), num("Average inflow (KLD)"), text("Treatment technology (e.g. MBBR, SBR, extended aeration)"), num("Operating hours / day"),
            yesno_field("Treated water reused"), num("Reuse for flushing, gardening or cooling (KLD)"), text("Operator name and qualification"),
            area("Treatment scheme (bar screen, equalisation, aeration, clarifier, filtration, disinfection)")),
        checklist("Operation and maintenance", ["Flow meter installed on inlet and outlet", "Aeration working (blowers / diffusers)", "Sludge handling and disposal arrangement", "Chlorination / disinfection in use",
                                                 "Operator trained and logbook maintained", "Odour and housekeeping acceptable", "Standby equipment available", "Consent to operate conditions met"], options=SATISFACTORY),
        results_table("inlet_outlet", "Inlet and treated water quality", WATER_PARAMS),
        sec("Sludge and reuse", num("Sludge generated (kg / month)"), text("Sludge disposal route"), num("Treated water reused (%)")),
        findings_table(), signoff(),
    ], form_type="ASSESSMENT")


def cetp_assessment():
    reset_keys()
    return form("CETP Functionality Assessment", "Common effluent treatment plant: member units, design and operation, inlet and treated quality, ZLD, sludge and records.", "CET", [
        header("CETP assessment", extra=[text("CETP operating body / society")]),
        sec("CETP information", num("Designed capacity (KLD)"), num("Average inflow (KLD)"), num("Number of member units"), text("Treatment scheme (primary, secondary, tertiary, RO, MEE)"),
            yesno_field("Zero Liquid Discharge (ZLD)"), num("Treated water recovered / reused (%)"), text("Consent to operate number"), date("Consent valid until")),
        table_sec("Member units", table("members", "Member units and quantity", [col("Unit name", "unit", width=30), col("Process", "process"), colnum("Effluent supplied (KLD)", "kld", total=True), colnum("Inlet pH", "ph"),
                                                                              colnum("Inlet COD (mg/l)", "cod"), colsel("Meets inlet norms", ["Yes", "No"], "meets")], min_rows=1, totals=True)),
        checklist("Operation and compliance", ["Inlet monitoring and rejection of non-conforming effluent", "Treatment units working as designed", "Online monitoring connected (OCEMS) where required",
                                                "MEE / RO operation and reject management", "Salt and sludge disposed to an authorised TSDF", "Operator competence and logbooks", "Third party monitoring reports",
                                                "Consent conditions and returns up to date"], options=SATISFACTORY),
        results_table("quality", "Inlet and treated effluent quality", WATER_PARAMS + ["Chloride", "Sulphate"]),
        findings_table(), signoff(),
    ], form_type="ASSESSMENT")


def env_compliance_audit():
    reset_keys()
    return form("Environmental Compliance Audit", "Audit of consents, authorisations, effluent, emissions, waste, noise, reporting and records against environmental law.", "ECA", [
        header("Environmental compliance audit"),
        checklist("Consents and authorisations", ["Consent to Establish (CTE)", "Consent to Operate (CTO) - water and air", "Authorisation under Hazardous Waste Rules", "Registration under E-Waste / Plastic Waste / Battery rules, if applicable",
                                                  "Environmental clearance, if applicable", "Consent conditions complied with"], options=COMPLIANCE),
        checklist("Water and effluent", ["ETP / STP operating and logbook maintained", "Treated effluent within consent limits", "Flow meters installed and readings recorded", "Water consumption within consented quantity", "Zero liquid discharge maintained, if required"], options=COMPLIANCE),
        checklist("Air emissions and noise", ["Stack height and sampling facility as required", "Stack emission monitoring report within limits", "Air pollution control devices working", "Ambient air and noise monitoring done", "DG set acoustic enclosure and stack"], options=COMPLIANCE),
        checklist("Waste management", ["Hazardous waste storage area suitable and labelled", "Waste handed over to authorised recyclers / TSDF with manifests", "Solid waste segregation and disposal", "Plastic and packaging waste (EPR) obligations", "Used oil and batteries managed"], options=COMPLIANCE),
        checklist("Reporting and records", ["Form V - environmental statement filed", "Form IV and annual hazardous waste return filed", "Monthly / quarterly returns to the board", "Environmental policy and aspects register", "Emergency response for spills and leaks"], options=COMPLIANCE),
        findings_table(), signoff(),
    ])


def tsdf_audit():
    reset_keys()
    return form("TSDF Audit", "Audit of a treatment, storage and disposal facility for hazardous waste against authorisation and the Hazardous Waste Rules.", "TSD", [
        header("TSDF audit", extra=[text("Authorisation number"), date("Authorisation valid until")]),
        sec("Facility", num("Approved capacity (tonnes / year)"), num("Waste received last year (tonnes)"), text("Waste categories authorised"), text("Treatment / disposal method (landfill, incineration, co-processing)")),
        checklist("Receipt and storage", ["Waste received with manifest (Form 10) and verified", "Waste characterised and recorded at receipt", "Storage area covered, paved and bunded", "Incompatible wastes segregated", "Containers labelled"], options=COMPLIANCE),
        checklist("Treatment and disposal", ["Landfill cell or incinerator in line with design", "Leachate collection and treatment", "Ambient and groundwater monitoring around the site", "Stack emission monitoring, if incinerating", "Closure and post-closure plan"], options=COMPLIANCE),
        checklist("Safety and records", ["Fire and emergency arrangements", "PPE and trained staff", "Weighbridge and records", "Annual return filed", "Insurance and financial assurance"], options=COMPLIANCE),
        table_sec("Waste received", table("received", "Waste received", [col("Waste generator", "generator", width=26), col("Waste category", "category"), colnum("Quantity (tonnes)", "qty", total=True), col("Manifest no.", "manifest"), coldate("Date", "date"),
                                                                       col("Disposal method", "method")], min_rows=0, totals=True)),
        findings_table(), signoff(),
    ])


def environmental_statement():
    reset_keys()
    return form("Environmental Statement (Form V)", "Annual environmental statement: water consumption, raw material, pollution discharged, hazardous and solid waste, and conservation measures.", "ES5", [
        header("Environmental statement - Form V", extra=[text("Financial year"), text("Industry category")]),
        table_sec("Water consumption (m3 / day)", table("water", "Water consumption", [colsel("Use", ["Process", "Cooling", "Domestic", "Gardening", "Other"], "use"), colnum("During the year", "current"), colnum("Previous year", "previous")], min_rows=1)),
        table_sec("Raw material consumption", table("raw", "Raw materials", [col("Raw material", "material", width=30), col("Unit", "unit"), colnum("Per unit of output - current year", "current"), colnum("Per unit of output - previous year", "previous")], min_rows=1)),
        table_sec("Pollution discharged", table("pollution", "Pollutants discharged", [col("Pollutant", "pollutant"), colnum("Quantity discharged", "qty"), colnum("Concentration", "conc"), colnum("Prescribed standard", "std"),
                                                                                       col("Variation from standard and reasons", "variation", width=26)], min_rows=1)),
        table_sec("Hazardous and solid waste", table("waste", "Waste generated", [colsel("Waste", ["Hazardous waste", "Solid waste - recyclable", "Solid waste - non-recyclable", "Other"], "kind"), col("Description", "description", width=30),
                                                                                  colnum("Current year (tonnes)", "current"), colnum("Previous year (tonnes)", "previous"), col("Disposal", "disposal")], min_rows=1)),
        sec("Conservation and prevention", area("Measures taken to conserve natural resources and reduce pollution"), area("Additional investment proposed for environmental protection"), num("Investment made during the year (INR)")),
        signoff(),
    ], form_type="STANDARD")


# ───────────────────────────── ENERGY / GHG ─────────────────────────────

def energy_audit():
    reset_keys()
    return form("Energy Audit", "Energy sources and cost, specific energy consumption, equipment review and savings opportunities with payback.", "ENA", [
        header("Energy audit", extra=[num("Annual production (units)", key="production")]),
        table_sec("Energy consumption", table("energy", "Energy sources", [
            colsel("Source", ["Grid electricity", "Solar / renewable", "Diesel", "Coal", "Biomass", "Furnace oil", "LPG", "Natural gas", "Other"], "source"), col("Unit", "unit"),
            colnum("Annual quantity", "qty"), colnum("Energy per unit (GJ)", "gj_per_unit"), colformula("Energy (GJ)", "qty * gj_per_unit", "gj", total=True), colnum("Annual cost (INR)", "cost", total=True)], min_rows=1, totals=True)),
        sec("Specific energy consumption", formula("Specific energy consumption (GJ per unit)", "IF(production == 0, 0, energy.gj / production)", key="sec"), formula("Energy cost per unit (INR)", "IF(production == 0, 0, energy.cost / production)", key="cost_unit")),
        checklist("Equipment review", ["Motors and drives (efficiency, VFDs)", "Compressed air system leaks", "Boiler / thermic fluid heater efficiency", "Lighting (LED share)", "Power factor correction", "Insulation of steam lines", "Metering and sub-metering", "Renewable energy use"], options=SATISFACTORY),
        table_sec("Savings opportunities", table("savings", "Savings opportunities", [col("Measure", "measure", width=30), colnum("Annual saving (INR)", "saving", total=True), colnum("Investment (INR)", "investment", total=True),
                                                                                    colformula("Payback (years)", "IF(saving == 0, 0, investment / saving)", "payback"), col("Responsible", "owner"), coldate("Target date", "target")], min_rows=0, totals=True)),
        signoff(),
    ], form_type="AUDIT")


def ghg_verification():
    reset_keys()
    return form("GHG Inventory Verification", "Verification of a reported greenhouse gas inventory: scope-wise recheck of activity data and emission factors, variance and findings.", "GHV", [
        header("GHG verification", extra=[text("Reporting period"), text("Standard (e.g. GHG Protocol, ISO 14064)")]),
        table_sec("Scope-wise recheck", table("recheck", "Reported vs verified emissions", [
            colsel("Scope", ["Scope 1 - stationary combustion", "Scope 1 - mobile combustion", "Scope 1 - fugitive", "Scope 2 - purchased electricity", "Scope 3 - purchased goods", "Scope 3 - transport", "Scope 3 - waste", "Scope 3 - other"], "scope"),
            colnum("Reported (tCO2e)", "reported", total=True), colnum("Verified (tCO2e)", "verified", total=True), colformula("Variance (tCO2e)", "verified - reported", "variance", total=True),
            colformula("Variance (%)", "IF(reported == 0, 0, (verified - reported) / reported * 100)", "pct"), col("Basis of verification", "basis", width=26)], min_rows=1, totals=True)),
        checklist("Verification checks", ["Organisational and operational boundary defined", "Activity data supported by invoices / meter records", "Emission factors from a recognised source and current", "Calculations rechecked",
                                           "Base year and recalculation policy", "Data management and review controls", "Completeness - no material source omitted"], options=COMPLIANCE),
        findings_table(), signoff(),
    ], form_type="AUDIT")


# ───────────────────────────── FOOD ─────────────────────────────

def food_safety_audit():
    reset_keys()
    return form("Food Safety Audit", "FSSAI / GMP / HACCP based food safety audit: licence, premises, hygiene, process control, pest control, traceability and records.", "FSA", [
        header("Food safety audit", extra=[text("FSSAI licence number"), date("Licence valid until")]),
        checklist("Premises and facilities", ["Layout prevents cross-contamination", "Floors, walls and ceilings in good condition", "Adequate lighting and ventilation", "Water supply potable, tested periodically", "Drainage and waste disposal", "Equipment food grade and cleanable"], options=SATISFACTORY),
        checklist("Personal hygiene", ["Medical fitness certificates", "Clean uniforms, caps and gloves", "Handwash facilities and practice", "Visitors and contractors controlled", "Food handler training records"], options=SATISFACTORY),
        checklist("Process control (HACCP)", ["Hazard analysis and CCPs identified", "Critical limits and monitoring records", "Corrective action for deviations", "Calibration of thermometers and instruments", "Allergen control", "Cleaning and sanitation schedule"], options=SATISFACTORY),
        checklist("Pest control, storage and traceability", ["Licensed pest control and records", "Raw material and finished goods storage (FIFO, temperature)", "Supplier approval and incoming inspection", "Traceability and recall procedure", "Labelling as per FSSAI"], options=SATISFACTORY),
        findings_table(), signoff(),
    ])


def haccp_study():
    reset_keys()
    return form("HACCP Study", "Hazard analysis and critical control points: process steps, hazards, CCP decision, critical limits, monitoring, corrective action and verification.", "HAC", [
        header("HACCP study", extra=[text("Product / process studied"), text("HACCP team")]),
        table_sec("Hazard analysis and CCPs", table("haccp", "Process steps and hazards", [
            col("Process step", "step"), colsel("Hazard type", ["Biological", "Chemical", "Physical", "Allergen"], "type"), col("Hazard", "hazard"), colsel("Significant", ["Yes", "No"], "significant"), colsel("Critical control point", ["Yes", "No"], "ccp"),
            col("Critical limit", "limit"), col("Monitoring", "monitoring"), col("Corrective action", "action"), col("Verification", "verification")], min_rows=1)),
        signoff(),
    ], form_type="STANDARD")


# ───────────────────────────── RISK ASSESSMENTS ─────────────────────────────

def risk_assessment(name, prefix, description, hazards):
    def build():
        reset_keys()
        return form(name, description, prefix, [
            header(name.lower()),
            table_sec("Risk register", table("risks", "Risk assessment", [
                colsel("Activity / aspect", hazards, "activity", width=16), col("Hazard / risk", "hazard"), col("Possible consequences", "consequence"), colnum("Likelihood (1-5)", "likelihood"), colnum("Consequence (1-5)", "severity"),
                colformula("Risk score", "likelihood * severity", "score"), colsel("Risk level", ["Low (1-4)", "Medium (5-9)", "High (10-16)", "Extreme (17-25)"], "level"),
                col("Existing controls", "controls"), col("Further action required", "action"), col("Responsible", "owner"), coldate("Review date", "review")], min_rows=1)),
            signoff("Risk score = likelihood x consequence. 1-4 low (monitor), 5-9 medium (reduce where practicable), 10-16 high (act immediately), 17-25 extreme (stop the activity)."),
        ], form_type="ASSESSMENT")
    return build


# ───────────────────────────── WORK PERMITS ─────────────────────────────

def work_permit(name, prefix, description, checks, extra=None):
    def build():
        reset_keys()
        return form(name, description, prefix, [
            sec("Permit details", text("Work location", req=True), area("Description of work", w=12, req=True), text("Contractor / department"), text("Permit requested by"), date("Valid from", req=True), text("From time"), date("Valid to", req=True), text("To time"),
                *(extra or [])),
            checklist("Precautions before the work starts", checks, options=YES_NO_NA),
            sec("Workers and equipment", text("Names of workers / supervisor"), text("Tools and equipment used"), text("Emergency contact number")),
            sec("Permit closure", text("Permit issued by (name and designation)"), text("Permit accepted by (name and designation)"), select("Work status", ["Completed", "Suspended", "Cancelled"]), date("Closed on"),
                area("Remarks on closure (area left safe, tools removed)", w=12), cols=2),
        ], form_type="CHECKLIST")
    return build


PERMITS = [
    ("Work at Height Permit", "WAH", "Permit for work above 1.8 metres: scaffolds, ladders, platforms and roof work.",
     ["Work platform / scaffold inspected and tagged", "Full body harness with double lanyard worn and anchored", "Anchor point rated and checked", "Edges and openings guarded", "Ladder secured at the correct angle",
      "Area below barricaded", "Tools secured against falling", "Weather suitable (no high wind, rain)", "Rescue arrangement available"], ["SAFETY", "FIRE"], [num("Working height (m)")]),
    ("Lifting Operation Permit", "LOP", "Permit for crane and hoist lifting: load, sling, signal and area controls.",
     ["Load weight known and within crane capacity", "Crane inspected and load test certificate valid", "Slings, shackles and hooks inspected", "Lifting area barricaded", "Trained operator and rigger", "Signal person assigned", "Ground condition and outriggers checked",
      "Weather and wind suitable"], ["SAFETY"], [num("Load to be lifted (kg)"), num("Crane rated capacity (ton)")]),
    ("Cold Work Permit", "CWP", "Permit for non-hot maintenance work on equipment that is in service or may hold residual energy.",
     ["Equipment isolated and depressurised", "Residual material drained and area cleaned", "Hazardous materials identified", "Correct tools used", "PPE worn", "Housekeeping maintained", "Supervisor present"], ["SAFETY"], None),
    ("Confined Space Entry Permit", "CSE", "Permit for entry into tanks, pits, vessels and other confined spaces.",
     ["Space isolated from all lines and energy sources", "Space cleaned, vented and ventilated", "Oxygen 19.5 - 23.5 percent confirmed by gas test", "Flammable and toxic gas readings within limits", "Standby person stationed outside", "Rescue equipment and trained team available",
      "Communication established", "Lighting is low voltage / flameproof", "Entry and exit logged"], ["SAFETY", "FIRE"], [text("Space description"), text("Gas test result (O2 / LEL / H2S / CO)")]),
    ("Electrical Isolation (LOTO) Permit", "LOT", "Permit for lock-out tag-out of electrical and mechanical energy before maintenance.",
     ["Equipment to be isolated identified", "All energy sources isolated (electrical, pneumatic, hydraulic, stored)", "Personal lock and tag fitted", "Zero energy verified by test", "Earthing applied where required", "Affected persons informed",
      "Authorised electrician in charge", "Restoration plan agreed"], ["ELEC", "SAFETY"], [text("Equipment / panel isolated"), text("Lock and tag number")]),
    ("Excavation Permit", "EXC", "Permit for digging, trenching and breaking ground.",
     ["Underground services (cable, pipe) checked on drawings", "Cable / pipe locator used", "Sides sloped, shored or benched", "Barricades and warning signs placed", "Safe access / egress ladder", "Spoil kept away from the edge", "Dewatering arrangement", "Atmosphere tested if deep"],
     ["SAFETY"], [num("Depth (m)")]),
]


def yesno_field(label):
    return select(label, ["Yes", "No"])


RISKS = [
    ("Water Risk Assessment", "WRA", "Risks to water supply, quality, discharge and compliance.", ["Water sourcing", "Groundwater extraction", "Water storage", "Treatment and reuse", "Effluent discharge", "Rainwater / flooding", "Supply interruption", "Regulatory limits"], ["WATER", "ENV"]),
    ("Waste Risk Assessment", "WSR", "Risks in waste generation, storage, handling, transport and disposal.", ["Hazardous waste storage", "Waste transport", "Disposal vendor", "Solid waste segregation", "Plastic and packaging waste", "E-waste", "Sludge handling", "Spills and leaks"], ["ENV"]),
    ("Energy Risk Assessment", "ERA", "Risks to energy supply, cost, efficiency and emissions.", ["Grid supply", "Fuel storage and handling", "Boiler / thermic fluid heater", "Electrical installation", "Compressed air", "Diesel generator", "Price volatility", "Emissions limits"], ["GHG"]),
]

STEP3_CATALOGUE = [
    ("STP Functionality Assessment", stp_assessment, "ASSESSMENT", "Environment", ["ENV", "WATER"]),
    ("CETP Functionality Assessment", cetp_assessment, "ASSESSMENT", "Environment", ["ENV", "WATER"]),
    ("Environmental Compliance Audit", env_compliance_audit, "AUDIT", "Environment", ["ENV"]),
    ("TSDF Audit", tsdf_audit, "AUDIT", "Environment", ["ENV"]),
    ("Environmental Statement (Form V)", environmental_statement, "STUDY", "Environment", ["ENV", "LEGAL"]),
    ("Energy Audit", energy_audit, "AUDIT", "Energy and GHG", ["GHG"]),
    ("GHG Inventory Verification", ghg_verification, "AUDIT", "Energy and GHG", ["GHG"]),
    ("Food Safety Audit", food_safety_audit, "AUDIT", "Food Safety", ["FOOD"]),
    ("HACCP Study", haccp_study, "STUDY", "Food Safety", ["FOOD"]),
    *[(name, risk_assessment(name, prefix, description, hazards), "RISK", "Environment", codes) for name, prefix, description, hazards, codes in RISKS],
    *[(name, work_permit(name, prefix, description, checks, extra), "WORK_PERMIT", "Permits", codes) for name, prefix, description, checks, codes, extra in PERMITS],
]
