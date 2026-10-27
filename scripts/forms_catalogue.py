"""The client's audit forms (Shakthi Knitting / One Legal Culture documents) expressed as form-builder structures.

Every entry in CATALOGUE is one dynamic module with one form, and names the auditor types that work with it.
Auditor type codes: WATER, ENV, GHG, SAFETY, FIRE, LEGAL, SOCIAL, PAYROLL, TEXSTD, ELEC.

Nothing here is special-cased in the app: an administrator can edit any of these forms afterwards in the form
builder (rename titles, add or remove fields, change field types) exactly as if they had built them by hand.
"""
import json
from pathlib import Path

from forms_dsl import (
    GRADE_RYG, YES_NO_SCORED, AVAILABLE, COMPLIANCE, YES_NO_NA, RATING, area, checklist, col, colcheck, coldate, colformula, colnum, colsel, date, form, formula,
    header, multi, note, num, reset_keys, sec, select, signoff, table, table_sec, text, upload, yesno,
)

from forms_catalogue_extra import EXTRA_CATALOGUE  # noqa: E402
from forms_catalogue_step3 import STEP3_CATALOGUE  # noqa: E402

CHECKLISTS = json.loads((Path(__file__).parent / "fixtures" / "client-checklists.json").read_text(encoding="utf-8"))
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
STATUS = ["Open", "In progress", "Closed", "Verified"]


# ───────────────────────────── WATER ─────────────────────────────

def water_diagnosis():
    reset_keys()
    return form("Total Water Management - Diagnosis Checklist", "Water audit - broad checklist for a manufacturing unit (water sources, requirements, treatment, reuse, cost).", "TWM", [
        header("LVK / TWM diagnosis"),
        sec("General information",
            text("Type of products manufactured"), num("Number of employees (incl. contract labour)"),
            multi("Shifts in operation", ["A", "B", "C", "General"]), num("Factory area - total (sq m)"),
            num("Open area (sq m)"), num("Landscaping area (sq m)")),
        sec("Production - actual achieved", tables=[table("production", "Production actual achieved", [
            col("Product", "product", "select", options=["Knitted goods (TPD/TPM)", "Open width cloth (TPD/TPM)", "Total bleached goods (TPD/TPM)", "Total dyed goods (TPD/TPM)", "Effluent handling (KLD)"], width=28),
            colnum("Consented quantity", "consented"), colnum("Actual - month 1", "m1"), colnum("Actual - month 2", "m2"), colnum("Actual - month 3", "m3")], min_rows=1)], cols=1),
        sec("Water requirements (KLD)",
            num("Process", key="req_process"), num("Cooling", key="req_cooling"), num("Boiler", key="req_boiler"), num("Gardening", key="req_gardening"),
            num("Domestic", key="req_domestic"), num("Others (specify in remarks)", key="req_others"), num("Fire fighting - reserve (KL)", key="req_fire_reserve"),
            num("Fire fighting - make-up", key="req_fire_makeup"),
            formula("Total water requirement (KLD)", "req_process + req_cooling + req_boiler + req_gardening + req_domestic + req_others + req_fire_makeup", key="req_total")),
        sec("Water sources and management system",
            multi("Type of water sourced", ["Purchased water", "Ground water", "Surface water", "Rainwater", "Recycled water", "Any other"]),
            multi("On-site water treatment available", ["Filtration", "Softener", "De-mineraliser", "Reverse osmosis"]),
            text("Underground storage tanks (number and volume)"), text("Treated water storage tanks (number and volume)"),
            yesno("Direct pressurised supply lines"), text("Elevated storage reservoirs (number and volume)"),
            select("Domestic sewage and process wastewater", ["Segregated", "Mixed together"]), text("Process wastewater segregated for reuse / recycle"),
            upload("Process flow diagram of wastewater treatment system and STP")),
        sec("Cost of water grades (Rs/KL)",
            num("Supplied water"), num("Filtered water"), num("Treated water (softened / DM / RO)"), num("Treated wastewater"), num("Treated sewage"), num("Reuse / recycle water")),
        table_sec("Cooling towers", table("cooling_towers", "Cooling towers", [
            col("Cooling tower", "tower"), colnum("Circulation rate (KL/hr)", "circulation"), colnum("Make-up water (KLD)", "makeup"),
            colnum("Blow-down (KLD)", "blowdown"), col("Remarks", "remarks")], min_rows=0)),
        table_sec("Bore wells", table("bore_wells", "Bore well details", [
            col("Bore well", "well"), colnum("Total depth (m)", "depth"), colnum("HP connected", "hp"), colnum("Operational hours / day", "hours")], min_rows=0)),
        table_sec("Water saving opportunities", table("saving_measures", "Water saving measures recommended", [
            col("Measure", "measure", width=40), colnum("Saving (KLD)", "saving", total=True), colnum("Investment (Rs)", "cost", total=True), colnum("Payback (months)", "payback")], min_rows=0)),
        signoff(),
    ])


def water_garment_questionnaire():
    reset_keys()
    return form("Water Audit - Garment Unit Questionnaire", "Broad water audit checklist for a garment complex (population, requirement, sewage treatment and reuse, STP test parameters).", "WGQ", [
        header("Garment unit questionnaire"),
        sec("Unit profile", text("Production capacity"), num("Connected population incl. floating guests - Shift A"),
            num("Shift B"), num("Shift C")),
        sec("Water requirement (KLD, sum of shifts A, B and C)",
            num("Drinking", key="r_drinking"), num("Kitchen needs", key="r_kitchen"), num("Bathing, laundry and WC / urinal", key="r_bathing"), num("Gardening", key="r_garden"),
            num("Centralised cooling tower (if any)", key="r_cooling"), num("Others", key="r_others"), num("Fire fighting (reserve)", key="r_fire"),
            formula("Total (KLD)", "r_drinking + r_kitchen + r_bathing + r_garden + r_cooling + r_others + r_fire", key="r_total")),
        sec("Sources and system",
            multi("Type of water sourced", ["Purchased water", "Ground water", "Surface water", "Rain water", "Recycled water", "Any other"]),
            text("Underground storage tanks for fresh water (number, volume)"), multi("On-site treatment", ["Filtration", "Softener", "De-mineraliser", "Reverse osmosis"]),
            text("Treated water storage tanks (number, volume)"), yesno("Direct pressurised supply lines"), text("Elevated storage reservoirs (number, volume)"),
            yesno("Domestic sewage treated"), num("Treated sewage reused / recycled (%)"), upload("Process flow diagram of the STP")),
        sec("Cost", num("Supplied water (Rs/KL)"), num("Filtered water (Rs/KL)"), num("Treated water - softened / DM / RO (Rs/KL)"), num("Treated wastewater (Rs/KL)"),
            num("Reuse / recycle water (Rs/KL)"), num("Electricity cost (Rs/kWh)")),
        sec("Treatment, ZLD and reuse", text("Capacity of STP and key problem areas"), yesno("Zero Liquid Discharge stipulated by the regulator"),
            multi("Drivers for total water management", ["Non-availability of water", "High cost of water", "Restriction on disposal", "Competing consumers nearby", "Others"]),
            multi("Present uses of treated sewage", ["Landscaping", "WC / urinal flushing", "Cooling tower make-up", "Others"]),
            num("Green area where water or treated sewage is used (sq m)"), yesno("Consent to Operate from the State Pollution Control Board held")),
        table_sec("STP input / output test parameters", table("stp_tests", "STP test report", [
            colsel("Parameter", ["pH", "COD (mg/l)", "BOD (mg/l)", "TSS (mg/l)", "Total nitrogen (mg/l)", "Total coliform"], "parameter"),
            colnum("Raw sewage (input to STP)", "raw"), colnum("Treated sewage (output)", "treated"), col("Remark", "remark")], min_rows=0)),
        signoff(),
    ])


def water_register():
    reset_keys()
    water_cols = [("Bore well o/p (FW)", "borewell"), ("RO feed water (FW)", "ro_feed"), ("Canteen washing (FW)", "canteen"), ("Toilet hand wash (FW)", "toilet_hw"),
                  ("Guest house flush (FW)", "guest"), ("Hydrant input (FW)", "hydrant"), ("Gardening (FW)", "garden_fw"), ("Boiler (RO treated)", "boiler"),
                  ("RO drinking", "ro_drinking"), ("Lab (RO)", "lab_ro"), ("Rain water used", "rain"), ("STP to toilet flush", "stp_flush"), ("RO reject to gardening", "ro_reject")]
    return form("Monthly Water Consumption Register", "Meter readings and monthly water use by source: bore well, RO, canteen, toilets, hydrant, boiler, gardening, rain water and recycled water.", "WCR", [
        header("Water consumption register", extra=[text("Reporting year", key="year"), num("Average operator strength", key="strength")]),
        table_sec("Meter readings", table("meters", "Meter readings", [
            colsel("Meter", ["Bore well output", "RO feed water", "Canteen washing", "Toilet hand wash", "Guest house flush", "Hydrant tank input", "Gardening",
                             "Boiler (RO treated)", "RO drinking", "Lab (RO)", "Rain water collection", "STP to toilet flush"], "meter", width=24),
            colsel("Month", MONTHS, "month"), coldate("Reading date", "reading_date"), colnum("Opening reading", "opening"), colnum("Closing reading", "closing"),
            colformula("Consumption", "closing - opening", "consumption", total=True)], min_rows=1)),
        table_sec("Monthly consumption by source (cubic metres)", table("monthly", "Monthly consumption by source", [colsel("Month", MONTHS, "month", width=14)] +
                  [colnum(label, key, total=True) for label, key in water_cols], min_rows=1, max_rows=12, totals=True)),
        sec("Water performance (achieved vs target)",
            formula("Total fresh water used (KL)", "monthly.borewell", key="fresh_total"),
            num("Target reduction (%)", key="target_pct"), num("Previous year achieved (litres / employee / year)", key="prev_achieved"),
            formula("Achieved this year (litres / employee / year)", "fresh_total * 1000 / strength", key="achieved"),
            formula("Target (litres / employee / year)", "prev_achieved * (100 - target_pct) / 100", key="target_value"),
            note("Achieved value = total water used in KL x 1000 / average operator strength. Target reduction % is set from the goal and scope for reduction.")),
        signoff(),
    ])


# ───────────────────────────── ENVIRONMENT / ETP ─────────────────────────────

def etp_assessment():
    reset_keys()
    docs = CHECKLISTS["etp_documents"]
    # Yes = 1, No = 0 on every question; the formula turns them into the H&M traffic-light grade
    # (Red: not designed for the load or not operated; Green: operated and nearly all competence points met; otherwise Yellow).
    def question(code, text_, key):
        return [select(f"{code} {text_}", YES_NO_SCORED, key=key, w=12), area(f"{code} Observations / findings", key=f"{key}_obs")]

    return form("ETP Functionality Assessment Form", "H&M ETP functionality assessment: facility and ETP information, production and water records, document review, parameters, grading.", "ETP", [
        header("ETP assessment report", extra=[text("SPUR ID"), date("Date of report release")]),
        sec("Assessment details",
            select("Type of ETP assessment", ["Onsite - H&M nominated 3rd party", "Onsite - H&M", "Desktop review"]), text("3rd party ETP assessor company"),
            text("Lead assessor"), text("Team mate"), select("Desktop grading", ["Green", "Amber", "Red", "Black", "Incomplete"]), num("Buffer capacity (%)")),
        sec("Factory and ETP information",
            text("Name of unit"), text("Unit responsible"), num("ETP capacity (m3/hour)"), num("ETP operating hours / day"), num("Maximum wastewater generation capacity (m3/day)"),
            yesno("Zero Liquid Discharge (ZLD)"), num("Recycling in process (%)"), text("Design service provider"),
            area("Treatment scheme / flow (e.g. screening, collection tank, chemical mixing, settling, sludge drying bed, PSF, ACF, treated water tank)")),
        table_sec("Last six months production and water records", table("production", "Production, water consumption and effluent", [
            col("Month", "month"), colnum("Total production", "production"), col("Unit", "unit"), colnum("Water consumption (m3)", "water"), colnum("Effluent discharged from ETP (m3)", "effluent")], min_rows=1, max_rows=12)),
        table_sec("Wet production capacity", table("wet_capacity", "Wet production capacity", [
            colsel("Process type", ["Placement / piece printing", "Heavy knit washing", "Yarn dyeing", "Knit fabric dyeing and finishing", "Woven or denim washing", "All over printing (AOP)",
                                    "Denim fabric dyeing", "Ceramic wet processing", "Tanning", "Electroplating", "Other"], "process", width=40),
            colnum("Production capacity per day", "capacity"), col("Unit of measure", "unit")], min_rows=0)),
        table_sec("Document review", table("documents", "ETP assessment document list", [
            colsel("Document", docs, "document", width=50), colsel("Acceptable", ["Yes", "No", "Not provided"], "acceptable"), col("Comments / finding", "comments", width=30)], min_rows=0, max_rows=40)),
        table_sec("Effluent test results", table("effluent_tests", "Treated effluent test results", [
            colsel("Parameter", ["pH", "Temperature", "COD", "BOD", "TSS", "TDS", "Colour", "Oil and grease", "Ammonia nitrogen", "Total chromium", "Other"], "parameter"),
            col("Unit", "unit"), colnum("Guideline limit", "limit"), colnum("Result", "result"), colsel("Meets guideline", ["Yes", "No"], "meets")], min_rows=0)),
        sec("1. Design", *question("1.1", "Is the ETP designed with technology suited to the wastewater generated (type, volume, pollutant load)?", "d11"), cols=1),
        sec("2. Process control",
            *question("2.1", "Is each treatment stage operated and monitored as designed (dosing, aeration, settling, sludge handling)?", "c21"),
            *question("2.2", "Are operating logs and daily test records kept and reviewed?", "c22"), cols=1),
        sec("3. Competence",
            *question("3.1", "Is a trained ETP operator present on every shift?", "k31"),
            *question("3.2", "Are training records and operating procedures available?", "k32"),
            *question("3.3", "Does the operator know chemical dosing and its safe handling?", "k33"),
            *question("3.4", "Are laboratory testing equipment and capability adequate for daily checks?", "k34"),
            *question("3.5", "Does management review ETP performance with a named responsible person?", "k35"), cols=1),
        sec("Grading",
            formula("Operation points (of 7)", "c21 + c22 + k31 + k32 + k33 + k34 + k35", key="points"),
            formula("ETP functionality grade", "IF(d11 == 0, 1, IF(c21 + c22 == 0, 1, IF(points >= 6, 3, 2)))", key="grade", options=GRADE_RYG),
            note("Red: the ETP is not suited to the load or is not being operated. Green: designed, operated and at least 6 of the 7 operation and competence points met. Yellow: everything in between."),
            select("Desktop grading (if the assessment was desktop)", ["Green", "Amber", "Red", "Black", "Incomplete"]), cols=1),
        table_sec("Findings and corrective action plan", table("findings", "Findings and corrective action plan", [
            col("Finding", "finding", width=30), col("Action plan", "plan", width=28), col("Responsible", "owner"), coldate("Timeline", "timeline"), colsel("Status", STATUS, "status")], min_rows=0)),
        signoff(),
    ])


def etp_document_list():
    reset_keys()
    return form("ETP Assessment Document List", "Documents a facility must provide for an ETP assessment (H&M).", "ETD", [
        header("ETP document list"),
        checklist("Documents provided", CHECKLISTS["etp_documents"], options=["Provided", "Partly provided", "Not provided", "Not applicable"]),
        signoff(),
    ], form_type="CHECKLIST")


def aspects_register():
    reset_keys()
    return form("Environmental Aspects and Impacts Register", "Activities, aspects, impacts, significance scoring and controls (SR Form 001).", "EAI", [
        header("SR - Form 001", extra=[date("Review date")]),
        table_sec("Aspects and impacts", table("aspects", "Environmental aspects and impacts", [
            col("Activity", "activity"), col("Aspect", "aspect"), colsel("Type of consumption / emission", ["Electricity", "Water", "Diesel / oil", "Fuel wood", "CO2", "Waste water", "Noise", "Dust", "Fumes", "Solid waste", "Hazardous waste"], "kind"),
            col("Impact", "impact"), colsel("Condition", ["Normal", "Abnormal", "Emergency"], "condition"), colnum("Likelihood (1-5)", "likelihood"), colnum("Severity (1-5)", "severity"),
            colformula("Significance", "likelihood * severity", "significance"), col("Controls", "controls", width=22), col("Objectives", "objectives", width=18)], min_rows=1)),
        signoff(),
    ])


def cap_report():
    reset_keys()
    return form("Corrective Action Plan Acknowledgement Report", "Facility response to audit findings: finding, law reference, root cause, corrective action, owner and date.", "CAP", [
        header("CAP acknowledgement", extra=[text("Facility representative / title"), text("Audit firm")]),
        sec("Minimum requirement summary", select("Minimum requirement violation", ["No violation", "Violation found"]), area("Summary of the audit")),
        table_sec("Findings and corrective actions", table("findings", "Corrective action plan", [
            colsel("Category", ["Business practices", "Recruitment and hiring", "Compensation", "Working hours", "Health and safety", "Fire safety", "Environment", "Labour management", "Other"], "category"),
            col("Finding", "finding", width=24), col("Local law / requirement", "law", width=18), col("Root cause", "root_cause"), col("Corrective action", "action", width=20),
            col("Responsible person", "owner"), coldate("Target date", "target"), colsel("Status", STATUS, "status")], min_rows=1)),
        signoff(),
    ])


# ───────────────────────────── ENERGY / GHG ─────────────────────────────

def ghg_collection():
    reset_keys()
    fuels = ["Diesel", "Petrol", "Natural gas", "LPG", "Furnace oil", "Coal", "Fuel wood", "Biomass briquettes", "Other"]
    return form("GHG Emissions Data Collection (Scope 1, 2 and 3)", "Greenhouse gas inventory data as per EPA / UNFCCC calculator: fuels, refrigerants, electricity, travel, freight and waste, with emission factors.", "GHG", [
        header("GHG calculation", extra=[text("Inventory year"), num("Number of employees"), num("Turnover (INR)")]),
        table_sec("Scope 1 - stationary combustion (fuels burnt on site)", table("stationary", "Stationary combustion", [
            colsel("Fuel", fuels, "fuel"), colsel("Unit", ["Litres", "kg", "m3", "tonnes"], "unit"), colnum("Quantity", "quantity"), colnum("Emission factor (kg CO2e / unit)", "factor"),
            colformula("Emissions (t CO2e)", "quantity * factor / 1000", "tco2e", total=True)], min_rows=0)),
        table_sec("Scope 1 - mobile combustion (own vehicles, genset)", table("mobile", "Mobile combustion", [
            col("Vehicle / equipment", "vehicle"), colsel("Fuel", fuels, "fuel"), colnum("Quantity (litres)", "quantity"), colnum("Emission factor (kg CO2e / litre)", "factor"),
            colformula("Emissions (t CO2e)", "quantity * factor / 1000", "tco2e", total=True)], min_rows=0)),
        table_sec("Scope 1 - refrigerants and fugitive emissions", table("refrigerants", "Refrigerants", [
            colsel("Refrigerant", ["R22", "R134a", "R410A", "R407C", "R32", "R404A", "Other"], "gas"), colnum("Leakage / top-up (kg)", "quantity"), colnum("GWP", "gwp"),
            colformula("Emissions (t CO2e)", "quantity * gwp / 1000", "tco2e", total=True)], min_rows=0)),
        table_sec("Scope 1 - bioenergy (reported separately)", table("bioenergy", "Bioenergy", [
            colsel("Fuel", ["Fuel wood", "Biomass briquettes", "Bagasse", "Rice husk", "Other"], "fuel"), colnum("Quantity (kg)", "quantity"), colnum("Emission factor (kg CO2e / kg)", "factor"),
            colformula("Emissions (t CO2e)", "quantity * factor / 1000", "tco2e", total=True)], min_rows=0)),
        sec("Scope 2 - purchased electricity",
            num("Grid electricity (kWh)", key="grid_kwh"), num("Grid emission factor (kg CO2e / kWh)", key="grid_factor"), num("Solar / renewable electricity (kWh)"),
            formula("Scope 2 emissions (t CO2e)", "grid_kwh * grid_factor / 1000", key="scope2")),
        table_sec("Scope 3 - business travel, flights, freight and employee commuting", table("scope3", "Scope 3 activities", [
            colsel("Category", ["Business travel - land and sea", "Business travel - flights", "Freight - road", "Freight - sea", "Freight - air", "Employee commuting", "Home office",
                                "Waste disposal", "Water supply and treatment", "Purchased goods and services", "Fuel and energy related (WTT)", "Hotel stays"], "category", width=26),
            col("Description", "description"), col("Unit", "unit"), colnum("Activity quantity", "quantity"), colnum("Emission factor (kg CO2e / unit)", "factor"),
            colformula("Emissions (t CO2e)", "quantity * factor / 1000", "tco2e", total=True)], min_rows=0)),
        sec("Results",
            formula("Total Scope 1 + Scope 3 table emissions (t CO2e)", "stationary.tco2e + mobile.tco2e + refrigerants.tco2e + scope3.tco2e", key="table_total"),
            area("Calculation notes, sources of emission factors and assumptions")),
        signoff(),
    ])


def energy_tracker():
    reset_keys()
    return form("Energy Consumption and Reduction Target Tracker", "Monthly production, electricity, diesel and fuel use with per-unit intensity and target tracking.", "ENT", [
        header("Energy consumption tracking", extra=[text("Reporting year"), text("Baseline year")]),
        table_sec("Monthly energy and production", table("monthly", "Monthly energy and production", [
            colsel("Month", MONTHS, "month", width=13), colnum("Production (pieces)", "production", total=True), colnum("Electricity - EB (kWh)", "eb_kwh", total=True),
            colnum("Electricity - solar (kWh)", "solar_kwh", total=True), colnum("Diesel for genset (litres)", "diesel", total=True), colnum("Fuel wood for boiler (kg)", "wood", total=True),
            colnum("Man power", "manpower")], min_rows=1, max_rows=12, totals=True)),
        sec("Targets and achievement",
            num("Baseline electricity intensity (kWh / 1000 pieces)", key="baseline_intensity"), num("Target reduction (%)", key="target_pct"),
            formula("Target intensity (kWh / 1000 pieces)", "baseline_intensity * (100 - target_pct) / 100", key="target_intensity"),
            formula("Achieved intensity (kWh / 1000 pieces)", "(monthly.eb_kwh + monthly.solar_kwh) * 1000 / monthly.production", key="achieved_intensity"),
            formula("Gap to target (kWh / 1000 pieces)", "achieved_intensity - target_intensity", key="gap"),
            area("Energy saving actions planned")),
        signoff(),
    ])


def baseline_calculation():
    reset_keys()
    return form("Baseline Calculation - Production, Manpower and Resource Use", "Year-on-year baseline of shipped volume, employees, operation days, energy, water and waste.", "BAS", [
        header("Baseline calculation"),
        table_sec("Baseline data by year", table("baseline", "Baseline by year", [
            col("Year", "year"), colnum("Shipped volume (pieces)", "volume"), colnum("Number of employees", "employees"), colnum("Operation days", "days"),
            colnum("Electricity (kWh)", "electricity"), colnum("Water (KL)", "water"), colnum("Fuel wood (kg)", "wood"), colnum("Diesel (litres)", "diesel"), colnum("Waste (kg)", "waste"),
            colformula("Electricity per 1000 pieces", "electricity * 1000 / volume", "elec_per_k"), colformula("Water per 1000 pieces", "water * 1000 / volume", "water_per_k")], min_rows=2, max_rows=10)),
        signoff(),
    ])


# ───────────────────────────── SAFETY ─────────────────────────────

def statutory_safety_audit():
    reset_keys()
    systems = ["Fire fighting equipment and hydrant system", "Fire alarm and emergency lighting", "Emergency exits and assembly points", "Electrical installations and earthing",
               "Machine guarding and interlocks", "Boiler and pressure vessels", "Compressed air and gas cylinders", "Material handling and lifting equipment", "Personal protective equipment",
               "Chemical storage and handling", "Housekeeping and floor condition", "First aid facilities and trained first aiders", "Welfare - drinking water, toilets, canteen, creche",
               "Ventilation, lighting and noise", "Safety signage and displays", "Accident, health and register records", "Emergency preparedness and mock drills", "Contractor and visitor safety"]
    return form("Statutory Safety Audit (IS 14489)", "Occupational safety and health audit as per IS 14489:1998 and compliance to IS 15793:2007 - factory profile, statutory licences, systems inspection and findings.", "SSA", [
        header("IS 14489 report no.", extra=[text("Report title", default="IS 14489 (1998) Code of practice on occupational safety and health audit"), date("Submitted date"), text("Submitted to"),
                                              select("Star rating", ["1 star", "2 star", "3 star", "4 star", "5 star"]), text("Conducted by / assessor with qualification")]),
        sec("Factory profile", text("Year of establishment"), num("Manpower strength"), text("Working hours"), text("Lunch break"), text("Weekly holiday"), text("National festival holidays"),
            text("Buyers"), text("Production"), num("Area of factory set up (sq m)")),
        table_sec("Areas and facilities", table("areas", "Area inventory", [
            colsel("Area", ["Production", "Fabric storage", "Cutting", "Packing", "Finished goods storage", "Boiler plant", "Power house", "Security office", "Compressor room", "Hydrant tank",
                            "Parking", "Guest house", "Laboratory", "Waste yard", "Shelters and rest room", "Creche", "Canteen", "Other"], "area"),
            colnum("Area (sq m)", "area_sqm"), colnum("Number / capacity", "count"), col("Remarks", "remarks", width=30)], min_rows=0)),
        table_sec("Statutory licences and registrations", table("licences", "Licences, approvals and certificates", [
            colsel("Particulars", ["Factory plan approval", "Factory licence", "Stability certificate", "Fire licence", "TNPCB consent (CTE / CTO)", "Hazardous waste authorisation", "Standing orders",
                                   "Sanitary certificate", "Pressure vessel (Form 8)", "Boiler licence (Form V)", "Food safety licence (canteen)", "Form 25B exemption", "OT exemption letter",
                                   "Inter-state migrant workmen registration", "Gen-set installation / safety certificate", "Electrical inspector approval", "Lift / hoist fitness certificate", "Other"], "particulars", width=26),
            col("Registration number", "number"), coldate("Valid from", "from"), coldate("Valid up to", "upto"), col("Issuing authority", "authority", width=24), colsel("Status", ["Valid", "Expiring soon", "Expired", "Not applicable"], "status")], min_rows=1)),
        sec("Systems inspection", *[select(item, ["Satisfactory", "Needs improvement", "Unsatisfactory", "Not applicable"], w=12) for item in systems] + [area("Inspection remarks")], cols=1),
        table_sec("Non-conformities and recommendations", table("findings", "Findings", [
            col("Observation", "observation", width=28), col("Clause / requirement", "clause"), colsel("Risk", ["Critical", "High", "Medium", "Low"], "risk"), col("Recommendation", "recommendation", width=24),
            coldate("Target date", "target"), colsel("Status", STATUS, "status")], min_rows=0)),
        signoff(),
    ])


def safety_calculations():
    reset_keys()
    return form("Safety Performance Calculations", "Accident and incident rates (LTIFR, TRIR, AFR, ASR, incident rate), man-hours, fire extinguisher coverage and risk score.", "SPC", [
        header("Safety calculations"),
        sec("Man-hours", num("Number of employees", key="employees"), num("Working hours per day", key="hours"), num("Working days", key="days"),
            formula("Total man-hours worked", "employees * hours * days", key="manhours")),
        sec("Accident and incident data", num("Lost time injuries (LTI)", key="lti"), num("Recordable cases", key="recordable"), num("Total accidents", key="accidents"),
            num("Lost workdays", key="lost_days"), num("Incidents", key="incidents")),
        sec("Rates",
            formula("LTIFR = LTI x 1,000,000 / man-hours", "lti * 1000000 / manhours", key="ltifr"),
            formula("TRIR = recordable cases x 200,000 / man-hours", "recordable * 200000 / manhours", key="trir"),
            formula("AFR = accidents x 1,000,000 / man-hours", "accidents * 1000000 / manhours", key="afr"),
            formula("ASR = lost workdays x 1,000,000 / man-hours", "lost_days * 1000000 / manhours", key="asr"),
            formula("Incident rate = incidents x 200,000 / employees", "incidents * 200000 / employees", key="incident_rate")),
        sec("Fire extinguisher coverage", num("Floor area to protect (sq m)", key="floor_area"), num("Coverage per 6 kg ABC extinguisher (sq m)", key="coverage", default=225),
            num("Extinguishers installed", key="installed"), formula("Extinguishers required", "CEIL(floor_area / coverage)", key="required"),
            formula("Shortfall (negative = surplus)", "required - installed", key="shortfall")),
        sec("Risk rating", num("Likelihood (1-5)", key="likelihood"), num("Severity (1-5)", key="severity"),
            formula("Risk score = likelihood x severity", "likelihood * severity", key="risk_score"), select("Risk level", ["Very low", "Low", "Medium", "High"])),
        signoff(),
    ])


def safety_equipment_report():
    reset_keys()
    return form("Safety Equipment Purchase and Cost Report", "OH&S division register of safety equipment purchased: indent, date, item, quantity, rate and cost.", "SEC", [
        header("Safety equipment purchase"),
        table_sec("Purchases", table("purchases", "Safety equipment purchases", [
            col("Ref no", "ref"), col("Indent no", "indent"), coldate("Indent date", "indent_date"), col("Item", "item", width=24), colnum("Quantity", "qty"), colnum("Rate (Rs)", "rate"),
            colformula("Amount (Rs)", "qty * rate", "amount", total=True), col("Vendor", "vendor")], min_rows=1, totals=True)),
        signoff(),
    ])


def safety_training_plan():
    reset_keys()
    return form("Safety and Compliance Training Plan", "Annual training plan: training type, frequency, participants and the months planned or completed.", "STP", [
        header("Training plan", extra=[text("Plan year")]),
        table_sec("Training plan", table("plan", "Training plan", [
            colsel("Type of training", ["Induction training", "First aid training", "ETI base code awareness", "Buyer code awareness", "WRAP and CT-PAT awareness", "GOTS / OCS / RCS / GRS awareness",
                                        "Mock drill", "Fire fighting with fire extinguisher", "Health, safety and environment", "PPE usage and workplace safety", "Fire hydrant and hose reel",
                                        "Risk assessment", "Emergency response team", "Chemical handling", "Electrical safety", "Other"], "training", width=22),
            colnum("Frequency (per year)", "frequency"), col("Participants", "participants")] + [colcheck(m[:3], f"m_{m[:3].lower()}") for m in MONTHS], min_rows=1)),
        signoff(),
    ])


def risk_engineering():
    reset_keys()
    return form("Risk Engineering Compliance Report", "Site risk engineering review: location, hazards, controls, recommendations and compliance rating.", "REC", [
        header("Risk engineering"),
        sec("Site", text("Latitude and longitude"), text("Occupancy / nature of operations"), num("Built-up area (sq m)"), num("Number of buildings")),
        checklist("Protection and controls", ["Fire detection and alarm system", "Sprinkler / hydrant system", "Portable fire extinguishers", "Fire water storage and pumps", "Electrical thermography and earthing tests",
                                              "Lightning protection", "Housekeeping and storage practice", "Hot work permit system", "Emergency response plan and drills", "Security and access control"],
                  options=["Adequate", "Needs improvement", "Inadequate", "Not applicable"]),
        table_sec("Recommendations", table("recommendations", "Recommendations", [
            col("Recommendation", "recommendation", width=34), colsel("Priority", ["Critical", "High", "Medium", "Low"], "priority"), col("Responsible", "owner"), coldate("Target date", "target"), colsel("Status", STATUS, "status")], min_rows=0)),
        signoff(),
    ])


# ───────────────────────────── LEGAL ─────────────────────────────

def legal_register(name, prefix, description):
    def build():
        reset_keys()
        return form(name, description, prefix, [
            header("Legal register ref", extra=[text("Revision no"), date("Revision date")]),
            table_sec("Legal and other requirements", table("register", "Requirements and compliance status", [
                colsel("Category", ["Safety", "Health", "Environment", "Labour", "Fire", "Electrical", "Boiler and pressure vessel", "Construction", "Other"], "category"),
                col("Act / rule no", "act", width=16), col("Requirement to be met", "requirement", width=24), col("Responsibility", "responsibility"), colsel("Frequency", ["One time", "Daily", "Weekly", "Monthly", "Quarterly", "Half-yearly", "Annual", "As required"], "frequency"),
                col("Records / evidence", "records"), colsel("Compliance", COMPLIANCE, "compliance"), col("Remarks", "remarks")], min_rows=1)),
            signoff(),
        ])
    return build


def factory_profile_checklist():
    reset_keys()
    return form("Factory Profile and Legal Documents Checklist", "Documents to keep ready for a social compliance / buyer audit: profile, recruitment, wages, employee treatment, health and safety.", "FPL", [
        header("Factory profile"),
        checklist("Factory profile", ["Company profile", "Business registration licence", "Tax registration", "Organisation chart", "Land use / construction permit", "List of machineries", "Company vehicle list",
                                      "Production process flow chart", "List of subcontractors", "Dormitory details", "List of fire equipment", "Certificates by other independent organisations (SA8000, ICTI etc.)",
                                      "Building approval plan (architectural and structural)", "Building layout approval from fire service and fire occupancy certificate", "Employee name list"]),
        checklist("Recruitment, hiring and termination", ["Recruitment policies and age verification process", "Child labour remediation procedure", "Security service contract", "Training records other than health and safety",
                                                          "Work permits (internal / external)", "Employment contracts", "Job description and application form", "Labour broker contract and dispatched worker records",
                                                          "Apprenticeship programme", "Adolescent worker registration and health records", "Migrant worker permits, passports and contracts", "Termination policy and procedure", "Employee resignation records"]),
        checklist("Wages and benefits", ["Minimum wage notification", "Payroll (wage records)", "Full and final settlement", "Leave records", "Bonus records", "Provident fund / ESI records", "Social security and insurance records",
                                         "Receipts for tax and social security remittances", "Maternity / paternity leave records", "Piece rate wage sheet", "Annual and paid leave payment records", "Bank transfer records for wages"]),
        checklist("Employee treatment and involvement", ["Disciplinary procedure records", "Worker / management committee meeting notes", "Trade union records", "Grievance register and mechanism",
                                                         "Organisation chart of committees", "Anti-harassment, abuse and non-discrimination policies", "Freedom of association procedure"]),
        checklist("Health and safety", ["Building plan approval / permit", "Fire NOC", "Gen-set installation approval", "Building stability certificate", "Boiler / pressure vessel certificates", "Electrical inspection records",
                                        "Fire drill records", "First aid records and trained first aiders", "PPE issue records", "Risk assessment", "Accident register", "Health check-up records"]),
        signoff(),
    ], form_type="CHECKLIST")


# ───────────────────────────── SOCIAL / LABOUR / PAYROLL ─────────────────────────────

def wrap_site_info():
    reset_keys()
    return form("WRAP Site Information and Checklist", "Facility details sheet used for WRAP / social compliance audits: ownership, workforce, wages, statutory records and fire safety.", "WSI", [
        header("WRAP ID"),
        sec("Facility", text("WRAP ID no and validity"), text("Contact person"), text("Mobile no"), text("Email id"), text("Company registration number"), text("Production / shift timings"),
            text("Main brands / buyers"), text("Production processes"), text("Hazardous process, if any"), text("Facility size (sq ft)"), num("Number of buildings"), text("Production process at each floor"),
            text("Do you share any building with other facilities"), text("Audits in the past 6 months"), text("Any sub-contracted activities"), text("Top suppliers - yarn / fabric / knitting / dyeing"),
            text("Offsite dormitory details"), text("Dormitory details")),
        sec("Workforce", num("Employees - male"), num("Employees - female"), num("On roll - male"), num("On roll - female"), num("Present - male"), num("Present - female"),
            num("Migrant workers - male"), num("Migrant workers - female"), text("Languages spoken by employees"), text("Languages spoken by management"), text("Age of the youngest employee"),
            text("Date of birth of youngest employee"), text("Date of joining"), text("Employee id no")),
        sec("Wages and benefits", num("Minimum wage - helper"), num("Minimum wage - tailor"), num("Legal minimum wage paid by the facility - helper"), num("Paid by the facility - tailor"),
            num("Highest wage paid"), text("Social security payment dates (last 3 months)"), num("ESI paid workers"), num("EPF paid workers"), text("Overtime details (last 3 months)"),
            text("Minimum / maximum overtime per week")),
        sec("Statutory and safety", text("Factory licence no / date / validity"), text("Building plan approval no / date"), text("Designation of the approving official"), text("Stability certificate no / date / issued by"),
            text("Fire licence no / date"), text("Pollution consent - air and water"), num("Number of toilets - male"), num("Number of toilets - female"), text("Fire extinguishers / first aid boxes"),
            text("Fire drills - last two drills, evacuation time"), date("Planned next fire drill"), date("Latest risk assessment"), text("Last internal audit date and frequency")),
        signoff(),
    ])


def payroll_checklist():
    reset_keys()
    mk = lambda title, items: checklist(title, items, options=["Verified - no issue", "Issue identified", "Not applicable"])
    return form("Payroll Audit Checklist", "Annual payroll audit: timeframe, reports, roster, register, time clock, variable pay, statutory deductions and reconciliations.", "PAY", [
        header("Payroll audit", extra=[date("Audit period start"), date("Audit period end"), text("Lookback period"), text("Stakeholders / auditors")]),
        mk("1. Generate reports and gather information", ["Employee roster", "Payroll register", "Time clock data (hours worked and overtime)", "General ledger", "Bank statements (payroll bank account)"]),
        mk("2. Verify employee roster data", ["Are all the employees listed active?", "Are any employees terminated, furloughed or on leave of absence?", "Are there any employees management does not recognise?", "Are there any employees missing?"]),
        mk("3. Verify payroll register data", ["Are all employee pay rates listed correctly?", "Are the pay periods correct?", "Do the number of payrolls match the lookback period?", "Is payroll completed on time?",
                                              "Are employees paid on time every payday?", "Were all pay rate changes inputted?", "Did all pay rate changes take effect on time?", "Are employees classified correctly?"]),
        mk("4. Verify time clock data", ["Are employees paid for all time worked?", "Are overtime hours calculated and paid correctly?", "Were all time adjustments recorded correctly and approved?"]),
        mk("5. Verify variable and atypical payments", ["Is there documentation outlining variable payments (bonus, incentives, shift allowances)?", "Are all variable payments labelled correctly?", "Are all variable payments calculated and paid correctly?",
                                                       "Is there documentation outlining paid leave and sick pay procedures?", "Are leave payments calculated and paid correctly?", "Is there documentation supporting atypical payments (arrears, reimbursements)?"]),
        mk("6. Verify statutory deductions and returns", ["Is PF deducted and remitted on time?", "Is ESI deducted and remitted on time?", "Is professional tax deducted and remitted?", "Is TDS deducted and deposited where applicable?",
                                                         "Is the labour welfare fund deducted and remitted?", "Does statutory data match the returns filed?"]),
        mk("7. Verify additional employee deductions", ["Are insurance premium deductions calculated correctly?", "Are any applicable attachments deducted and processed correctly?", "Is there documentation for other deductions (uniform, advances)?"]),
        mk("8. Reconcile payroll with the general ledger", ["Do payroll expenses in the ledger match the payroll register?", "Are statutory remittances recorded properly?", "Are all employee deductions recorded correctly?"]),
        mk("9. Reconcile payroll with bank accounts", ["Does the payroll bank balance match the payroll register?", "Do bank transactions match the payroll register?", "Were any employees paid twice?",
                                                       "Are there any unaccounted transactions?", "Are all bank charges correct?"]),
        table_sec("10. Payroll processes in need of optimisation", table("faulty", "Faulty processes and suggested fixes", [col("Faulty process", "process", width=34), col("Suggested fix(es)", "fix", width=34), col("Auditor initials", "initials")], min_rows=0)),
        signoff(),
    ])


def wage_register_audit():
    reset_keys()
    return form("Wage Register and CTC Audit", "Sample wage records: shift wage, basic, DA, HRA, gross, PF, ESI and net pay per employee for the audited period.", "WRA", [
        header("Wage register audit", extra=[text("Wage period"), num("Employees sampled")]),
        table_sec("Sample employee wage records", table("wages", "Wage records", [
            col("Emp no", "emp_no"), col("Name", "name", width=16), col("Designation", "designation"), colnum("Days worked", "days"), colnum("Wage / day", "rate"), colnum("Basic", "basic"), colnum("DA", "da"), colnum("HRA", "hra"),
            colnum("Overtime", "ot"), colformula("Gross", "basic + da + hra + ot", "gross", total=True), colnum("PF", "pf", total=True), colnum("ESI", "esi", total=True), colnum("Other deductions", "other", total=True),
            colformula("Net pay", "basic + da + hra + ot - pf - esi - other", "net", total=True)], min_rows=1, totals=True)),
        checklist("Compliance checks", ["Minimum wage paid as per notification", "Wage slips issued", "Overtime paid at double rate and within legal limits", "PF and ESI deducted and remitted", "Wages paid on or before the due date",
                                        "Attendance matches wage register"], options=COMPLIANCE),
        signoff(),
    ])


def full_final_settlement():
    reset_keys()
    return form("Full and Final Settlement Statement", "Employee exit settlement: salary particulars (actual vs earned), deductions, leave encashment, gratuity and net payable.", "FNF", [
        header("F&F statement"),
        sec("Employee", text("Name of the employee", req=True), text("Employee ID"), text("Designation"), text("Department"), date("F&F date"), date("Joining date"), date("Date of resignation"),
            date("Date of leaving"), text("For the month")),
        sec("Salary particulars", num("Total days in the month", key="total_days", default=30), num("Paid days", key="paid_days")),
        sec("Earnings (actual / earned)",
            num("Basic salary - actual", key="a_basic"), formula("Basic salary - earned", "a_basic * paid_days / total_days", key="e_basic"),
            num("HRA - actual", key="a_hra"), formula("HRA - earned", "a_hra * paid_days / total_days", key="e_hra"),
            num("Conveyance allowance - actual", key="a_conv"), formula("Conveyance - earned", "a_conv * paid_days / total_days", key="e_conv"),
            num("Medical allowance - actual", key="a_med"), formula("Medical - earned", "a_med * paid_days / total_days", key="e_med"),
            num("Special allowances - actual", key="a_spl"), formula("Special allowances - earned", "a_spl * paid_days / total_days", key="e_spl"),
            num("Others - actual", key="a_oth"), formula("Others - earned", "a_oth * paid_days / total_days", key="e_oth"),
            formula("Total earnings (actual)", "a_basic + a_hra + a_conv + a_med + a_spl + a_oth", key="a_total"),
            formula("Total earnings (earned)", "e_basic + e_hra + e_conv + e_med + e_spl + e_oth", key="e_total")),
        sec("Less deductions", num("EPF", key="d_epf"), num("Medical insurance", key="d_med"), num("Professional tax", key="d_pt"), num("Salary advance", key="d_adv"),
            num("Notice pay", key="d_notice"), num("Others", key="d_oth"), formula("Total deductions", "d_epf + d_med + d_pt + d_adv + d_notice + d_oth", key="d_total")),
        sec("Other earnings", num("Leave encashment - eligible days", key="le_days"), num("Leave encashment - per day rate", key="le_rate"), formula("Leave encashment amount", "le_days * le_rate", key="le_amount"),
            num("Gratuity - years of service", key="g_years"), num("Last drawn basic + DA (monthly)", key="g_wage"), formula("Gratuity (15 / 26 x wage x years)", "ROUND(15 / 26 * g_wage * g_years, 0)", key="g_amount"),
            num("Bonus / other payable", key="bonus")),
        sec("Settlement", formula("Net settlement payable", "e_total - d_total + le_amount + g_amount + bonus", key="net_payable"), select("Mode of payment", ["Bank transfer", "Cheque", "Cash"]), date("Payment date")),
        signoff(),
    ], form_type="STANDARD")


# ───────────────────────────── TEXTILE STANDARDS ─────────────────────────────

def standard_checklist(title, prefix, key, description):
    def build():
        reset_keys()
        return form(title, description, prefix, [
            header(title, extra=[text("Certification body"), text("Scope certificate no"), select("Concerned activity", ["Main scope holder", "Group subsidiary unit", "Subcontractor", "Group facility"])]),
            checklist("Documents to be presented at the audit", CHECKLISTS[key], options=["Available and valid", "Partly available", "Not available", "Not applicable"]),
            signoff("All submitted documents must be valid and original. Manual alteration of originals is treated as falsification."),
        ], form_type="CHECKLIST")
    return build


def textile_process_forms():
    reset_keys()
    return form("Processing Aids and Process Declaration (GOTS / GRS)", "Chemicals and auxiliaries used in processing with supplier, certification and positive-list status; process description sheet.", "PAD", [
        header("F007 / F425"),
        sec("Process", text("Products category(ies)"), text("Standard(s)"), area("Process description (step by step)")),
        table_sec("Processing aids and auxiliaries", table("aids", "Processing aids", [
            col("Product / trade name", "name"), col("Supplier", "supplier"), col("Function", "function"), col("Composition", "composition"), colsel("GOTS / GRS positive list", ["Listed", "Not listed", "Under review"], "positive_list"),
            colsel("MSDS / certificate available", ["Yes", "No"], "msds"), col("Responsible party", "owner")], min_rows=1)),
        signoff(),
    ])


def reclaimed_material_declaration():
    reset_keys()
    return form("Reclaimed Material Supplier Declaration (GRS F422)", "Reclaimed material declaration form: Part A material collector / own processing details and quantities.", "GRD", [
        header("F422(GRS)v01en"),
        sec("Part A - reclaimed material declaration", select("Source of reclaimed material", ["Sold by a material collector / concentrator", "Collected from own processing"]), text("Collector / concentrator name and address"),
            text("Material description"), select("Material type", ["Pre-consumer", "Post-consumer"]), num("Quantity (kg)"), text("Origin of the material"), text("Transaction certificate / invoice no")),
        table_sec("Material details", table("materials", "Reclaimed materials", [col("Material", "material"), col("Origin", "origin"), colnum("Quantity (kg)", "kg", total=True), col("Invoice / TC no", "invoice"), coldate("Date", "date")], min_rows=1, totals=True)),
        sec("Declaration", note("We declare that the reclaimed material described above was not produced from virgin material and is traceable to the source stated."), text("Name and designation of signatory"), date("Date of declaration")),
        signoff(),
    ])


def audit_requirements_listout():
    reset_keys()
    return form("Audit and Requirement Documents Listout", "Third-party and buyer audits the facility is subject to, with the audit body, buyer and audit type.", "ARD", [
        header("Audit requirement list"),
        table_sec("Audits and requirement documents", table("audits", "Audits", [
            col("Audit / verification and certification", "audit", width=26), col("Audit / verification body", "body"), col("Buyer", "buyer"),
            colsel("Audit type", ["Announced", "Semi-announced", "Unannounced"], "audit_type"), coldate("Last audit date", "last"), coldate("Next due", "next"), colsel("Status", ["Valid", "Due", "Overdue", "Not applicable"], "status")], min_rows=1)),
        signoff(),
    ])


# ───────────────────────────── CATALOGUE ─────────────────────────────

CATALOGUE = [
    *EXTRA_CATALOGUE,
    *STEP3_CATALOGUE,
    # name, builder, module_type, category, auditor type codes
    ("Total Water Management Diagnosis", water_diagnosis, "AUDIT", "Water", ["WATER"]),
    ("Water Audit - Garment Unit Questionnaire", water_garment_questionnaire, "AUDIT", "Water", ["WATER"]),
    ("Monthly Water Consumption Register", water_register, "AUDIT", "Water", ["WATER"]),
    ("ETP Functionality Assessment", etp_assessment, "ASSESSMENT", "Environment", ["ENV"]),
    ("ETP Assessment Document List", etp_document_list, "ASSESSMENT", "Environment", ["ENV"]),
    ("Environmental Aspects and Impacts Register", aspects_register, "RISK", "Environment", ["ENV"]),
    ("Corrective Action Plan Acknowledgement", cap_report, "AUDIT", "Environment", ["ENV", "SOCIAL"]),
    ("GHG Emissions Data Collection", ghg_collection, "STUDY", "Energy and GHG", ["GHG"]),
    ("Energy Consumption and Target Tracker", energy_tracker, "STUDY", "Energy and GHG", ["GHG"]),
    ("Baseline Calculation", baseline_calculation, "STUDY", "Energy and GHG", ["GHG"]),
    ("Statutory Safety Audit (IS 14489)", statutory_safety_audit, "AUDIT", "Safety", ["SAFETY"]),
    ("Safety Performance Calculations", safety_calculations, "ASSESSMENT", "Safety", ["SAFETY", "FIRE"]),
    ("Safety Equipment Purchase and Cost Report", safety_equipment_report, "STUDY", "Safety", ["SAFETY"]),
    ("Safety and Compliance Training Plan", safety_training_plan, "STUDY", "Safety", ["SAFETY", "SOCIAL"]),
    ("Risk Engineering Compliance Report", risk_engineering, "RISK", "Safety", ["SAFETY", "FIRE"]),
    ("Legal Register - Tamil Nadu Factories", legal_register("Legal Register - Tamil Nadu Factories", "LRT", "Legal and other requirements under the Factories Act and Tamil Nadu Factories Rules with compliance status."), "AUDIT", "Legal", ["LEGAL"]),
    ("Legal Register - Construction", legal_register("Legal Register - Construction", "LRC", "Evaluation of compliance to legal and other requirements for a construction project."), "AUDIT", "Legal", ["LEGAL"]),
    ("Factory Profile and Legal Documents Checklist", factory_profile_checklist, "AUDIT", "Legal", ["LEGAL", "SOCIAL"]),
    ("WRAP Site Information and Checklist", wrap_site_info, "AUDIT", "Social Compliance", ["SOCIAL"]),
    ("Payroll Audit Checklist", payroll_checklist, "AUDIT", "Payroll", ["PAYROLL"]),
    ("Wage Register and CTC Audit", wage_register_audit, "AUDIT", "Payroll", ["PAYROLL"]),
    ("Full and Final Settlement Statement", full_final_settlement, "STUDY", "Payroll", ["PAYROLL"]),
    ("GOTS Manufacturing - Audit Requirements", standard_checklist("GOTS Manufacturing - Audit Requirements", "GOM", "gots_manufacturing", "Documents and records for a GOTS manufacturing audit."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("GOTS Trading with Storage", standard_checklist("GOTS Trading with Storage", "GTS", "gots_trading_storage", "Documents and records for a GOTS trading audit (with storage)."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("GOTS Trading without Storage", standard_checklist("GOTS Trading without Storage", "GTN", "gots_trading_nostorage", "Documents and records for a GOTS trading audit (without storage)."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("GRS Manufacturing - Audit Requirements", standard_checklist("GRS Manufacturing - Audit Requirements", "GRM", "grs_manufacturing", "Documents and records for a Global Recycled Standard manufacturing audit."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("GRS Trading with Storage", standard_checklist("GRS Trading with Storage", "GRT", "grs_trading_storage", "Documents and records for a GRS trading audit (with storage)."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("GRS Trading without Storage", standard_checklist("GRS Trading without Storage", "GRN", "grs_trading_nostorage", "Documents and records for a GRS trading audit (without storage)."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("OCS Manufacturing - Audit Requirements", standard_checklist("OCS Manufacturing - Audit Requirements", "OCM", "ocs_manufacturing", "Documents and records for an Organic Content Standard manufacturing audit."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("OCS Trading - Audit Requirements", standard_checklist("OCS Trading - Audit Requirements", "OCT", "ocs_trading", "Documents and records for an OCS trading audit."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("RCS Manufacturing - Audit Requirements", standard_checklist("RCS Manufacturing - Audit Requirements", "RCM", "rcs_manufacturing", "Documents and records for a Recycled Claim Standard manufacturing audit."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("RCS Trading - Audit Requirements", standard_checklist("RCS Trading - Audit Requirements", "RCT", "rcs_trading", "Documents and records for an RCS trading audit."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("RWS Manufacturing - Audit Requirements", standard_checklist("RWS Manufacturing - Audit Requirements", "RWM", "rws_manufacturing", "Documents and records for a Responsible Wool Standard manufacturing audit."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("RWS Trading - Audit Requirements", standard_checklist("RWS Trading - Audit Requirements", "RWT", "rws_trading", "Documents and records for an RWS trading audit."), "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("Processing Aids and Process Declaration", textile_process_forms, "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("Reclaimed Material Supplier Declaration", reclaimed_material_declaration, "AUDIT", "Textile Standards", ["TEXSTD"]),
    ("Audit and Requirement Documents Listout", audit_requirements_listout, "AUDIT", "Textile Standards", ["TEXSTD", "SOCIAL", "LEGAL"]),
]

# Existing demo modules keep working under the matching types.
EXISTING_MODULE_TYPES = {
    "Fire Safety Compliance Audit": ["FIRE", "SAFETY"],
    "Workplace Hazard Assessment": ["SAFETY"],
    "Chemical Handling Risk Register": ["ENV"],
    "Working Conditions Study": ["SOCIAL"],
    "Hot Work Permit": ["SAFETY", "FIRE"],
}

AUDITOR_TYPES = [
    # code, name, specialization, description
    ("ELEC", "Electrical Safety Auditor", "Electrical Safety", "Electrical safety, isolation (LOTO) permits and electrical installation inspections."),
    ("FOOD", "Food Safety Auditor", "Food Safety", "FSSAI, GMP and HACCP based food safety audits and studies."),
    ("WATER", "Water Auditor", "Environmental", "Water audits, water balance, consumption registers and water management diagnosis."),
    ("ENV", "Environmental Auditor", "Environmental", "ETP assessments, environmental aspects and impacts, corrective action plans."),
    ("GHG", "Energy and GHG Auditor", "Environmental", "Energy consumption, greenhouse gas inventory (scope 1, 2 and 3) and reduction targets."),
    ("SAFETY", "Safety Auditor", "Manufacturing", "Statutory safety audit (IS 14489), safety performance, equipment and training."),
    ("FIRE", "Fire Safety Auditor", "Fire Safety", "Fire safety, emergency preparedness and risk engineering."),
    ("LEGAL", "Statutory and Legal Compliance Auditor", "Manufacturing", "Legal registers and statutory documents under factory, labour and environment laws."),
    ("SOCIAL", "Social Compliance Auditor", "Manufacturing", "WRAP, Sedex and buyer social compliance audits, training and corrective actions."),
    ("PAYROLL", "Labour and Payroll Auditor", "Manufacturing", "Payroll, wage register, statutory deductions and full and final settlements."),
    ("TEXSTD", "Textile Standards Auditor", "Textiles", "GOTS, GRS, OCS, RCS and RWS certification audit requirements and declarations."),
]
