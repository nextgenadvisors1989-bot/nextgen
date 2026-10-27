"""Calculators and compliance calendars taken from the client's reference images (safety calculations, fire protection,
lifting, HAZOP / risk matrix, factory audit areas and the statutory compliance calendars)."""
from forms_dsl import (
    COMPLIANCE, YES_NO_NA, checklist, col, coldate, colformula, colnum, colsel, date, form, formula, header, note, num, reset_keys, sec, select, signoff,
    table, table_sec, text, area,
)

STATUS = ["Open", "In progress", "Closed", "Verified"]
SATISFACTORY = ["Satisfactory", "Needs improvement", "Unsatisfactory", "Not applicable"]


def fire_audit_risk():
    reset_keys()
    areas = {
        "1. Building and structure": ["Fire resistance construction", "Compartmentation", "Fire doors and shutters", "Roof safety", "Lightning protection"],
        "2. Fire detection and alarm system": ["Smoke / heat detectors", "Manual call points", "Alarm sounders", "Control panel", "Regular testing"],
        "3. Fire fighting systems": ["Fire hydrant system", "Sprinkler system", "Fire water tanks", "Pumps (jockey / main)", "Hose reels"],
        "4. Portable fire extinguishers": ["Type and suitability", "Location and signage", "Accessibility", "Inspection tag", "Refilling and maintenance"],
        "5. Means of escape and emergency": ["Emergency exits", "Exit signs and lighting", "Escape routes", "Assembly points", "Emergency lighting"],
        "6. Electrical safety": ["Proper wiring", "Earthing", "Overload protection", "Cable condition", "Panel cleanliness"],
        "7. Hazardous materials": ["Storage safety", "Flammable liquids", "Gas cylinders", "MSDS availability", "Ventilation"],
        "8. Administration and documentation": ["Fire NOC / Fire Safety Certificate", "Fire safety policy", "Fire drill records (once in 3 months)", "Training records", "Audit and inspection records"],
    }
    sections = [header("Fire safety audit")]
    for title, items in areas.items():
        sections.append(checklist(title, items, options=SATISFACTORY))
    sections += [
        table_sec("Fire load calculation", table("fire_load", "Fire load", [
            colsel("Material", ["Cotton fabric", "Wood (packing)", "Paper", "Plastic", "Yarn", "Garments", "Chemicals", "Other"], "material"), colnum("Quantity (kg)", "qty"),
            colnum("Calorific value (MJ/kg)", "cv"), colformula("Fire load (MJ)", "qty * cv", "load", total=True)], min_rows=1, totals=True)),
        table_sec("Fire risk assessment", table("risks", "Fire risk assessment", [
            col("Activity / area", "activity"), col("Hazard", "hazard"), col("Possible consequences", "consequence"), colnum("Likelihood (1-5)", "likelihood"), colnum("Consequence (1-5)", "severity"),
            colformula("Risk score", "likelihood * severity", "score"), colsel("Risk level", ["Low (1-4)", "Medium (5-10)", "High (11-16)", "Extreme (17-25)"], "level"),
            col("Existing controls", "controls"), col("Further action required", "action"), col("Responsible", "owner"), coldate("Review date", "review")], min_rows=0)),
        sec("Fire drill", date("Last fire drill date"), num("Evacuation time (minutes)"), text("Scenario"), area("Response evaluation and corrective actions")),
        signoff(),
    ]
    return form("Fire Safety Audit and Risk Assessment", "Fire safety audit by area (building, detection, fire fighting, extinguishers, escape, electrical, hazardous materials, records), fire load calculation, risk matrix and fire drill.", "FSR", sections)


def fire_calculations():
    reset_keys()
    return form("Fire Protection Calculations", "Fire pump flow conversion, fire alarm battery backup, voltage drop and device load calculation.", "FPC", [
        header("Fire protection calculations"),
        sec("Fire pump flow", num("Required fire flow (LPM)", key="lpm"), formula("Equivalent flow (m3/hr) = LPM / 1000 x 60", "lpm / 1000 * 60", key="m3hr"),
            note("Select a pump that delivers the required flow at the design total dynamic head, as per NFPA 20.")),
        table_sec("Fire alarm device load", table("devices", "Fire alarm load", [
            colsel("Device type", ["Smoke detector", "Heat detector", "Manual call point", "Sounder / hooter", "Strobe / beacon", "Module", "Other"], "device"), colnum("Voltage (VDC)", "voltage"),
            colnum("Standby current each (mA)", "standby"), colnum("Alarm current each (mA)", "alarm"), colnum("Quantity", "qty"),
            colformula("Total standby (mA)", "standby * qty", "total_standby", total=True), colformula("Total alarm (mA)", "alarm * qty", "total_alarm", total=True)], min_rows=1, totals=True)),
        sec("Battery backup", num("Standby duration (hours)", key="standby_hours", default=24), num("Alarm duration (hours)", key="alarm_hours", default=0.5), num("Battery voltage (V)", key="battery_v", default=24),
            num("Safety factor (%)", key="safety", default=25),
            formula("Standby load (A)", "devices.total_standby / 1000", key="standby_a"), formula("Alarm load (A)", "devices.total_alarm / 1000", key="alarm_a"),
            formula("Battery capacity (Ah) with safety factor", "(standby_a * standby_hours + alarm_a * alarm_hours) * (100 + safety) / 100", key="battery_ah")),
        sec("Voltage drop check", num("Current I (A)", key="i"), num("Cable length L (m)", key="l"), num("Cable resistance R (ohm/km)", key="r"), num("System voltage (V)", key="vsys", default=24),
            formula("Voltage drop (V) = 2 x I x L x R / 1000", "2 * i * l * r / 1000", key="vdrop"), formula("Voltage drop (% of system voltage)", "vdrop * 100 / vsys", key="vdrop_pct"),
            note("Ensure the voltage drop stays within 10% of the system voltage.")),
        signoff(),
    ], form_type="STANDARD")


def lifting_calculations():
    reset_keys()
    return form("Lifting Calculation Sheet", "Load weight, crane utilisation, sling load, dynamic load factor and safe working load checks for lifting operations.", "LFT", [
        header("Lifting plan"),
        sec("Load weight", num("Steel plate - length (m)", key="pl"), num("Steel plate - width (m)", key="pw"), num("Steel plate - thickness (mm)", key="pt"),
            formula("Steel plate weight (kg) = L x W x T x 7.85", "pl * pw * pt * 7.85", key="plate_kg"),
            num("Steel pipe volume (m3)", key="pipe_v"), formula("Steel pipe weight (kg) = volume x 7850", "pipe_v * 7850", key="pipe_kg"),
            num("Concrete volume (m3)", key="conc_v"), formula("Concrete weight (kg) = volume x 2400", "conc_v * 2400", key="conc_kg"),
            num("Water volume (m3)", key="water_v"), formula("Water weight (kg) = volume x 1000", "water_v * 1000", key="water_kg"),
            num("Load to be lifted (kg)", key="load_kg")),
        sec("Crane utilisation", num("Actual load (ton)", key="actual"), num("Rated capacity (ton)", key="rated"), formula("Crane utilisation (%)", "actual / rated * 100", key="util"),
            note("Utilisation above 100% is an overload - re-plan the lift.")),
        sec("Dynamic load", num("Static load (kg)", key="static"), select("Condition", ["Smooth lift (1.1)", "Normal lift (1.25)", "Shock loading (1.5 or higher)"]), num("Dynamic factor", key="dyn", default=1.25),
            formula("Dynamic load (kg) = static load x factor", "static * dyn", key="dynamic")),
        sec("Sling load", num("Total load (kg)", key="sling_total"), select("Sling arrangement", ["Two leg", "Four leg"]), num("Number of legs", key="legs", default=2),
            num("Sine of sling angle from horizontal (e.g. 0.866 for 60 degrees)", key="sine", default=0.866),
            formula("Load per sling (kg) = total load / (legs x sin angle)", "sling_total / (legs * sine)", key="per_sling"), note("Preferred sling angle is 60 degrees or more; tension rises as the angle falls.")),
        sec("Safe working load", num("Breaking load (ton)", key="breaking"), num("Factor of safety", key="fos", default=5), formula("SWL (ton) = breaking load / FOS", "breaking / fos", key="swl")),
        checklist("Pre-lift checks", ["Load weight verified", "Crane load chart checked", "Lifting accessories inspected (slings, shackles, hooks)", "Centre of gravity identified",
                                       "Wire ropes free of broken wires, kinks, corrosion and bird caging", "Lifting area barricaded", "Trained riggers and operator", "Approved lifting plan followed"], options=YES_NO_NA),
        signoff(),
    ], form_type="STANDARD")


def hazop_risk():
    reset_keys()
    return form("HAZOP Worksheet and Risk Assessment", "HAZOP study worksheet (node, guide word, deviation, causes, consequences, safeguards) and 5x5 risk assessment register.", "HAZ", [
        header("HAZOP study", extra=[text("Study team"), text("Process / system studied")]),
        table_sec("HAZOP worksheet", table("hazop", "HAZOP worksheet", [
            col("Node / element", "node"), col("Parameter", "parameter"), colsel("Guide word", ["No / not", "More", "Less", "As well as", "Part of", "Reverse", "Other than"], "guide"), col("Deviation", "deviation"),
            col("Possible causes", "causes", width=14), col("Possible consequences", "consequences", width=14), col("Existing safeguards", "safeguards", width=14), colsel("Risk ranking", ["Low", "Medium", "High", "Extreme"], "ranking"),
            col("Recommendations", "recommendations", width=14), col("Action by", "owner"), coldate("Target date", "target")], min_rows=1)),
        table_sec("Risk assessment register", table("risk", "Risk assessment", [
            col("Activity / process", "activity"), col("Hazard identified", "hazard"), col("Possible consequences", "consequence"), colnum("Likelihood (1-5)", "likelihood"), colnum("Consequence (1-5)", "severity"),
            colformula("Risk score", "likelihood * severity", "score"), colsel("Risk level", ["Low (1-4)", "Medium (5-9)", "High (10-16)", "Extreme (17-25)"], "level"), col("Existing control measures", "controls"),
            col("Further action required", "action"), col("Responsible person", "owner"), coldate("Review date", "review")], min_rows=1)),
        signoff("Risk score = likelihood x severity. 1-4 low (monitor), 5-9 medium (reduce where practicable), 10-16 high (act immediately), 17-25 extreme (stop the activity)."),
    ], form_type="ASSESSMENT")


def factory_audit_checklist():
    reset_keys()
    areas = ["Factory licence", "Registration", "Building stability certificate", "Machinery approval", "Pressure vessel inspection", "Lifting machine certification", "Fire protection", "Electrical safety",
             "PPE", "Medical examination", "Hazardous chemical storage", "Permit to work", "Lockout / tagout (LOTO)", "Confined space", "Hot work", "Work at height", "Crane safety", "Boiler safety",
             "Emergency preparedness", "Mock drill", "Occupational health centre", "Welfare facilities", "Safety officer appointment", "Welfare officer appointment", "Annual returns", "Accident reporting",
             "Dangerous occurrence reporting", "Safety training", "Contractor safety"]
    chapters = ["General (Sections 2, 6, 7A, 7B)", "Health (Sections 11-20)", "Safety (Sections 21-41)", "Hazardous processes (Sections 41A-41H)", "Welfare (Sections 42-50)", "Working hours of adults (Sections 51-66)",
                "Young persons (Sections 67-77)", "Annual leave with wages (Sections 78-84)", "Special provisions (Sections 87-91A)", "Penalties and procedure (Sections 92-106)"]
    return form("Factory Audit (Internal and External) Checklist", "Audit under the Factories Act 1948, Tamil Nadu Factories Rules 1950 and OSHW Code: audit areas, chapter-wise compliance and report conclusion.", "FAC", [
        header("Factory audit", extra=[select("Audit type", ["Internal audit", "External audit - recognised safety auditor", "Third party", "Buyer audit", "Government (DISH) inspection"])]),
        checklist("Tamil Nadu Factories Rules - audit areas", areas, options=COMPLIANCE),
        checklist("Factories Act - chapter-wise compliance", chapters, options=COMPLIANCE),
        table_sec("Non-conformities", table("ncs", "Non-conformities and actions", [col("Non-conformity", "nc", width=26), col("Legal reference", "ref"), colsel("Priority", ["Critical", "High", "Medium", "Low"], "priority"),
                                                                                   col("Corrective action", "action", width=22), col("Responsible", "owner"), coldate("Target date", "target"), colsel("Status", STATUS, "status")], min_rows=0)),
        sec("Report", num("Compliance score (%)"), area("Executive summary"), area("Management action plan"), area("Conclusion of the auditor")),
        signoff(),
    ], form_type="CHECKLIST")


def calendar_tracker(name, prefix, description, groups):
    def build():
        reset_keys()
        sections = [header("Compliance calendar", extra=[text("Calendar year")])]
        for group, rows in groups.items():
            items = [f"{req} - {law} ({freq})" for req, law, freq in rows]
            sections.append(checklist(group, items, options=["Done / valid", "Due soon", "Overdue", "Not applicable"]))
        sections.append(signoff())
        return form(name, description, prefix, sections, form_type="CHECKLIST")
    return build


SAFETY_CALENDAR = {
    "Factories Act, 1948 and Tamil Nadu Factories Rules, 1950": [
        ("Appointment of Safety Officer", "Sec 40B", "within 30 days"), ("Safety Committee Meeting", "Sec 41B", "quarterly"), ("Display of Notices", "Rule 42", "continuous"),
        ("Safety Policy and Objectives", "Rule 5B", "annual"), ("Risk Assessment (HAZID and HIRA)", "Rule 5(1)", "annual"), ("Legal Register Update", "Rule 75(1)(v)", "quarterly"),
        ("Internal Safety Audit", "IS 14489", "half-yearly"), ("Mock Drill (Fire and Emergency)", "Rule 98", "half-yearly"), ("Health Check-up (Employees)", "Rule 113", "annual"), ("Annual Return (Form 2)", "Rule 117", "annual, 31 Jan")],
    "OSH Code, 2020 and Rules": [
        ("Risk Assessment and Control", "Sec 7, 8", "annual"), ("Occupational Health Surveillance", "Sec 13", "annual"), ("Accident / Incident Reporting", "Sec 32", "immediate"), ("Permit to Work System", "Sec 21", "continuous"),
        ("PPE Issue and Training", "Sec 25", "quarterly"), ("Contractor Safety Management", "Sec 29", "continuous"), ("Safety Training (Employees)", "Sec 19", "monthly"), ("Emergency Preparedness Plan", "Sec 33", "annual"),
        ("Safety Signage and Labelling", "Sec 9, 21", "continuous"), ("Management Review", "Sec 44", "annual")],
    "Boilers Act, 1923 and Rules": [
        ("Boiler Registration / Renewal", "Sec 4", "as per certificate"), ("Inspection by Boiler Inspector", "Sec 9", "as per IBR"), ("Periodic Hydraulic Test", "Rule 14", "annual"), ("Steam Safety Valve Test", "Rule 19", "half-yearly"),
        ("Blow Down Valve Test", "Rule 16", "quarterly"), ("Fusible Plug / LWCO Test", "Rule 12, 13", "monthly"), ("Boiler Log Book Maintenance", "Rule 18", "daily"), ("Annual Return (Form BR)", "Rule 84", "annual, 31 Dec"), ("Boiler Insurance", "Rule 58", "before expiry")],
    "Electricity Act, 2003 and CEA Regulations": [
        ("Electrical Installation Licence", "Reg 47", "quarterly review"), ("Earth Resistance Test", "Reg 59(2)", "half-yearly"), ("Electrical Equipment Maintenance", "Reg 50", "monthly"), ("Licence of Electrical Supervisor", "Reg 3", "before expiry"),
        ("Energy Audit (if applicable)", "Reg 14", "annual"), ("Electrical Accident Reporting", "Reg 86", "immediate"), ("Display of Danger Notice", "Reg 84", "continuous"), ("Electrical Safety Training", "Reg 6", "quarterly"),
        ("Thermography / IR Scanning", "best practice", "half-yearly"), ("Electrical Permit to Work", "safety practice", "continuous")],
    "Explosives, Weights and Measures, Returns": [
        ("Explosives Licence", "Sec 7", "before expiry"), ("Magazine Inspection", "Rule 113", "monthly"), ("Fire Extinguisher in Magazine", "Rule 128", "monthly"), ("Weighing Machine Licence", "Sec 18", "before expiry"),
        ("Verification / Calibration of weights", "Rule 21", "half-yearly"), ("Annual Return (Factories)", "Rule 117", "31 Jan"), ("Annual Return (Boiler)", "Rule 84", "31 Dec"), ("Return under OSHW Code", "Rule 77", "annual"),
        ("Accident Return (Form 2A)", "Rule 118", "31 Jan"), ("Dangerous Occurrence Report", "Rule 119", "within 24 hrs"), ("Wages Register Return", "Rule 73", "31 Jan"), ("Safety Audit Report Submission", "OSHW Code Reg 78", "annual")],
}
ENV_CALENDAR = {"Environmental compliance (India)": [
    ("Consent to Establish (CTE)", "Water Act 1974, Air Act 1981", "project specific"), ("Consent to Operate (CTO)", "Water Act, Air Act", "annual"), ("Hazardous Waste Authorisation", "HW Rules 2016", "multi-year"),
    ("Hazardous Waste Annual Return (Form 4)", "HW Rules 2016", "annual, 30 June"), ("E-Waste Annual Returns (Form 3)", "E-Waste Rules 2022", "annual, 30 June"), ("Plastic Waste Returns (Form 4)", "Plastic Waste Rules 2016", "annual, 30 June"),
    ("Battery Waste Returns", "Battery Waste Management Rules", "annual, 30 June"), ("Environmental Statement (Form V)", "Env (Protection) Act 1986", "annual, 30 September"), ("Stack Monitoring (air emissions)", "SPCB consent conditions", "quarterly"),
    ("Effluent Monitoring (water discharge)", "SPCB consent conditions", "monthly"), ("Ambient Air Quality", "SPCB consent conditions", "quarterly"), ("Noise Monitoring", "CGWA guidelines", "semi-annual"),
    ("Groundwater Extraction Returns", "CGWA", "annual, 30 June"), ("Disaster Management Plan Review", "Disaster Management Act", "annual"), ("Environmental Training", "best practice", "annual"),
    ("SPCB Consent Fee Payment", "relevant Acts", "annual"), ("ESG Reporting (BRSR, listed companies)", "SEBI guidelines", "annual"), ("Internal Environmental Audit", "ISO 14001 / best practice", "semi-annual")]}
SOCIAL_CALENDAR = {"Social security and labour compliance (India)": [
    ("EPF - monthly contribution remittance", "EPF and MP Act 1952", "monthly, 15th of next month"), ("EPF - ECR filing", "EPF and MP Act 1952", "monthly, 15th"), ("ESI - contribution remittance", "ESI Act 1948", "monthly, 21st"),
    ("ESI - return filing (Form 5)", "ESI Act 1948", "half-yearly"), ("EPF - annual return (Form 6A)", "EPF and MP Act 1952", "annual, 31 Aug"), ("EPF - ICR (Form 5A, above 20 employees)", "EPF and MP Act 1952", "half-yearly"),
    ("ESI - annual return (Form 11)", "ESI Act 1948", "annual, 31 Dec"), ("Bonus payment", "Payment of Bonus Act 1965", "within 8 months of year end"), ("Gratuity payment", "Payment of Gratuity Act 1972", "within 30 days of becoming due"),
    ("LWF - annual return (Form 1)", "Contract Labour Act 1970", "annual, 31 Jan"), ("LWF - annual contribution", "Contract Labour Act 1970", "annual, 31 Jan"), ("Professional tax payment", "State PT Acts", "monthly / quarterly"),
    ("Professional tax return filing", "State PT Acts", "annual"), ("Labour Welfare Fund contribution", "State Shops and Establishment Acts", "annual"), ("Maternity benefit compliance", "Maternity Benefit Act 1961", "as applicable"),
    ("Payment of wages", "Payment of Wages Act 1936", "monthly, before 7th / 10th"), ("Wage register and statutory register maintenance", "all labour laws", "continuous"), ("Display of abstracts and notices", "all labour laws", "continuous"),
    ("PF nomination and UAN compliance", "EPF and MP Act 1952", "at joining"), ("Safety and welfare measures", "Factories Act 1948", "ongoing"), ("Apprenticeship compliance", "Apprentices Act 1961", "ongoing"), ("Return under CLRA Act", "Contract Labour Act 1970", "as per state")]}
LEGAL_DOCS = {
    "Factory and administrative": [("Factory Licence", "Factories Act 1948 Sec 2(m)", "5 years"), ("Factory Plan Approval", "Factories Act Sec 3 and 4", "one time"), ("Building Stability Certificate", "Factories Act Sec 3(1)(d)", "one time"),
                                   ("No Objection Certificate (factory building)", "Local body", "one time"), ("Change in name / address / manager / owner", "Factories Act Sec 87", "within 30 days"), ("Register of Boilers", "Factories Act Sec 85", "continuous")],
    "Safety and occupational health": [("Appointment of Safety Officer", "Factories Act Sec 40B", "within 30 days"), ("Health Register (Form 3)", "Factories Rules Rule 61", "continuous"), ("Accident Register (Form 13)", "Factories Rules Rule 87", "continuous"),
                                       ("Annual Return (Form 32)", "Factories Act Sec 92", "31 January"), ("Certificate of Fitness - lifting machines", "Factories Act Sec 59", "1 year"), ("Certificate of Fitness - electricity", "Factories Act Sec 62", "1 year"),
                                       ("Certificate of Fitness - workers safety", "Factories Act Sec 73", "1 year"), ("Display of safety signs and instructions", "Factories Act Sec 41A", "continuous")],
    "Fire safety": [("No Objection Certificate (Fire)", "TN Fire Service Act 1985", "1 year"), ("Fire extinguisher refilling and maintenance", "NBC 2016 Part 4 / IS 15683", "6 months"), ("Fire drill", "NBC 2016 Part 4", "6 months"),
                    ("Fire hydrant system test", "IS 3844 / NBC 2016", "6 months"), ("Fire alarm system test", "IS 2189 / NBC 2016", "6 months"), ("Portable ladder inspection", "IS 3696", "1 year")],
    "Electrical safety": [("Electrical installation licence (HT)", "Electricity Act 2003 Sec 14", "2 years"), ("Electrical installation licence (LT)", "Electricity Act 2003 Sec 14", "2 years"), ("Periodic inspection report", "Electricity Act 2003 Sec 68", "1 year"),
                          ("Energy meter calibration", "Legal Metrology Act 2009", "1 year")],
    "Boiler and pressure vessels": [("Boiler registration", "Boilers Act 1923 Sec 5", "permanent"), ("Boiler inspection", "Boilers Act Sec 10", "yearly / half-yearly"), ("Certificate of fitness - boiler", "Boilers Act Sec 11", "1 year"),
                                    ("Steam pipe and economiser inspection", "Boilers Act Sec 10", "1 year"), ("Pressure vessel registration", "Boilers Act Sec 5A", "permanent")],
    "Environmental": [("Consent to Establish (CTE)", "Water Act 1974", "permanent"), ("Consent to Operate (CTO)", "Water Act 1974", "5 years"), ("Hazardous Waste Authorisation", "HW Rules 2016", "5 years"),
                      ("Annual Return (Form IV)", "HW Rules 2016", "30 June"), ("Water Audit Report", "TNPCB circular", "30 June"), ("Environment Statement (Form V)", "Environment (Protection) Rules 1986", "30 September")],
    "Labour welfare and social security": [("Registration under EPF Act", "EPF and MP Act 1952", "one time"), ("Monthly EPF return and payment", "EPF and MP Act 1952", "15th of next month"), ("Registration under ESI Act", "ESI Act 1948", "one time"),
                                           ("Monthly ESI contribution", "ESI Act 1948", "21st of next month"), ("Labour Welfare Fund", "Tamil Nadu Labour Welfare Fund Act", "31 March"), ("Maternity benefit compliance", "Maternity Benefit Act 1961", "continuous")],
    "Weights and measures, explosives": [("Weighing / measuring instruments registration", "Legal Metrology Act 2009", "one time"), ("Weighing / measuring instruments calibration", "Legal Metrology Act 2009", "1 year"),
                                         ("Explosives licence", "Explosives Act 1884", "1-3 years"), ("PESO licence (storage / handling)", "Explosives Act 1884", "1-3 years")],
}

EXTRA_CATALOGUE = [
    ("Fire Safety Audit and Risk Assessment", fire_audit_risk, "AUDIT", "Fire Safety", ["FIRE", "SAFETY"]),
    ("Fire Protection Calculations", fire_calculations, "ASSESSMENT", "Fire Safety", ["FIRE"]),
    ("Lifting Calculation Sheet", lifting_calculations, "ASSESSMENT", "Safety", ["SAFETY"]),
    ("HAZOP Worksheet and Risk Assessment", hazop_risk, "STUDY", "Safety", ["SAFETY", "FIRE"]),
    ("Factory Audit (Internal and External) Checklist", factory_audit_checklist, "AUDIT", "Safety", ["SAFETY", "LEGAL"]),
    ("Safety Compliance Calendar Tracker", calendar_tracker("Safety Compliance Calendar Tracker", "SCC", "Statutory safety requirements and returns under the Factories Act, OSH Code, Boilers, Electricity and Explosives rules, tracked against due dates.", SAFETY_CALENDAR), "AUDIT", "Legal", ["LEGAL", "SAFETY"]),
    ("Environmental Compliance Calendar Tracker", calendar_tracker("Environmental Compliance Calendar Tracker", "ECC", "Consents, authorisations, returns and monitoring due under the Water, Air, Hazardous Waste, E-Waste and Plastic Waste rules.", ENV_CALENDAR), "AUDIT", "Environment", ["ENV", "LEGAL"]),
    ("Social Security Compliance Calendar Tracker", calendar_tracker("Social Security Compliance Calendar Tracker", "SSC", "EPF, ESI, bonus, gratuity, LWF, professional tax and wage compliance due dates for employers.", SOCIAL_CALENDAR), "AUDIT", "Social Compliance", ["SOCIAL", "PAYROLL", "LEGAL"]),
    ("Legal Compliance Calendar and Documents Checklist", calendar_tracker("Legal Compliance Calendar and Documents Checklist", "LCD", "Licences, certificates and registers a factory must hold, with the governing Act, validity and renewal frequency.", LEGAL_DOCS), "AUDIT", "Legal", ["LEGAL"]),
]
