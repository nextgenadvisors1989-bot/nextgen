"""The client's carbon footprint sample (2026-11-09, DOC-20260828-WA0017.pdf: a 52-page "Carbon Footprint Report" of an organisation's own operations, prepared
to the GHG Protocol) as the form "Carbon Footprint Report" under the Audit and Assessment entry "GHG / Carbon Footprint Verification and Evaluation Audit".

Chapters of the sample are the sections of the form: about the report, the organisation, targets and commitments, compensation of residual emissions, the executive
summary, the carbon footprint (mobility and building emissions), the environmental indicators (emissions by scope, history, intensity per employee) and the appendices
(boundaries, methodology with activity data, emission factors, homeworking calculation, data quality, methodological changes and exclusions, GRI 302 / 305 / 306,
glossary of buildings, retirement certificates). Nothing of the sample organisation is pre-filled; only its structure is used.

Every emission source of the sample is a fixed group of fields (so a blank paper copy already names it): activity this year and last year, gross emissions this year
and last year, and the change of each as a formula. The totals, the net emissions, the shares and the intensity per employee are formulas over those answers, written
in terms of the answers themselves (a formula never waits on a later formula) so they are right in whatever order the sections are filled.
"""
from forms_dsl import (
    area, checklist, col, coldate, colformula, colnum, colsel, date, form, formula, header, multi, note, num, reset_keys, rich, sec, select, signoff,
    table, table_sec, text, upload, yesno,
)
from forms_catalogue_aa_studies import cover

# Mobility sources of the sample (hotel stays are reported but kept out of the totals, as in the sample)
MOBILITY = [
    ("air", "Business travel - air", "thousand passenger km"),
    ("rail", "Business travel - rail", "thousand passenger km"),
    ("wfh", "Working from home (homeworking)", "average % of the workforce"),
    ("commute", "Employee commuting", "thousand km"),
    ("ccar", "Company cars", "thousand km"),
    ("rcar", "Rental cars", "thousand km"),
    ("courier", "Courier shipments", "number of shipments"),
    ("minibus", "Minibus (including internal mail)", "km"),
]
HOTEL = ("hotel", "Hotel stays", "nights")
BUILDING = [
    ("elec", "Electricity in offices", "MWh"),
    ("steam", "Purchased steam / heat", "MWh"),
    ("cold", "Purchased cooling (cold supply)", "MWh"),
    ("gas", "Natural gas", "MWh"),
    ("water", "Water", "Ml (megalitres)"),
    ("paper", "Paper", "tonnes"),
    ("waste", "Waste", "tonnes"),
    ("dc", "Data centres", "MWh"),
]

OFFSET_STANDARD = ["Verified Carbon Standard (VCS)", "VCS with Climate, Community and Biodiversity (CCB) Standards", "Gold Standard", "Clean Development Mechanism (CDM)", "Other"]
QUALITY = ["Good - no change required", "Satisfactory - could be improved", "Poor - priority for improvement"]
SCOPES = ["Scope 1", "Scope 2", "Scope 3"]


def pct_change(cur, prev):
    return f"IF(({prev}) == 0, 0, ROUND((({cur}) - ({prev})) / ({prev}) * 100, 1))"


def total(keys, suffix):
    return " + ".join(f"{key}{suffix}" for key in keys)


MOB_KEYS = [p for p, _, _ in MOBILITY]
BLD_KEYS = [p for p, _, _ in BUILDING]
GROSS_CUR = total(MOB_KEYS + BLD_KEYS, "_gross") + " + other_sources.cur"
GROSS_PREV = total(MOB_KEYS + BLD_KEYS, "_gross_prev") + " + other_sources.prev"
DEDUCTIONS = "ded_elec + ded_steam + ded_cold + ded_dc + ded_courier + ded_other"
NET_CUR = f"({GROSS_CUR}) - ({DEDUCTIONS})"
MOB_GROSS = total(MOB_KEYS, "_gross")
BLD_GROSS = total(BLD_KEYS, "_gross")
MOB_NET = f"({MOB_GROSS}) - ded_courier"
BLD_NET = f"({BLD_GROSS}) - (ded_elec + ded_steam + ded_cold + ded_dc)"


def per_employee(expression):
    return f"IF(emp_cur == 0, 0, ROUND(({expression}) / emp_cur, 3))"


def share(part, whole):
    return f"IF(({whole}) == 0, 0, ROUND(({part}) / ({whole}) * 100, 1))"


def source_group(p, label, unit):
    """One emission source: the activity and the gross emissions, this year and last year, with the change of each."""
    return [
        note(label),
        num(f"{label} - activity, reporting year ({unit})", key=f"{p}_act", w=4), num(f"{label} - activity, previous year ({unit})", key=f"{p}_act_prev", w=4),
        formula(f"{label} - change in activity (%)", pct_change(f"{p}_act", f"{p}_act_prev"), key=f"{p}_act_chg", w=4),
        num(f"{label} - gross emissions, reporting year (tCO2e)", key=f"{p}_gross", w=4), num(f"{label} - gross emissions, previous year (tCO2e)", key=f"{p}_gross_prev", w=4),
        formula(f"{label} - change in gross emissions (%)", pct_change(f"{p}_gross", f"{p}_gross_prev"), key=f"{p}_gross_chg", w=4),
    ]


def scope_line(label, cur, prev, key):
    return [formula(f"{label} - reporting year (tCO2e)", cur, key=f"{key}_cur", w=6), formula(f"{label} - previous year (tCO2e)", prev, key=f"{key}_prev", w=6)]


def carbon_footprint_report():
    reset_keys()
    mobility_fields = [f for p, label, unit in MOBILITY for f in source_group(p, label, unit)]
    mobility_fields += [note("Hotel stays are reported next to the footprint and are not part of the totals unless the report says so.")]
    mobility_fields += [num("Hotel stays - nights, reporting year", key="hotel_act", w=4), num("Hotel stays - nights, previous year", key="hotel_act_prev", w=4),
                        formula("Hotel stays - change in nights (%)", pct_change("hotel_act", "hotel_act_prev"), key="hotel_act_chg", w=4),
                        num("Hotel stays - gross emissions, reporting year (tCO2e)", key="hotel_gross", w=4), num("Hotel stays - gross emissions, previous year (tCO2e)", key="hotel_gross_prev", w=4),
                        formula("Hotel stays - change in gross emissions (%)", pct_change("hotel_gross", "hotel_gross_prev"), key="hotel_gross_chg", w=4),
                        yesno("Hotel stays included in the footprint totals", key="hotel_included", w=6)]
    building_fields = [f for p, label, unit in BUILDING for f in source_group(p, label, unit)]

    scope1 = [("Natural gas", "gas_gross", "gas_gross_prev", "s1_gas"), ("Company cars", "ccar_gross", "ccar_gross_prev", "s1_ccar")]
    scope2 = [("Electricity", "elec_gross", "elec_gross_prev", "s2_elec"), ("Purchased steam / heat", "steam_gross", "steam_gross_prev", "s2_steam"),
              ("Purchased cooling (cold supply)", "cold_gross", "cold_gross_prev", "s2_cold")]
    scope3 = [("Business travel (flights and rail)", "air_gross + rail_gross", "air_gross_prev + rail_gross_prev", "s3_travel"),
              ("Minibus (including internal mail)", "minibus_gross", "minibus_gross_prev", "s3_minibus"), ("Employee commuting", "commute_gross", "commute_gross_prev", "s3_commute"),
              ("Courier shipments", "courier_gross", "courier_gross_prev", "s3_courier"), ("Rental cars", "rcar_gross", "rcar_gross_prev", "s3_rcar"),
              ("Water", "water_gross", "water_gross_prev", "s3_water"), ("Waste", "waste_gross", "waste_gross_prev", "s3_waste"), ("Paper", "paper_gross", "paper_gross_prev", "s3_paper"),
              ("Data centres", "dc_gross", "dc_gross_prev", "s3_dc"), ("Working from home (homeworking)", "wfh_gross", "wfh_gross_prev", "s3_wfh")]
    scope_fields = []
    for title, lines in (("Scope 1 - direct emissions", scope1), ("Scope 2 - purchased electricity, steam, heat and cooling", scope2), ("Scope 3 - other indirect emissions", scope3)):
        scope_fields.append(note(title))
        for label, cur, prev, key in lines:
            scope_fields += scope_line(label, cur, prev, key)
    s1 = "gas_gross + ccar_gross"
    s2 = "elec_gross + steam_gross + cold_gross"
    s3 = "air_gross + rail_gross + minibus_gross + commute_gross + courier_gross + rcar_gross + water_gross + waste_gross + paper_gross + dc_gross + wfh_gross"

    gri_energy = []
    for key, label in (("gas", "Natural gas"), ("elec", "Electricity"), ("steam", "Steam / heat")):
        gri_energy += [num(f"{label} (MWh) - reporting year", key=f"gri_{key}", w=3), num(f"{label} (MWh) - baseline year", key=f"gri_{key}_base", w=3),
                       formula(f"{label} - difference (MWh)", f"gri_{key} - gri_{key}_base", key=f"gri_{key}_diff", w=3),
                       formula(f"{label} - change (%)", pct_change(f"gri_{key}", f"gri_{key}_base"), key=f"gri_{key}_chg", w=3)]
    gri_total = "gri_gas + gri_elec + gri_steam"
    gri_total_base = "gri_gas_base + gri_elec_base + gri_steam_base"

    return form("Carbon Footprint Report",
                "The carbon footprint report of an organisation's own operations (GHG Protocol): about the report, targets and compensation, the executive summary, mobility and building "
                "emissions, emissions by scope, history and intensity per employee, boundaries, methodology, emission factors, data quality, GRI indicators and the verification.", "CFR", [
        cover("Carbon Footprint Report", text("Subtitle (greenhouse gas emissions resulting from ...)", key="cover_subtitle", default="Greenhouse gas emissions resulting from internal operations"),
              text("Organisation reported on", key="organisation_name")),
        header("Carbon footprint report reference", extra=[
            num("Reporting year", key="report_year"), date("Reporting period - from", key="period_from"), date("Reporting period - to", key="period_to"),
            num("Baseline (comparison) year", key="baseline_year"), select("Report type", ["Annual carbon footprint report", "Carbon footprint verification", "Carbon footprint evaluation", "Baseline study"], key="report_type")]),

        sec("About this report",
            rich("Purpose and scope of the report (which operations, which year, how it was prepared)", key="about_purpose"),
            multi("How the report was prepared", ["Review of internal documents", "Review of external documents", "Interviews with key personnel", "Analysis of source data", "Analysis of data collection systems",
                                                   "Comparison with the data of previous years"], key="prepared_how", w=12),
            select("Emission totals disclosed", ["Gross and net emissions", "Gross emissions only", "Net emissions only"], key="totals_disclosed"),
            select("Standard the report follows", ["GHG Protocol Corporate Accounting and Reporting Standard", "ISO 14064-1", "GHG Protocol with ISO 14064-1", "Other"], key="standard"),
            rich("What 'net' emissions mean in this report (renewable energy treated as zero emissions, directly offset services treated as carbon neutral)", key="net_meaning"),
            rich("What 'gross' emissions mean in this report (national average conversion factors used for benchmarking)", key="gross_meaning"),
            rich("Comparison with previous years (baseline year and what was compared)", key="comparison"), cols=2),
        sec("The organisation",
            rich("Description of the organisation and the entities it consists of", key="org_description"),
            text("Operations covered (head office, plants, branches)", key="org_operations", w=12),
            num("Total employees - reporting year", key="emp_cur", w=4), num("Total employees - previous year", key="emp_prev", w=4), num("Total employees - baseline year", key="emp_base", w=4),
            formula("Change in employees against the previous year (%)", pct_change("emp_cur", "emp_prev"), key="emp_chg_prev", w=6),
            formula("Change in employees against the baseline year (%)", pct_change("emp_cur", "emp_base"), key="emp_chg_base", w=6),
            num("Year the carbon footprint was first calculated", key="first_year", w=6), cols=2),
        sec("Greenhouse gas emissions from internal operations - targets and commitments",
            text("Earlier reduction target (for example 20-30% from the baseline year by a target year)", key="old_target", w=8),
            select("Was the earlier target met", ["Yes", "No", "Partly", "Not applicable"], key="old_target_met", w=4),
            rich("Commitment to measure and manage the footprint (policies, principles and standards it follows)", key="commitment"),
            rich("Climate roadmap or climate strategy of the organisation", key="roadmap"),
            rich("Alignment with the Paris Agreement", key="paris"), cols=2),
        sec("Science-based targets and environmental management",
            text("Target (for example reduce absolute emissions by 30% by 2025 against a business-as-usual base year)", key="sbt_target", w=12),
            num("Reduction target (%)", key="sbt_pct", w=3), num("Target year", key="sbt_year", w=3), num("Base year of the pathway", key="sbt_base", w=3),
            select("Temperature pathway", ["1.5 deg C", "Well below 2 deg C", "2 deg C", "Other"], key="sbt_path", w=3),
            multi("Steps of the pathway", ["Set science-based targets for Scope 1 and 2 (and 3)", "Implement emission reduction measures in line with the targets", "Offset the remaining unavoidable emissions each year with high-quality certificates"],
                  key="sbt_steps", w=12),
            upload("Figure - emissions reduction pathway", key="fig_pathway"),
            select("Environmental management system", ["EMAS", "ISO 14001", "EMAS and ISO 14001", "None"], key="ems", w=6), num("Year the system was implemented", key="ems_year", w=6),
            multi("Themes of the climate programme", ["The way we travel", "The way we work", "The way we do business", "Buildings and energy", "Waste and materials"], key="programme_themes", w=12),
            rich("Programmes and initiatives under the system", key="ems_programmes"), cols=2),
        sec("Impact of exceptional events on the reporting year",
            yesno("Were operations affected by an exceptional event (for example a pandemic) in the reporting year", key="event_affected", w=12),
            rich("The event and its effect on staff, working arrangements and operations", key="event_description"),
            rich("Effect on building operations (occupancy, ventilation, heating, closures)", key="event_buildings"),
            yesno("Homeworking emissions included in the footprint", key="homeworking_included", w=6),
            rich("How homeworking emissions were estimated (data used and who provided the estimation)", key="homeworking_how"),
            rich("The organisation's response to the event (policies, funds, support measures)", key="event_response"), cols=2),
        sec("Greenhouse gas emissions compensation (offsets)",
            yesno("Are residual emissions compensated", key="offset_yes", w=6), date("Date the compensation strategy was last reviewed", key="offset_review", w=6),
            rich("Compensation approach (credits purchased, the project supported, its standard and benefits to communities and biodiversity)", key="offset_approach"),
            rich("Review of the compensation strategy (avoidance against sequestration, change of project, planned year of the new strategy)", key="offset_strategy"),
            formula("Net emissions to compensate (tCO2e)", NET_CUR, key="offset_needed", w=4), formula("Credits retired (tCO2e)", "offsets.qty", key="offset_retired", w=4),
            formula("Balance still to compensate (tCO2e)", f"({NET_CUR}) - offsets.qty", key="offset_balance", w=4),
            tables=[table("offsets", "Carbon credits purchased and retired", [
                col("Project", "project", width=20), colsel("Standard", OFFSET_STANDARD, "standard"), col("Methodology", "methodology"), colnum("Vintage (year)", "vintage"),
                colnum("Quantity retired (tCO2e)", "qty", total=True), col("Serial number(s) of the credits", "serial", width=26), coldate("Date retired", "retired")], min_rows=0, max_rows=20, totals=True)],
            cols=2),

        sec("Executive summary - key figures",
            text("Headline of the year (for example emissions intensity per employee down by over 85% since the baseline year)", key="headline", w=12),
            num("Total net emissions - previous year (tCO2e)", key="net_prev", w=4), num("Total net emissions - baseline year (tCO2e)", key="net_base", w=4),
            formula("Total gross emissions - reporting year (tCO2e)", GROSS_CUR, key="gross_total", w=4),
            formula("Total net emissions - reporting year (tCO2e)", NET_CUR, key="net_total", w=4),
            formula("Net emissions against the previous year (%)", pct_change("net_total", "net_prev"), key="net_chg_prev", w=4),
            formula("Net emissions against the baseline year (%)", pct_change("net_total", "net_base"), key="net_chg_base", w=4),
            formula("Net emissions per employee - reporting year (tCO2e)", per_employee("net_total"), key="intensity_cur", w=4),
            formula("Net emissions per employee - previous year (tCO2e)", "IF(emp_prev == 0, 0, ROUND(net_prev / emp_prev, 3))", key="intensity_prev", w=4),
            formula("Net emissions per employee - baseline year (tCO2e)", "IF(emp_base == 0, 0, ROUND(net_base / emp_base, 3))", key="intensity_base", w=4),
            formula("Intensity per employee against the previous year (%)", "IF(emp_cur * emp_prev * net_prev == 0, 0, ROUND((net_total / emp_cur) / (net_prev / emp_prev) * 100 - 100, 1))", key="intensity_chg_prev", w=6),
            formula("Intensity per employee against the baseline year (%)", "IF(emp_cur * emp_base * net_base == 0, 0, ROUND((net_total / emp_cur) / (net_base / emp_base) * 100 - 100, 1))", key="intensity_chg_base", w=6),
            rich("Summary of the year (what the totals show and why they changed)", key="exec_summary"),
            note("Operational consumption and emissions of an exceptional year may have fallen for reasons outside the organisation's control; say so here so the decrease is not read as a permanent change."),
            upload("Figure - net emissions performance and trends", key="fig_trend"), cols=2),
        table_sec("Executive summary - performance of the last years", table("exec_years", "Net emissions, employees and intensity by year", [
            colnum("Year", "year"), colnum("Total net emissions (tCO2e)", "net"), colnum("Employees", "employees"),
            colformula("Net emissions per employee (tCO2e)", "IF(employees == 0, 0, ROUND(net / employees, 2))", "per_employee"), colnum("Change against the previous year (%)", "change")], min_rows=1, max_rows=30)),
        table_sec("Our actions and initiatives", table("initiatives", "Actions and initiatives to reduce the footprint", [
            colsel("Area", ["Building energy consumption", "Technology", "Reducing consumption and waste", "Staff mobility", "Procurement", "Other"], "area"),
            col("Action / initiative", "action", width=34), colsel("Status", ["Planned", "In progress", "Completed"], "status"), colnum("Year", "year"), col("Result / saving", "result", width=22)],
            min_rows=1, max_rows=60)),
        sec("Performance of the reporting year - key highlights and drivers",
            rich("Key highlights and drivers (reduction in gross and net emissions, energy, travel, working from home)", key="highlights"),
            num("Change in building electricity consumption (%)", key="hl_electricity", w=4), num("Change in thermal energy use (%)", key="hl_thermal", w=4),
            num("Change in data centre emissions (tCO2e)", key="hl_dc", w=4), num("Change in air travel emissions (tCO2e)", key="hl_air", w=4),
            num("Change in rail travel emissions (tCO2e)", key="hl_rail", w=4), num("Change in commuting emissions (tCO2e)", key="hl_commute", w=4),
            rich("Achievements of the year", key="achievements"), cols=2),
        sec("Case studies",
            text("Case study 1 - title", key="case1_title", w=12), rich("Case study 1", key="case1_text"),
            note("Data centre energy use by year is entered under the data centre emissions of the carbon footprint chapter."),
            text("Case study 2 - title (for example a single-use plastic reduction project)", key="case2_title", w=12), rich("Case study 2", key="case2_text"),
            num("Quantity at the start of the project (kg)", key="plastic_start", w=4), num("Quantity at the end of the project (kg)", key="plastic_end", w=4),
            formula("Reduction achieved (%)", "IF(plastic_start == 0, 0, ROUND((plastic_start - plastic_end) / plastic_start * 100, 1))", key="plastic_reduction", w=4),
            upload("Pictures of the case studies", key="case_pictures"), cols=2),

        sec("Carbon footprint - performance summary",
            formula("Gross emissions of mobility (tCO2e)", MOB_GROSS, key="gross_mob", w=4), formula("Gross emissions of buildings (tCO2e)", BLD_GROSS, key="gross_bld", w=4),
            formula("Gross emissions of all sources (tCO2e)", "gross_total", key="gross_all", w=4),
            formula("Mobility share of gross emissions (%)", share("gross_mob", "gross_total"), key="share_mob_gross", w=4), formula("Buildings share of gross emissions (%)", share("gross_bld", "gross_total"), key="share_bld_gross", w=4),
            formula("Mobility net emissions (tCO2e)", MOB_NET, key="net_mob", w=4), formula("Buildings net emissions (tCO2e)", BLD_NET, key="net_bld", w=4),
            formula("Mobility share of net emissions (%)", share("net_mob", "net_total"), key="share_mob_net", w=4), formula("Buildings share of net emissions (%)", share("net_bld", "net_total"), key="share_bld_net", w=4),
            rich("Which sources are the largest and why (net and gross)", key="perf_comment"), upload("Figure - percentage breakdown of net and gross emissions", key="fig_breakdown"), cols=2),
        sec("Mobility emissions - activity and gross emissions by source", *mobility_fields, rich("Mobility policies (alternatives to travel, sustainable commuting, awareness-raising)", key="mobility_policy"),
            upload("Figure - breakdown of mobility gross emissions by source", key="fig_mobility"), cols=2),
        sec("Air travel emissions by travel class",
            num("Economy (tCO2e)", key="air_economy", w=3), num("Premium economy (tCO2e)", key="air_premium", w=3), num("Business (tCO2e)", key="air_business", w=3), num("First (tCO2e)", key="air_first", w=3),
            formula("Air travel emissions of all classes (tCO2e)", "air_economy + air_premium + air_business + air_first", key="air_class_total", w=4),
            formula("Business class share (%)", share("air_business", "air_economy + air_premium + air_business + air_first"), key="air_business_share", w=4),
            formula("Economy share (%)", share("air_economy", "air_economy + air_premium + air_business + air_first"), key="air_economy_share", w=4),
            rich("Comment on air travel (distance, long and short haul, change against the previous year)", key="air_comment"), upload("Figure - air travel emissions by class", key="fig_air"), cols=2),
        sec("Working from home and commuting",
            num("Share of the workforce working from home (average, %)", key="wfh_share", w=6), num("Homeworking emissions in the reporting year (tCO2e)", key="wfh_total", w=6),
            rich("Working from home - how the emissions were modelled (monthly share of staff at home, calculation tool, assumptions)", key="wfh_method"),
            rich("Car travel - commuting, company cars and rental cars (how commuting was calculated, parking spaces or staff numbers, data quality of suppliers)", key="car_comment"),
            rich("Other mobility - couriers, minibus and rail (offset emissions treated as net zero, vehicles replaced by electric ones)", key="other_mobility_comment"),
            rich("Changes made to the calculation of commuting emissions and to the inclusion of homeworking emissions", key="commute_changes"), cols=2),

        sec("Building emissions - consumption and gross emissions by source", *building_fields,
            upload("Figure - breakdown of building-related emissions by source", key="fig_buildings"), cols=2),
        sec("Electricity in offices - supply and consumption by building",
            select("Electricity supply", ["100% renewable with guarantees of origin", "Partly renewable", "Grid mix", "Other"], key="elec_supply", w=6), num("Renewable share of the electricity (%)", key="elec_renewable_pct", w=6),
            text("Electricity supplier", key="elec_supplier", w=12),
            formula("Total electricity of the buildings listed below - reporting year (MWh)", "elec_buildings.cur", key="elec_total_cur", w=6),
            formula("Total electricity of the buildings listed below - previous year (MWh)", "elec_buildings.prev", key="elec_total_prev", w=6),
            rich("Reasons for the change (closures, occupancy, ventilation or fresh-air operation, building optimisation)", key="elec_comment"),             tables=[table("elec_buildings", "Electricity consumption by building (MWh)", [
                col("Building", "building", width=34), colnum("Previous year (MWh)", "prev", total=True), colnum("Reporting year (MWh)", "cur", total=True),
                colformula("Change (%)", "IF(prev == 0, 0, ROUND((cur - prev) / prev * 100, 1))", "change")], min_rows=1, max_rows=40, totals=True)],
            cols=2),
        sec("Purchased steam, natural gas, paper and water",
            select("Purchased steam - source", ["Renewable (biomass / wood pellets)", "Fossil", "Mixed", "Not applicable"], key="steam_source", w=6), num("Renewable share of the steam (%)", key="steam_renewable_pct", w=6),
            text("Buildings still on non-renewable steam (if any)", key="steam_exceptions", w=12),
            text("Sites using gas boilers or a co-generation plant", key="gas_sites", w=12),
            num("Simplex printing (%)", key="paper_simplex", w=4), num("Duplex printing (%)", key="paper_duplex", w=4), yesno("Follow-me printing in place", key="paper_followme", w=4),
            rich("Paper - reduction measures (no local printers, deletion of unreleased jobs, double-sided default)", key="paper_comment"),
            rich("Water - consumption by site, reason for the change, and why it is reported in megalitres", key="water_comment"), cols=2),
        sec("Data centres",
            yesno("Data centres owned or operated by the organisation (Scope 1 / 2 if yes)", key="dc_owned", w=6), select("Data centre energy source", ["100% renewable", "Partly renewable", "Grid mix"], key="dc_source", w=6),
            text("Data centre providers and sites", key="dc_sites", w=12),
            rich("Steps taken to reduce electricity use in data centres (equipment, airflow, lighting, power units, code of conduct for energy efficiency)", key="dc_steps"),
            tables=[table("dc_energy", "Data centre energy use by year (MWh)", [colnum("Year", "year"), colnum("Energy use (MWh)", "mwh")], min_rows=1, max_rows=20)], cols=2),
        sec("Waste",
            num("Hazardous, electrical and electronic (WEEE) and construction waste not converted to emissions (tonnes)", key="waste_unconverted", w=12),
            formula("Waste weighed and converted to emissions (tonnes)", "waste_treatment.volume", key="waste_weighed", w=6), formula("Emissions from waste (tCO2e)", "waste_treatment.tco2e", key="waste_emissions", w=6),
            rich("Waste - reasons for the change, how waste data are collected, sorting in house", key="waste_comment"), upload("Figure - emissions by waste type", key="fig_waste"),             tables=[table("waste_treatment", "Waste emissions and treatment data of the reporting year", [
                colsel("Type", ["Mixed", "Organic", "Paper", "Glass", "Plastic", "Metal", "Wood", "Textile", "Other"], "type"),
                colsel("Treatment", ["Incineration", "Incineration with energy recovery", "Composting", "Recycling", "Landfill", "Other"], "treatment"),
                colnum("Volume (tonnes)", "volume", total=True), colnum("Emissions (tCO2e)", "tco2e", total=True)], min_rows=1, max_rows=40, totals=True)],
            cols=2),

        sec("Environmental indicators - emissions by scope (tCO2e)",
            note("Emissions of each source are taken from the answers above; add only the deductions and the sources not listed."),
            *scope_fields,
            formula("Total Scope 1 - reporting year (tCO2e)", s1, key="s1_total_cur", w=6), formula("Total Scope 1 - previous year (tCO2e)", s1.replace("_gross", "_gross_prev"), key="s1_total_prev", w=6),
            formula("Total Scope 2 - reporting year (tCO2e)", s2, key="s2_total_cur", w=6), formula("Total Scope 2 - previous year (tCO2e)", s2.replace("_gross", "_gross_prev"), key="s2_total_prev", w=6),
            formula("Total Scope 3 - reporting year (tCO2e)", s3, key="s3_total_cur", w=6), formula("Total Scope 3 - previous year (tCO2e)", s3.replace("_gross", "_gross_prev"), key="s3_total_prev", w=6),
            formula("Total gross emissions - reporting year (tCO2e)", "gross_total", key="gross_cur", w=6), formula("Total gross emissions - previous year (tCO2e)", GROSS_PREV, key="gross_prev", w=6),
            note("Deductions that turn gross emissions into net emissions (negative values are entered as positive numbers)."),
            num("Electricity on a green tariff (tCO2e)", key="ded_elec", w=4), num("Purchased steam from renewable sources (tCO2e)", key="ded_steam", w=4), num("Purchased cooling from renewable sources (tCO2e)", key="ded_cold", w=4),
            num("Data centre energy from renewable sources (tCO2e)", key="ded_dc", w=4), num("Courier emissions offset by the courier company (tCO2e)", key="ded_courier", w=4),
            num("Other emissions treated as net zero (tCO2e)", key="ded_other", w=4),
            formula("Total deductions (tCO2e)", DEDUCTIONS, key="ded_total", w=6), formula("Total net emissions - reporting year (tCO2e)", "net_total", key="net_cur", w=6),
            tables=[table("other_sources", "Sources of emissions not listed above", [
                colsel("Scope", SCOPES, "scope"), col("Source", "source", width=40), colnum("Reporting year (tCO2e)", "cur", total=True), colnum("Previous year (tCO2e)", "prev", total=True)], min_rows=0, max_rows=30, totals=True)],
            cols=2),
        table_sec("Emissions by scope - history", table("history", "Historic emissions by scope, net emissions and intensity (all years since the baseline)", [
            colnum("Year", "year"), colnum("Scope 1 (tCO2e)", "s1", total=True), colnum("Scope 2 (tCO2e)", "s2", total=True), colnum("Scope 3 (tCO2e)", "s3", total=True),
            colformula("Total gross emissions (tCO2e)", "s1 + s2 + s3", "gross"), colnum("Deductions - green energy and offsets (tCO2e)", "deductions"),
            colformula("Total net emissions (tCO2e)", "gross - deductions", "net"), colnum("Employees", "employees"),
            colformula("Net emissions per employee (tCO2e)", "IF(employees == 0, 0, ROUND(net / employees, 2))", "per_employee")], min_rows=1, max_rows=40),
            description="One row for each year, the baseline year first."),
        sec("Environmental indicators - net emissions by type, per employee (tCO2e)",
            formula("Total net emissions per employee", per_employee("net_total"), key="pe_total", w=4), formula("Energy (buildings) net emissions per employee", per_employee("net_bld"), key="pe_energy", w=4),
            formula("Mobility net emissions per employee", per_employee("net_mob"), key="pe_mobility", w=4),
            formula("Water emissions per employee", per_employee("water_gross"), key="pe_water", w=3), formula("Waste emissions per employee", per_employee("waste_gross"), key="pe_waste", w=3),
            formula("Paper emissions per employee", per_employee("paper_gross"), key="pe_paper", w=3), formula("Data centre net emissions per employee", per_employee("dc_gross - ded_dc"), key="pe_dc", w=3),
            rich("Comment on the intensity per employee (absolute against relative impact, metrics planned for the coming years)", key="pe_comment"),
            upload("Figures - net emission intensities per employee", key="fig_intensity"), cols=2),

        sec("Appendix I - organisational boundary",
            select("Consolidation approach", ["Operational control", "Financial control", "Equity share"], key="boundary_approach", w=6),
            rich("Organisational boundary - what is included (head office, facilities) and what is left out (external offices) and why", key="org_boundary"),
            rich("Expected non-materiality of the excluded offices and how they will be understood in coming years", key="excluded_offices"), cols=2),
        sec("Appendix I - operational boundary",
            rich("Scope 1 - direct emissions included (boilers, co-generation, owned vehicles, fugitive emissions and why they are or are not relevant)", key="scope1_boundary"),
            rich("Scope 2 - purchased electricity, steam, heat and cooling included", key="scope2_boundary"),
            rich("Scope 3 - activities included (travel, commuting, minibus, waste, data centres, paper, water, couriers, homeworking)", key="scope3_boundary"),
            rich("Annual review of the footprint boundary and sources planned to be added (conferences, recruitment, external offices)", key="boundary_review"),
            select("Internal reporting frequency", ["Monthly", "Quarterly", "Half-yearly", "Annual"], key="reporting_frequency", w=6),
            upload("Figure - organisational and operational boundaries (scopes and Scope 3 categories)", key="fig_boundary"), cols=2),

        sec("Appendix II - methodology",
            select("Calculation approach", ["GHG Protocol (activity data x emission factors)", "ISO 14064-1", "Other"], key="calc_approach", w=6),
            select("Global warming potentials (100-year) from", ["IPCC Fourth Assessment Report", "IPCC Fifth Assessment Report", "IPCC Sixth Assessment Report"], key="gwp", w=6),
            multi("Greenhouse gases covered", ["Carbon dioxide (CO2)", "Methane (CH4)", "Nitrous oxide (N2O)", "Hydrofluorocarbons (HFCs)", "Perfluorocarbons (PFCs)", "Sulphur hexafluoride (SF6)", "Nitrogen trifluoride (NF3)"],
                  key="gases", w=12),
            select("Relative footprint calculated per", ["Contracted employee", "Full-time equivalent (FTE) staff", "Turnover", "Floor area", "Unit of production"], key="relative_basis", w=6),
            rich("Emissions sources and activity data (primary data, estimation models, who provided them)", key="method_sources"),
            rich("Emission factors (how they were chosen, upstream emissions of fuels, paper from weight of paper)", key="method_factors"),
            rich("Emissions inventory calculation (activity data x factors, aggregation by scope, mobility and building-related emissions)", key="method_inventory"), cols=2),
        table_sec("Activity data used for each emission source", table("activity_data", "Activity data (Scope, source, unit and resolution)", [
            colsel("Scope", SCOPES, "scope"), col("Emission source", "source", width=28), col("Unit (kWh, km, passenger km, litres, shipments, Ml, kg, FTE)", "unit", width=22),
            col("Resolution (monthly by site, quarterly by journey, model)", "resolution", width=26), col("Provided by", "provider")], min_rows=1, max_rows=40)),
        table_sec("Emission factors of the reporting year", table("factors", "Annual emission factors by source", [
            col("Emission source", "source", width=22), colnum("Emission factor", "factor"), col("Unit (kgCO2e per kWh, km, passenger km, litre, shipment, m3, tonne)", "unit", width=24),
            colnum("Change against the previous year (%)", "change"), col("Data source (government conversion factors, agency, supplier)", "origin", width=28)], min_rows=1, max_rows=40)),
        sec("Homeworking methodology - office equipment and heating (base case)",
            note("Office equipment: workstation and lighting electricity of homeworking staff. Heating: incremental heating of the whole home during the heating season. All inputs are entered and the energy and emissions are calculated."),
            num("Homeworking FTE (average of the year)", key="hw_fte", w=4), num("Homeworking hours per month per FTE (WHpcm)", key="hw_hours", w=4), num("Working hours per day assumed", key="hw_day_hours", w=4),
            num("Annual leave deducted (days)", key="hw_leave", w=4), num("Workstation power load (watts)", key="hw_workstation_w", w=4), num("Lighting allowance (watts)", key="hw_lighting_w", w=4),
            formula("Workstation electricity (kWh)", "hw_workstation_w * hw_fte * hw_hours / 1000", key="hw_kwh_workstation", w=4), formula("Lighting electricity (kWh)", "hw_lighting_w * hw_fte * hw_hours / 1000", key="hw_kwh_lighting", w=4),
            formula("Total office electricity (kWh)", "hw_workstation_w * hw_fte * hw_hours / 1000 + hw_lighting_w * hw_fte * hw_hours / 1000", key="hw_kwh_office", w=4),
            num("Grid emission factor of the country (kgCO2e per kWh)", key="hw_ef_grid", w=4),
            formula("Office equipment emissions (tCO2e per month)", "(hw_workstation_w * hw_fte * hw_hours / 1000 + hw_lighting_w * hw_fte * hw_hours / 1000) * hw_ef_grid / 1000", key="hw_t_office", w=4),
            num("Typical domestic gas use (kWh per year)", key="hw_gas_year", w=4), num("Share of it used for heating (%)", key="hw_heat_share", w=4), num("Heating hours per day", key="hw_heat_hours", w=4),
            num("Days in the heating season", key="hw_heat_days", w=4), num("Gas emission factor (kgCO2e per kWh)", key="hw_ef_gas", w=4),
            formula("Heating demand (kWh per hour)", "IF(hw_heat_days * hw_heat_hours == 0, 0, ROUND(hw_gas_year * hw_heat_share / 100 / (hw_heat_days * hw_heat_hours), 2))", key="hw_kwh_hour", w=4),
            formula("Incremental heating per homeworking FTE per heating month (kWh)", "IF(hw_heat_days * hw_heat_hours == 0, 0, ROUND(hw_hours * hw_gas_year * hw_heat_share / 100 / (hw_heat_days * hw_heat_hours), 1))", key="hw_kwh_fte_month", w=6),
            formula("Incremental gas for all homeworking FTE per heating month (kWh)", "IF(hw_heat_days * hw_heat_hours == 0, 0, ROUND(hw_fte * hw_hours * hw_gas_year * hw_heat_share / 100 / (hw_heat_days * hw_heat_hours), 0))", key="hw_kwh_total_month", w=6),
            formula("Heating emissions (tCO2e per heating month)", "IF(hw_heat_days * hw_heat_hours == 0, 0, ROUND(hw_fte * hw_hours * hw_gas_year * hw_heat_share / 100 / (hw_heat_days * hw_heat_hours) * hw_ef_gas / 1000, 2))", key="hw_t_heat", w=12),
            rich("Homeworking methodology - assumptions and the source of the calculation model", key="hw_assumptions"), cols=2),
        checklist("Data quality and completeness by source",
                  [label for _, label, _ in MOBILITY] + [label for _, label, _ in BUILDING], answer="quality", options=QUALITY, remarks=True,
                  description="Rate the activity data of each emission source (Good, Satisfactory or Poor). Say in the remarks which are primary data, which are modelled, and the assumptions applied."),
        table_sec("Impact of methodological changes on gross emissions", table("method_changes", "Methodological changes since the baseline year", [
            col("Emission source", "source", width=20), colnum("Year of the change", "year"), col("What changed (new factor, new source, new boundary)", "change", width=40),
            colsel("Effect on gross emissions", ["Reduced", "Increased", "No material change"], "effect"), colnum("Effect (tCO2e)", "tco2e")], min_rows=0, max_rows=40)),
        sec("Exclusions",
            rich("Sources and sites excluded from the footprint and why (data not available, small size, measured in units instead of weight)", key="exclusions_text"),
            tables=[table("exclusions", "Excluded sources", [col("Source / site", "source", width=30), col("Reason for excluding it", "reason", width=44), colnum("Estimated share of the footprint (%)", "share")], min_rows=0, max_rows=30)],
            cols=1),

        sec("Appendix III - GRI 302-4: reduction of energy consumption",
            *gri_energy,
            formula("Total energy (MWh) - reporting year", gri_total, key="gri_total", w=4), formula("Total energy (MWh) - baseline year", gri_total_base, key="gri_total_base", w=4),
            formula("Total energy - change (%)", pct_change(gri_total, gri_total_base), key="gri_total_chg", w=4),
            formula("Energy per employee (kWh) - reporting year", "IF(emp_cur == 0, 0, ROUND((gri_gas + gri_elec + gri_steam) * 1000 / emp_cur, 0))", key="gri_pe_cur", w=4),
            formula("Energy per employee (kWh) - baseline year", "IF(emp_base == 0, 0, ROUND((gri_gas_base + gri_elec_base + gri_steam_base) * 1000 / emp_base, 0))", key="gri_pe_base", w=4),
            formula("Energy per employee - change (%)", "IF(emp_cur * emp_base == 0, 0, ROUND(((gri_gas + gri_elec + gri_steam) / emp_cur) / ((gri_gas_base + gri_elec_base + gri_steam_base) / emp_base) * 100 - 100, 1))", key="gri_pe_chg", w=4),
            multi("Technical optimisations in existing buildings", ["Regulation and distribution of heating and cooling (consumption adapted to demand in real time)", "Lighting management", "Ventilation systems management",
                                                                    "Green IT in the data centres", "Maintaining an environmental quality label", "Sub-metering"], key="gri_optimisations", w=12),
            rich("Energy saving measures and their effect", key="gri_302_comment"), cols=2),
        sec("Appendix III - GRI 305: reduction of greenhouse gas emissions",
            text("Renewable energy supplier", key="gri_supplier", w=6), num("Renewable energy bought since (year)", key="gri_renewable_since", w=6),
            multi("Renewable sources bought", ["Hydropower", "Biomass", "Wind", "Solar", "Other"], key="gri_renewable_sources", w=12),
            num("Emissions avoided by the renewable purchase (tCO2e per year, average)", key="gri_avoided", w=12),
            rich("Other initiatives kept up to reduce greenhouse gas emissions", key="gri_305_comment"), cols=2),
        sec("Appendix III - GRI 306: waste by type and disposal method",
            text("Waste label or certification held (for example a national waste management quality label, with the standard it is certified to)", key="waste_label", w=12),
            text("Disposal route (municipal authority, contractor, recycler)", key="waste_route", w=12),
            rich("How waste is sorted in house and what happens to unsorted waste (for example incineration with energy recovery)", key="waste_sorting"),
            multi("Criteria of the waste label met", ["Motivation of all participants", "Transposition of all measures for waste prevention", "Visible and accessible collection sites", "Safe and environmentally correct storage",
                                                     "Waste collection according to types", "High-quality and transparent waste recycling and disposal", "Environmentally correct management"], key="waste_label_criteria", w=12),
            cols=2),
        table_sec("Appendix III - waste in each category of the European Waste Catalogue", table("ewc_waste", "Waste by European Waste Catalogue code (kg)", [
            col("EWC code", "code"), col("Official description of the waste", "description", width=30), colsel("Hazardous (*)", ["Yes", "No"], "hazardous"),
            colnum("Reporting year (kg)", "y0", total=True), colnum("Year -1 (kg)", "y1", total=True), colnum("Year -2 (kg)", "y2", total=True), colnum("Year -3 (kg)", "y3", total=True),
            colnum("Year -4 (kg)", "y4", total=True)], min_rows=1, max_rows=120, totals=True),
            description="Waste marked with an asterisk in the catalogue is hazardous waste. Enter the unit as kilograms; use the last row for restatements of waste volumes made at year end."),
        table_sec("Appendix IV - glossary of buildings", table("buildings", "Buildings and sites of the organisation", [
            col("Code", "abbreviation", width=10), col("Name of the building / site", "name", width=34), colsel("Use", ["Office", "Creche", "Data centre", "Warehouse", "Plant", "Other"], "use", width=14),
            colsel("Counted?", ["Yes", "Partly", "No"], "included", width=10), col("Reason if not (fully) counted in the footprint", "reason", width=28)], min_rows=1, max_rows=60)),
        sec("Appendix V - certificates of retirement of the carbon credits",
            note("Attach the retirement certificate of every batch of carbon credits listed under the compensation of emissions."),
            upload("Certificates of retirement of verified carbon units (VCU)", key="vcu_certificates"), upload("Other figures, charts and source documents", key="other_figures"), cols=1),

        sec("Verification",
            select("Level of assurance", ["No external verification", "Limited assurance", "Reasonable assurance"], key="assurance", w=6), date("Date of verification", key="verification_date", w=6),
            text("Verifier / verification body", key="verifier", w=12), rich("Verification statement and basis of the verification", key="verification_statement"),
            tables=[table("verification_findings", "Verification findings", [
                col("Clause / area", "area", width=20), col("Finding (what was seen)", "finding", width=34), col("Recommendation / corrective action", "action", width=30),
                col("Responsible", "owner"), coldate("Timeline", "timeline")], min_rows=0, max_rows=60)], cols=2),
        signoff(),
    ], form_type="ASSESSMENT", report=True)


AA_CARBON_CATALOGUE = [
    ("Carbon Footprint Report", carbon_footprint_report, "STUDY", "Energy and GHG", ["GHG", "ENV"]),
]
