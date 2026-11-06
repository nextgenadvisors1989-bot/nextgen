"""The ETP workbook of the client's third batch (Bluwin SKPL ETP Report.xlsx, 2026-11-05): its "ETP Treatment Level" sheet (the processes of every treatment level, sludge
treatment and disposal pathways, ZLD / RO details) and its "Report & CAP" sheet (findings with responsible person, action plan and timeline).
The other sheets of the workbook ("Assessment form", "Instructions") are the H&M ETP Functionality Assessment that the platform already has as the form
"ETP Functionality Assessment Form", so this one is its companion and is linked next to it.
"""
from forms_dsl import col, coldate, colsel, date, form, header, multi, note, num, reset_keys, rich, sec, select, signoff, table, table_sec, text, upload
from forms_catalogue_aa_studies import cover


def etp_treatment_levels():
    reset_keys()
    return form("ETP Treatment Level Assessment", "The treatment levels and processes of an effluent treatment plant, sludge handling and disposal pathway, ZLD and RO details, the grading, the pictures "
                "of every treatment level and the findings with corrective action plan (companion of the ETP Functionality Assessment).", "ETL", [
        cover("ETP Treatment Level Assessment", text("Assessor company", key="assessor_company"), text("Lead assessor", key="lead_assessor")),
        header("ETP Treatment Level Assessment", extra=[
            text("SPUR ID", key="spur_id"),
            select("Type of ETP assessment", ["Onsite ETP assessment by nominated third party", "Onsite ETP assessment by internal team", "Desktop review"], key="assessment_type"),
            num("ETP capacity (m3/hour)", key="etp_capacity"), num("ETP operating hours", key="etp_hours")]),
        sec("Treatment levels and processes (select every process that applies to the ETP)",
            multi("Pre-treatment", ["Flow equalization tank / basin", "Flow segregation", "Static screening", "Mechanical screening", "Grit removal", "pH correction"], key="pre_treatment", w=12),
            multi("Primary treatment", ["Chemical / electromechanical coagulation and flocculation", "Dissolved air flotation (DAF)", "Primary sedimentation (clarification)", "Chemical oxidation"],
                  key="primary_treatment", w=12),
            multi("Secondary treatment", ["Activated sludge process", "Sequencing batch reactor (SBR)", "Trickling filters", "Moving bed bio reactor (MBBR)", "Membrane bioreactor (MBR)", "Anaerobic digestion",
                                          "UASB (up flow anaerobic sludge blanket) reactor", "Aerated ponds"], key="secondary_treatment", w=12),
            multi("Tertiary treatment", ["Sand filtration (single / dual / multigrade)", "Activated carbon / resin adsorption"], key="tertiary_treatment", w=12),
            multi("Advanced treatment", ["Colour removal - electrochemical oxidation / Fenton reaction", "Crystallization", "Disinfection", "Chemical / UV / ozone disinfection (ozonation)", "Ion exchange",
                                         "Membrane technologies - MF / UF / NF / RO", "Photocatalytic degradation", "Salt recovery", "Thermal / membrane evaporation"], key="advanced_treatment", w=12),
            text("Any other process not in the lists", key="other_process", w=12), rich("Treatment scheme / flow", key="scheme"), cols=1),
        sec("Sludge treatment and disposal",
            multi("Sludge treatment", ["Sludge thickening", "Mechanical dewatering (filter press / belt press / screw press)", "Secondary sludge digester", "Sludge drying"], key="sludge_treatment", w=12),
            multi("Sludge disposal / disposition", ["Disposal pathway A - offsite incineration at above 1000 deg C", "Disposal pathway B - landfill with significant control measures",
                                                    "Disposal pathway C - building products processed at above 1000 deg C", "Disposal pathway D - landfill with limited control measures",
                                                    "Disposal pathway E - offsite incineration and building products processed at below 1000 deg C", "Disposal pathway F - landfills with no control measures",
                                                    "Disposal pathway G - land application"], key="sludge_disposal", w=12),
            text("Sludge quantity generated and disposal agency / authorisation", key="sludge_agency", w=12), cols=1),
        sec("ZLD, reverse osmosis and reject water",
            select("ZLD (zero liquid discharge)", ["Yes", "No"], key="zld"),
            select("Stages of reverse osmosis (RO) plant", ["No RO", "One stage", "Two stage", "Three stage", "Four stage", "Five stage", "More than five stage"], key="ro_stages"),
            select("Reject water disposal route", ["Evaporation - thermal / solar", "Evaporation + condensation - SEE", "Evaporation + condensation - MEE", "Sent to offsite / CETP",
                                                   "No NF / RO membrane reject water", "Other"], key="reject_route"),
            text("ATFD (agitated thin film dryer) details", key="atfd"), num("Recycling in process (%)", key="recycling"), cols=2),
        sec("Grading",
            select("Grading of the ETP", ["Red", "Yellow", "Green"], key="grading"), select("Desktop grading", ["Red", "Yellow", "Green"], key="desktop_grading"),
            num("Buffer capacity", key="buffer_capacity"), date("Date of assessment", key="assessment_date"), date("Date of report release", key="release_date"),
            note("The report is generated from the observations on the day of assessment; a later process or test failure may change the grading."), cols=2),
        sec("Pictures of the treatment levels",
            note("For a Green graded ETP, pictures of every treatment level, of the monitored data on dashboards, pH and DO monitors and of the flow meters are attached."),
            upload("ETP - pictures of each treatment level", key="img_etp"), upload("Flow meters", key="img_flowmeters"), upload("Legal documents", key="img_legal"),
            upload("Test reports", key="img_reports"), upload("MEE and RO", key="img_mee_ro"), upload("Other pictures", key="img_other"), cols=1),
        table_sec("Findings and corrective action plan", table("cap", "Documents not acceptable and questions answered No", [
            col("Ref. (D1 - D12, T 1.1, P 2.1, C 3.1)", "ref"), col("Document / question", "item", width=28), colsel("Yes / No", ["Yes", "No", "Incomplete"], "answer"),
            col("Observation / finding", "finding", width=28), col("Responsible", "owner"), col("Action plan", "action", width=24), coldate("Timeline", "timeline")], min_rows=1, max_rows=120)),
        signoff(),
    ], form_type="ASSESSMENT", report=True)


AA_ETP_CATALOGUE = [
    ("ETP Treatment Level Assessment", etp_treatment_levels, "ASSESSMENT", "Environment", ["ENV", "WATER"]),
]
