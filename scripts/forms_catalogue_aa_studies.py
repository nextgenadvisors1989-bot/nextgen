"""Two more of the client's reports (2026-11-05), built from the files the client sent:

    water-audit-final-report-2021 (2).pdf   (56 pages: a water audit as per the CGWA guidelines, for an opencast coal mine)  -> Water Audit Report
    0_0_17_Jul_2020_..._EIAReport.pdf       (273 pages: the EIA report of a 5 MLD common effluent treatment plant)           -> Environmental Impact Assessment Report

Chapters, tables and lists of the two documents are the sections, fields and tables of the forms (nothing of the sample project is pre-filled), with the
text editor for the narrative parts and attach fields for the maps, figures, photographs, lab reports and annexures. The filled forms print as reports.
"""
from forms_dsl import (
    area, checklist, col, coldate, colformula, colnum, colsel, date, form, formula, header, multi, note, num, picture, reset_keys, rich, sec, select,
    signoff, table, table_sec, text, upload, yesno,
)

PRIORITY = ["Critical", "High", "Medium", "Low"]
STATUS = ["Open", "In progress", "Closed", "Verified"]
PHASE = ["Construction phase", "Operational phase", "Both phases"]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def cover(title_default, *extra):
    return sec("Cover page",
               picture("Logo of the organisation / client", key="logo", help="PNG or JPEG; printed on the cover of the downloaded report"),
               text("Report title", key="report_title", default=title_default, w=8), text("Month and year of the report", key="period", w=4),
               text("Prepared by (consultant / auditing organisation)", key="prepared_by"), text("Consultant address, e-mail and website", key="consultant_contact"),
               *extra, cols=2)


# ───────────────────────────── water audit (CGWA) ─────────────────────────────

def water_audit_report():
    reset_keys()
    kl = lambda label, key, **kw: colnum(label, key, **kw)  # noqa: E731
    return form("Water Audit Report", "Water audit report as per the CGWA guidelines (Ministry of Jal Shakti): consumption trends, sources, supply and distribution, water balance, "
                "specific consumption, pump performance, treatment, rain water harvesting, season-wise data, conservation opportunities and the implementation plan.", "WAR", [
        cover("Water Audit Report", text("As per the guidelines of", key="guidelines", default="CGWA, Ministry of Jal Shakti")),
        header("Water audit", extra=[text("Project name (mine / plant / industry)", key="project_name"), text("District and state", key="district_state"),
                                     text("Audit period (financial years covered)", key="audit_period"), text("Water audit team", key="audit_team")]),
        sec("Acknowledgement and certificate",
            rich("Acknowledgement (thanks to the management and the persons who supported the audit)", key="acknowledgement"),
            *checklist_fields_certificate(), cols=1),
        table_sec("Abbreviations", table("abbreviations", "Abbreviations used in the report", [col("Abbreviation", "abbreviation"), col("Full form", "meaning", width=60)], min_rows=0)),
        sec("Executive summary",
            rich("Executive summary (overview of the water distribution system and water usage, major sources, consumption areas, waste water treatment facilities, water saving opportunities and the recommendations)", key="summary"),
            num("Total water withdrawal in the latest year (KL)", key="total_withdrawal"), num("Total water consumption in the latest year (KL)", key="total_consumption"),
            num("Water recycled / reused (KL)", key="recycled"), formula("Share recycled / reused (%)", "IF(total_consumption == 0, 0, ROUND(recycled / total_consumption * 100, 2))", key="recycled_share"),
            num("Water saving potential identified (KL per year)", key="saving_potential"), cols=2),
        sec("1. Introduction",
            rich("1.1 About the industry / project (location, products, capacity, process)", key="industry_profile"),
            text("Location (village, block, district, state)", key="location", w=12), text("Latitude and longitude", key="latlong"), text("Nearest water body / river", key="water_body"),
            upload("Fig 1 - Process flow chart", key="fig_process"), upload("Location map and layout of the site", key="fig_location"), cols=2),
        sec("2. Scope of work",
            multi("The scope of the audit covers", ["Water sources and their metering", "Water supply and distribution network", "Water balance (inflow and outflow)", "Area-wise and use-wise consumption",
                                                      "Pump performance evaluation", "Raw water and waste water treatment", "Rain water harvesting and artificial recharge", "Water conservation opportunities",
                                                      "Implementation plan"], key="scope", w=12),
            rich("Scope of work - additional points", key="scope_text"), cols=1),
        sec("3. Methodology of the study",
            rich("Methodology (data collection, site visits, measurements, interviews, analysis)", key="methodology"), cols=1),
        table_sec("Instruments used for the measurements", table("instruments", "Instruments used", [
            col("Instrument", "instrument", width=26), col("Make / model", "model"), col("Parameter measured", "parameter"), coldate("Calibration date", "calibration"), colsel("Calibrated", ["Yes", "No", "Not known"], "calibrated")], min_rows=0)),
        table_sec("4.1 Water consumption trends (last 3 years)", table("trends", "Water withdrawal and consumption by financial year", [
            col("Financial year", "year"), colsel("Month", MONTHS, "month"), kl("Ground water withdrawal (KL)", "ground", total=True), kl("Surface / mine water withdrawal (KL)", "surface", total=True),
            kl("Other source (KL)", "other", total=True), colformula("Total withdrawal (KL)", "ground + surface + other", "withdrawal", total=True),
            kl("Domestic use (KL)", "domestic", total=True), kl("Industrial / process use (KL)", "industrial", total=True), kl("Dust suppression and plantation (KL)", "dust", total=True),
            colformula("Total consumption (KL)", "domestic + industrial + dust", "consumption", total=True)], min_rows=3, max_rows=60, totals=True)),
        table_sec("4.2 Water sources", table("sources", "Water sources and their metering status", [
            col("Source of water", "source", width=22), colsel("Type", ["Ground water (bore well / tube well)", "Open well", "Mine water / pit", "Surface water / river", "Municipal supply", "Tanker", "Rain water", "Treated waste water", "Other"], "kind"),
            col("Location", "location"), kl("Capacity / yield (KLD)", "capacity"), colsel("Metered", ["Yes", "No", "Partly"], "metered"), col("Permission / NOC", "permission")], min_rows=1)),
        table_sec("Mine pits and reservoirs", table("reservoirs", "Details of pits, reservoirs and storage tanks", [
            col("Pit / reservoir / tank", "name", width=22), kl("Length (m)", "length"), kl("Width (m)", "width"), kl("Depth (m)", "depth"), colformula("Capacity (m3)", "length * width * depth", "capacity", total=True),
            col("Use", "use", width=22)], min_rows=0)),
        sec("4.3 Water supply and distribution",
            rich("Water supply and distribution details (pumping, pipelines, storage, distribution points)", key="distribution"),
            upload("Fig 2 - Water distribution network", key="fig_network"), cols=1),
        sec("4.4 Water balance",
            rich("Water balance (inflow, outflow, losses)", key="balance_text"),
            upload("Fig 3 - Water balance diagram", key="fig_balance"), upload("Fig 4 - Breakup of water consumption", key="fig_breakup"), cols=1),
        table_sec("Water balance table", table("balance", "Water balance (KLD)", [
            colsel("Inflow / outflow", ["Inflow - ground water", "Inflow - mine water", "Inflow - surface water", "Inflow - rain water", "Inflow - other", "Outflow - domestic", "Outflow - process",
                                        "Outflow - dust suppression", "Outflow - plantation", "Outflow - evaporation", "Outflow - discharge", "Outflow - recycled", "Outflow - other"], "item", width=30),
            col("Description", "description", width=30), kl("Quantity (KLD)", "quantity", total=True)], min_rows=4, max_rows=40, totals=True)),
        table_sec("Area-wise water consumption", table("area_wise", "Area-wise water consumption in the plant", [
            col("Area / section", "area", width=40), kl("Water consumption (KLD)", "consumption", total=True), kl("Share (%)", "share")], min_rows=3, max_rows=60, totals=True)),
        table_sec("Raw water withdrawal by month", table("withdrawal", "Total raw water withdrawal", [
            col("Financial year", "year"), colsel("Month", MONTHS, "month"), kl("Withdrawal (KL)", "quantity", total=True)], min_rows=3, max_rows=60, totals=True)),
        table_sec("4.5 Specific water consumption", table("specific", "Water consumption per tonne of product (KL per tonne)", [
            col("Financial year", "year"), kl("Production (tonnes)", "production", total=True), kl("Water consumption (KL)", "water", total=True),
            colformula("Specific consumption (KL per tonne)", "IF(production == 0, 0, ROUND(water / production, 3))", "specific")], min_rows=1, max_rows=20, totals=True)),
        table_sec("4.6 Recommendations on water usage", table("water_recommendations", "Recommendations", [
            col("Recommendation", "recommendation", width=40), kl("Saving potential (KL per year)", "saving", total=True), kl("Investment (Rs)", "cost", total=True), colsel("Priority", PRIORITY, "priority"),
            col("Responsible", "owner")], min_rows=1, totals=True)),
        table_sec("4.7 Pump performance evaluation", table("pumps", "Rated and measured parameters of the pumps", [
            col("Location / pump", "pump", width=16), col("Make / model", "model"), kl("Rated flow (m3/h)", "rated_flow"), kl("Rated head (m)", "rated_head"), kl("Rated power (kW)", "rated_power"),
            kl("Measured flow (m3/h)", "flow"), kl("Measured head (m)", "head"), kl("Measured power (kW)", "power"),
            colformula("Hydraulic power (kW)", "flow * head * 9.81 / 3600", "hydraulic"), colformula("Overall efficiency (%)", "IF(power == 0, 0, ROUND(flow * head * 9.81 / 3600 / power * 100, 1))", "efficiency")],
            min_rows=1, max_rows=80, description="Hydraulic power = flow (m3/h) x head (m) x 9.81 / 3600. Efficiency = hydraulic power / measured power.")),
        sec("5. Water treatment practices",
            rich("5.1 Raw / fresh water treatment (WTP, RO plant, treatment steps, capacity, reject)", key="raw_treatment"),
            rich("5.2 Waste water treatment and disposal (ETP, STP, capacity, treated water reuse, discharge)", key="waste_treatment"),
            upload("Fig 5 - ETP design / layout", key="fig_etp"), cols=1),
        table_sec("Cost of treatment", table("treatment_cost", "Average cost of treatment", [
            col("Item", "item", width=34), kl("Quantity treated (KL)", "quantity", total=True), kl("Cost (Rs)", "cost", total=True),
            colformula("Cost per KL (Rs)", "IF(quantity == 0, 0, ROUND(cost / quantity, 2))", "per_kl")], min_rows=1, max_rows=30, totals=True)),
        table_sec("6. Rain water harvesting and artificial recharge", table("rwh", "Rain water harvesting structures", [
            col("Structure", "structure", width=20), col("Location", "location"), colsel("Type", ["Recharge pit", "Recharge trench", "Check dam", "Storage pond / pit", "Roof top harvesting", "Recharge well", "Other"], "kind"),
            kl("Catchment area (m2)", "catchment"), kl("Storage / recharge capacity (m3)", "capacity", total=True), col("Condition", "condition")], min_rows=0, totals=True,
            description="Photographs of the structures can be attached below.")),
        sec("Rain water harvesting - figures", rich("Rain water harvesting - observations and potential", key="rwh_text"),
            upload("Photographs of the pits, storage structures and recharge structures", key="rwh_photos"), cols=1),
        table_sec("7. Data analysis - season wise withdrawal and consumption", table("seasons", "Season wise extraction and consumption details", [
            colsel("Season", ["Summer", "Monsoon", "Post-monsoon", "Winter"], "season"), kl("Extraction (KL)", "extraction", total=True), kl("Consumption (KL)", "consumption", total=True),
            colformula("Difference (KL)", "extraction - consumption", "difference", total=True)], min_rows=2, max_rows=8, totals=True)),
        table_sec("Evaporation loss estimation", table("evaporation", "Evaporation loss estimation", [
            col("Reservoir / pit", "reservoir", width=26), kl("Surface area (m2)", "area"), kl("Evaporation rate (mm per day)", "rate"), kl("Days", "days"),
            colformula("Evaporation loss (KL)", "area * rate / 1000 * days", "loss", total=True)], min_rows=0, totals=True)),
        sec("8. Water conservation opportunities",
            rich("8.1 General tips for water conservation", key="tips"),
            rich("8.2 Saving water through monitoring and operational procedures", key="operational_savings"), cols=1),
        table_sec("9. Implementation plan", table("implementation", "Implementation plan", [
            col("Action", "action", width=36), col("Responsible", "owner"), col("Timeline", "timeline"), kl("Cost (Rs)", "cost", total=True), kl("Expected saving (KL per year)", "saving", total=True),
            colsel("Status", STATUS, "status")], min_rows=1, totals=True)),
        sec("10. Annexures - measured data and 11. Annexures - data provided by the client",
            upload("Annexures: measured data (flow, power and level readings)", key="annex_measured"), upload("Annexures: data provided by the client (meter readings, bills, drawings)", key="annex_client"),
            upload("Any other attachment", key="annex_other"), cols=1),
        signoff(),
    ], form_type="AUDIT", report=True)


def checklist_fields_certificate():
    """The certificate of the audit report: four statements the audit team confirms, and who signs."""
    from forms_dsl import _field  # the DSL's own field builder
    items = [
        "The report is based on the data collected at site during the audit and the information provided by the client",
        "The data collection has been carried out diligently and truthfully",
        "All data measuring devices used by the team are in good working condition (state below whether they are calibrated)",
        "All reasonable professional skill, care and diligence have been taken in preparing the water audit report and its contents are a true representation of the facts and figures",
    ]
    return [_field(f"Certified: {text_}", "checkbox", key=f"cert_{i}", w=12) for i, text_ in enumerate(items, start=1)] + [
        text("Signatory of the certificate (name and designation)", key="cert_signatory", w=12)]


# ───────────────────────────── environmental impact assessment ─────────────────────────────

def eia_report():
    reset_keys()
    return form("Environmental Impact Assessment Report", "EIA report of a project: project description, description of the environment (air, noise, soil, water, ecology, socio-economic), impacts and "
                "mitigation, alternatives, monitoring, additional studies, benefits, cost benefit analysis, environmental management plan, summary and disclosure of consultants.", "EIA", [
        cover("Environmental Impact Assessment", text("Project proponent (name and address)", key="proponent", w=12), text("Consultant accreditation (NABET / QCI no.)", key="accreditation")),
        header("EIA report", extra=[text("Project name and capacity", key="project_name"), text("Location (village, taluk, district, state)", key="project_location"),
                                    text("Project proponent", key="proponent_name"), text("Category of the project (EIA notification schedule item)", key="category")]),
        sec("Declarations",
            rich("Undertaking by the project proponent", key="undertaking"), rich("Declaration by the consultant", key="declaration_consultant"), rich("Declaration by the experts contributing to the EIA", key="declaration_experts"),
            upload("Signed undertaking and declarations", key="declaration_files"), upload("Copy of the Terms of Reference (ToR)", key="tor_copy"), cols=1),
        table_sec("ToR compliance", table("tor", "ToR points and compliance", [
            col("ToR point", "point", width=36), col("Compliance / where addressed in the report", "compliance", width=30), col("Page / chapter", "page")], min_rows=0)),
        sec("Chapter I - Introduction",
            rich("1.1 Project intent", key="intent"), rich("1.2 Need for the project", key="need"),
            text("Project proponent: contact person and designation", key="proponent_contact"), text("Proposed project site", key="site"), rich("Application for environmental clearance (EC)", key="ec_application"),
            rich("Importance of the project to the country and region", key="importance"), rich("Objectives, description of activities and structure of the EIA report", key="objectives"),
            upload("Fig - Google image / topographic map / land use map of the 10 km radius study area", key="fig_study_area"), cols=1),
        sec("Chapter II - Project description",
            text("Type of the project", key="project_type"), text("Site accessibility (road, rail, air)", key="accessibility"), rich("Project location and its advantage (connectivity, topography)", key="location_advantage"),
            rich("Area of coverage and the existing industrial scenario", key="coverage"),
            num("Water requirement (KLD)", key="water_req"), text("Source of water", key="water_source"), text("Fuel requirement", key="fuel_req"), num("Manpower (number)", key="manpower"), num("Power requirement (kVA)", key="power_req"),
            rich("Proposed effluent treatment system and waste water characterisation", key="treatment_system"),
            rich("Design criteria and brief description of the process", key="design_criteria"), rich("Concept for the multiple effect evaporator / advanced treatment (if any)", key="advanced_treatment"),
            rich("Design calculations", key="design_calc"), rich("Activities to be performed", key="activities"), rich("Pollution sources: air pollution, waste water generation, treatment and disposal, solid waste", key="pollution_sources"),
            upload("Layout plan, process flow diagram and hydraulic flow diagram", key="fig_design"), cols=1),
        table_sec("Waste water characterisation and inlet quality standards", table("wastewater", "Waste water characterisation against the inlet quality standard", [
            col("Parameter", "parameter", width=24), col("Unit", "unit"), col("Inlet quality standard (CPCB)", "standard"), col("Observed / design value", "value"), col("Discharge standard", "discharge")], min_rows=1, max_rows=60)),
        table_sec("Raw materials (chemicals)", table("chemicals", "Raw material - chemicals, quantity and source", [
            col("Chemical", "chemical", width=26), colnum("Quantity per day / month", "quantity"), col("Unit", "unit"), col("Source / supplier", "source")], min_rows=0)),
        table_sec("Area breakup", table("area_breakup", "Area breakup of the project", [
            col("Component", "component", width=34), colnum("Area (sq m)", "area", total=True), colnum("Share (%)", "share")], min_rows=1, max_rows=40, totals=True)),
        table_sec("Civil tank details and electro-mechanical equipment", table("equipment", "Civil tanks and electro-mechanical equipment", [
            col("Unit / tank / equipment", "unit", width=24), colsel("Treatment stream", ["Low TDS effluent", "High TDS effluent", "Common", "Other"], "stream"), colnum("Number", "number"),
            col("Size / capacity", "capacity"), col("Specification / make", "spec", width=22), colnum("Power (kW)", "power", total=True)], min_rows=1, max_rows=120, totals=True)),
        table_sec("Pollution sources and emissions", table("sources", "Source and emission details", [
            col("Source", "source", width=22), col("Fuel / material", "material"), col("Stack height (m)", "stack"), col("Pollutant", "pollutant"), col("Control measure", "control", width=22)], min_rows=0)),
        table_sec("Solid waste generation", table("solid_waste", "Solid waste generation and disposal", [
            col("Waste", "waste", width=24), colnum("Quantity (kg per day)", "quantity", total=True), col("Category", "category"), col("Disposal method", "disposal", width=24)], min_rows=0, totals=True)),
        sec("Chapter III - Description of the environment",
            rich("3.1 Preamble and the study area (10 km radius), period of the baseline study", key="env_preamble"),
            text("Baseline monitoring period", key="monitoring_period", placeholder="e.g. December 2017 to February 2018"),
            rich("3.2 Meteorological conditions and wind pattern", key="meteorology"), upload("Wind rose diagram", key="fig_windrose"),
            rich("3.3 Ambient air quality: sampling locations, techniques, air quality index, observations", key="air_text"),
            rich("3.4 Noise environment: observations", key="noise_text"), rich("3.5 Soil environment: observation of results", key="soil_text"),
            rich("3.6 Water quality: ground and surface water, heavy metals, observations", key="water_text"),
            rich("3.7 Hydrology and hydrogeology of the area; water management strategy", key="hydro_text"),
            rich("3.8 Biological environment: ecology and biodiversity", key="bio_text"), rich("3.9 Demography and socio-economic environment", key="socio_text"),
            upload("Sampling location map, laboratory reports and photographs", key="env_files"), cols=1),
        table_sec("Meteorological data", table("meteo", "Observed meteorological data", [
            colsel("Month", MONTHS, "month"), colnum("Temperature - maximum (C)", "tmax"), colnum("Temperature - minimum (C)", "tmin"), colnum("Relative humidity (%)", "rh"), colnum("Rainfall (mm)", "rain"),
            colnum("Wind speed (m/s)", "wind"), col("Predominant wind direction", "direction")], min_rows=1, max_rows=24)),
        table_sec("Ambient air quality - monitoring stations", table("aaq_stations", "Details of ambient air quality (AAQ) monitoring stations", [
            col("Station code", "code"), col("Location", "location", width=26), col("Distance and direction from the site", "distance"), colsel("Area class", ["Industrial", "Residential", "Rural", "Sensitive"], "area")], min_rows=1, max_rows=20)),
        table_sec("Ambient air quality - results", table("aaq", "Summary of ambient air quality results", [
            col("Station", "station"), colnum("PM10 (ug/m3)", "pm10"), colnum("PM2.5 (ug/m3)", "pm25"), colnum("SO2 (ug/m3)", "so2"), colnum("NO2 (ug/m3)", "no2"), colnum("CO (mg/m3)", "co"),
            colnum("O3 (ug/m3)", "o3"), colnum("Other", "other"), col("Statistic", "statistic")], min_rows=1, max_rows=60)),
        table_sec("Noise levels", table("noise", "Ambient noise monitoring results", [
            col("Location", "location", width=24), colsel("Zone", ["Industrial", "Commercial", "Residential", "Silence"], "zone"), colnum("Day time Leq dB(A)", "day"), colnum("Night time Leq dB(A)", "night"),
            colnum("Standard - day dB(A)", "std_day"), colnum("Standard - night dB(A)", "std_night")], min_rows=1, max_rows=30)),
        table_sec("Soil analysis", table("soil", "Soil analysis results", [
            col("Parameter", "parameter", width=24), col("Unit", "unit"), col("Sampling location 1", "s1"), col("Sampling location 2", "s2"), col("Sampling location 3", "s3"), col("Standard / classification", "standard")], min_rows=1, max_rows=60)),
        table_sec("Water sampling locations", table("water_locations", "Sampling locations (surface water and ground water)", [
            col("Code", "code"), col("Location", "location", width=26), colsel("Type", ["Surface water", "Ground water"], "kind"), col("Source (bore well, open well, lake, river)", "source"), col("Distance and direction", "distance")], min_rows=1, max_rows=40)),
        table_sec("Water quality results", table("water_quality", "Surface water and ground water results (including heavy metals)", [
            col("Parameter", "parameter", width=22), col("Unit", "unit"), col("Location / code 1", "w1"), col("Location / code 2", "w2"), col("Location / code 3", "w3"), col("Location / code 4", "w4"), col("Standard (IS 10500 / other)", "standard")], min_rows=1, max_rows=80)),
        table_sec("Ground water resource", table("groundwater", "Taluk-wise ground water resource of the district", [
            col("Taluk", "taluk"), colnum("Net annual ground water availability (ham)", "availability"), colnum("Draft for all uses (ham)", "draft"), colnum("Stage of development (%)", "stage"), col("Category (safe, semi-critical, critical, over-exploited)", "category")], min_rows=0)),
        table_sec("Flora and fauna of the study area", table("biodiversity", "Species recorded in the study area", [
            colsel("Group", ["Crop", "Tree", "Shrub", "Herb", "Grass", "Mammal", "Reptile", "Bird", "Butterfly", "Domestic fauna", "Other"], "group"), col("Common name", "common"),
            col("Scientific name", "scientific", width=24), col("Family", "family"), colsel("Schedule / status (WPA 1972, IUCN)", ["Not listed", "Schedule I", "Schedule II", "Schedule III", "Schedule IV", "Vulnerable", "Endangered", "Other"], "status"),
            col("Economic importance / remarks", "remarks")], min_rows=1, max_rows=400)),
        sec("Demography and socio-economic environment",
            text("Methodology adopted for the study", key="socio_method", w=12),
            num("Total population of the study area", key="population"), num("Households", key="households"), num("Literacy rate (%)", key="literacy"), num("Total workers", key="workers"), num("Scheduled caste population", key="sc_pop"),
            num("Scheduled tribe population", key="st_pop"), rich("Vulnerable groups and basic amenities (education, health, drinking water, power, transport)", key="amenities"), cols=2),
        table_sec("Land use pattern of the study area", table("landuse", "Land use pattern in the study area", [
            col("Land use class", "class", width=34), colnum("Area (ha)", "area", total=True), colnum("Share (%)", "share")], min_rows=1, max_rows=30, totals=True)),
        sec("Chapter IV - Impacts assessment and mitigation measures",
            rich("4.1 Introduction and identification of activities and potential impacts", key="impact_intro"),
            rich("4.3 Impacts during the construction phase: land use, soil, air quality, water resources, noise and mitigation measures", key="impact_construction"),
            rich("4.4 Impacts during the operational phase: topography and drainage, land use, soil, solid waste, air, water, noise, socio-economics, traffic, biological environment", key="impact_operation"),
            cols=1),
        table_sec("Impact identification and mitigation matrix", table("impacts", "Impacts and mitigation measures", [
            col("Activity", "activity", width=18), colsel("Phase", PHASE, "phase"), colsel("Component affected", ["Land use", "Soil", "Air quality", "Water resources", "Noise", "Ecology", "Socio-economic", "Traffic", "Topography and drainage", "Solid waste", "Other"], "component"),
            col("Potential impact", "impact", width=24), colsel("Significance", ["Insignificant", "Minor", "Moderate", "Major"], "significance"), col("Mitigation measure", "mitigation", width=28)], min_rows=1, max_rows=120)),
        sec("Chapter V - Analysis of alternatives", rich("5.2 Alternatives in site", key="alt_site"), rich("5.3 Alternative technology", key="alt_tech"), cols=1),
        sec("Chapter VI - Environmental monitoring program", rich("6.1 to 6.3 Objectives and types of environmental monitoring", key="monitoring_text"), rich("6.5 Data analysis and 6.6 Reporting schedule", key="reporting"),
            num("Budget provision for monitoring (Rs per year)", key="monitoring_budget"), cols=1),
        table_sec("Environmental monitoring plan", table("monitoring", "Environmental monitoring plan", [
            col("Component", "component"), col("Parameters", "parameters", width=26), col("Location", "location"), col("Frequency", "frequency"), col("Method / standard", "method"), col("Responsibility", "owner")], min_rows=1, max_rows=40)),
        sec("Chapter VII - Additional studies",
            rich("7.2 Risk assessment and hazard identification: occupational health and risk", key="risk_text"), rich("7.3 Types of hazards, fire fighting system, health and safety measures", key="hazard_types"),
            rich("7.4 Disaster management plan: major accident and emergency", key="disaster"), rich("7.5 Hazard during construction and operation", key="hazard_ops"), rich("7.6 Conclusion of the risk assessment", key="risk_conclusion"),
            upload("Maps, consequence analysis (damage distance) and thermal radiation contours", key="risk_files"), cols=1),
        table_sec("Failure scenarios and hazards", table("hazards", "Identification of failure scenarios and hazards", [
            col("Scenario / hazard", "hazard", width=26), col("Location / unit", "location"), col("Consequence", "consequence", width=24), col("Safeguards", "safeguards", width=26), colsel("Risk level", ["Low", "Medium", "High", "Extreme"], "level")], min_rows=1, max_rows=60)),
        sec("Chapter VIII - Project benefits", rich("8.1 Economic benefits", key="benefits_economic"), rich("8.3 Transportation", key="benefits_transport"), cols=1),
        table_sec("Employment potential", table("employment", "Employment potential", [
            col("Category of employee", "category", width=30), colsel("Phase", PHASE, "phase"), colnum("Number", "number", total=True), col("Skilled / unskilled", "skill")], min_rows=1, max_rows=20, totals=True)),
        sec("Chapter IX - Environmental cost benefit analysis", rich("9.0 Environmental cost benefit analysis", key="cost_benefit"), cols=1),
        sec("Chapter X - Environmental management plan",
            rich("10.1 Elements of the EMP", key="emp_elements"), rich("10.2 Institutional arrangements: environmental management cell, record keeping and reporting", key="emp_institution"),
            rich("10.3 Implementation mechanism for mitigation measures; 10.4 Energy management", key="emp_implementation"), rich("10.5 Development of greenbelt: design", key="greenbelt_design"),
            rich("10.7 Corporate environmental responsibility (CER)", key="cer_text"), upload("Organisation chart of the environmental management cell, greenbelt plan", key="emp_files"), cols=1),
        table_sec("Environmental management cell", table("emc", "Hierarchical structure of the environmental management cell", [
            col("Designation", "designation"), col("Name", "name"), col("Responsibility", "responsibility", width=40)], min_rows=1, max_rows=20)),
        table_sec("Record keeping requirements", table("records", "Record keeping requirements", [
            col("Record", "record", width=30), col("Frequency", "frequency"), col("Responsible", "owner"), col("Form / format", "format")], min_rows=0)),
        table_sec("Greenbelt trees", table("greenbelt", "Greenbelt trees", [
            col("Species (common and scientific name)", "species", width=34), colnum("Number", "number", total=True), col("Spacing", "spacing"), col("Remarks", "remarks")], min_rows=1, max_rows=60, totals=True)),
        table_sec("Expenditure on environmental matters", table("expenditure", "Expenditure on environmental management", [
            col("Item", "item", width=34), colnum("Capital cost (Rs)", "capital", total=True), colnum("Recurring cost per year (Rs)", "recurring", total=True)], min_rows=1, max_rows=40, totals=True)),
        table_sec("Proposed CER activities", table("cer", "Proposed CER activities", [
            col("Activity", "activity", width=34), col("Location / village", "location"), colnum("Budget (Rs)", "budget", total=True), col("Timeline", "timeline")], min_rows=0, totals=True)),
        sec("Chapter XI - Summary and conclusions", rich("11.1 Justification for implementation of the project", key="justification"), rich("11.3 Conclusions", key="conclusions"), cols=1),
        table_sec("Anticipated adverse impacts and mitigation measures", table("summary_impacts", "Summary of anticipated environmental impacts and mitigation measures", [
            col("Impact", "impact", width=28), col("Phase", "phase"), col("Mitigation measure", "mitigation", width=36), col("Residual impact", "residual")], min_rows=1, max_rows=60)),
        sec("Chapter XII - Disclosure of consultants",
            rich("12.1 About the consultant organisation and quality policy", key="consultant_profile"), rich("12.2 Services offered and sectors served", key="consultant_services"), cols=1),
        table_sec("Study team", table("team", "Study team", [
            col("Name", "name"), col("Role / functional area", "role", width=26), col("Qualification", "qualification"), col("Registration / accreditation", "registration"), col("Signature", "signature")], min_rows=1, max_rows=40)),
        sec("Annexures", upload("Annexures: laboratory reports, permissions, approvals, maps and photographs", key="annexures"), upload("Any other attachment", key="other_files"), cols=1),
        signoff(),
    ], form_type="AUDIT", report=True)


AA_STUDIES_CATALOGUE = [
    ("Water Audit Report", water_audit_report, "AUDIT", "Water", ["WATER", "ENV"]),
    ("Environmental Impact Assessment Report", eia_report, "STUDY", "Environment", ["ENV"]),
]
