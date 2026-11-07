"""One general-purpose report form for every Audit and Assessment entry that has no form of its own yet (2026-11-06: the client wants every audit on the
list to be doable by any auditor, so no entry may say "coming soon"). It is not a copy of a client document: it holds what every audit report holds - the
audit details, scope and method, the compliance count, the findings with a rating, recommendation and timeline, the evidence and the conclusion - and prints
as a report like the other Audit and Assessment forms. An entry that later gets its own form from a client sample keeps this one next to it.
"""
from forms_dsl import area, col, coldate, colsel, date, form, formula, header, multi, note, num, reset_keys, rich, sec, select, signoff, table, table_sec, text, upload
from forms_catalogue_aa_studies import cover

RATING = ["Compliant", "Observation", "Minor non-conformity", "Major non-conformity", "Critical", "Not applicable"]


def general_audit_report():
    reset_keys()
    return form("General Audit and Assessment Report", "A general audit or assessment report: audit details, scope and method, compliance count, findings with rating, recommendation and "
                "timeline, evidence and conclusion. Used for any audit on the Audit and Assessment list.", "GAR", [
        cover("Audit and Assessment Report", text("Audit or assessment carried out", key="audit_name"), text("Client / company audited", key="client_name")),
        header("Audit reference", extra=[
            select("Type of work", ["Statutory compliance audit", "Third-party audit", "Buyer / code of conduct audit", "Gap assessment", "Risk assessment", "Safety and housekeeping audit",
                                    "Training and awareness programme", "Project review"], key="work_type")]),
        sec("Scope and method",
            text("Audit criteria (Acts, rules, standards, buyer code or internal procedure applied)", key="criteria", w=12),
            date("First day on site", key="start_date"), date("Last day on site", key="end_date"), num("Man-days spent", key="man_days"),
            text("People met / interviewed (name and designation)", key="people_met", w=12),
            multi("Method used", ["Document and record review", "Site walk-through", "Interviews with management", "Interviews with workers", "Measurements / tests", "Photographs"], key="methods", w=12),
            rich("Scope of the audit and the areas covered", key="scope"), rich("Documents and records reviewed", key="documents"), cols=2),
        sec("Compliance count",
            num("Points verified", key="points", w=3), num("Compliant", key="compliant", w=3), num("Non-compliant", key="noncompliant", w=3), num("Not applicable", key="not_applicable", w=3),
            formula("Compliance (%)", "IF(points - not_applicable == 0, 0, ROUND(compliant / (points - not_applicable) * 100, 1))", key="compliance_pct", w=6),
            formula("Points not accounted for", "points - compliant - noncompliant - not_applicable", key="unaccounted", w=6), cols=2),
        table_sec("Findings", table("findings", "Observations, non-conformities and recommendations", [
            col("Area / clause / requirement", "area", width=22), col("Observation (what was seen)", "observation", width=28), col("Evidence (record, photograph, reference)", "evidence", width=16),
            colsel("Rating", RATING, "rating", width=12), col("Recommendation / corrective action", "recommendation", width=28), col("Responsible", "owner", width=12),
            coldate("Target date", "target"), colsel("Status", ["Open", "In progress", "Closed"], "status")], min_rows=1, max_rows=200)),
        sec("Evidence",
            note("Photographs of the findings, copies of the records and any measurement sheets are attached here and printed with the report."),
            upload("Photographs", key="photos"), upload("Records, certificates and measurement sheets", key="records"), cols=1),
        sec("Conclusion",
            rich("Summary of the audit", key="summary"), rich("Recommendations and follow-up needed", key="followup"),
            date("Date of the closing meeting", key="closing_date"), text("Management representative at the closing meeting", key="closing_rep"), cols=1),
        signoff(),
    ], report=True)


AA_GENERAL_CATALOGUE = [
    ("General Audit and Assessment Report", general_audit_report, "AUDIT", "General Audit", []),
]
