"""The Environmental Audit Report: the client's two environmental audit reports integrated into ONE form (client's note: "Environmental Audit -
Two reports to be integrated").

    Uploads_GalleryFolders_130_6.3.4_58068.pdf  (green audit of a degree college: land use, water, energy, waste, plantation, carbon footprint)
    ENVIRONMENT-AUDIT-REPORT-2023.pdf           (carbon footprint environment audit of a college: transport, electricity, water and waste GHG, sinks)

Both are built by forms_catalogue_aa_campus.py; this file merges them chapter by chapter, so water, energy, waste, plantation and the carbon footprint
each appear once, with the questionnaire of the first report and the calculation tables of the second side by side. The filled form prints as a
report: cover page, table of contents, numbered chapters, question / answer tables.
"""
import re

from forms_dsl import form, reset_keys, rich
import forms_catalogue_aa_campus as campus

# fields of the first report that are narrative: they get the text editor
NARRATIVE = {"need", "objectives", "specific_objectives", "about", "survey", "evaluation", "conclusion", "urgent"}


def _section(sections, title):
    for s in sections:
        if s["title"] == title:
            return s
    raise KeyError(title)


def _retitled(section, title):
    out = dict(section)
    out["title"] = title
    out["section_code"] = title.upper().replace(" ", "_")[:40]
    return out


def environmental_audit():
    reset_keys()
    green = campus.green_audit()["sections"]
    carbon = campus.carbon_audit()["sections"]
    G = lambda title, new=None: _retitled(_section(green, title), new) if new else _section(green, title)  # noqa: E731
    C = lambda title, new=None: _retitled(_section(carbon, title), new) if new else _section(carbon, title)  # noqa: E731

    # --- audit details: the first report's block, plus the second report's reporting period and university
    details = dict(G("Audit details"))
    seen = {f["field_key"] for f in details["fields"]}
    details["fields"] = [f for f in details["fields"] if not f["field_key"].startswith("prepared_by_green")]
    details["fields"] += [f for f in C("Audit details")["fields"] if f["field_key"] not in seen]

    # --- cover page: the report's title
    cover = dict(C("Cover page"))
    cover["fields"] = [dict(f, default_value="Environmental Audit Report") if f["field_key"] == "report_title" else f for f in cover["fields"]]

    # --- introduction and methodology: the first report's chapters, with the second report's introduction, goals and methodology added
    c_intro = C("1. Introduction")
    # the second report numbered its own chapters ("2. Goals ..."); in the merged chapters the headings carry the numbers
    pick = lambda keys: [dict(f, label=re.sub(r"^\d+\.\s+", "", f["label"])) for f in c_intro["fields"] if f["field_key"] in keys]  # noqa: E731
    intro = dict(G("1. Introduction"), title="1. Introduction", fields=G("1. Introduction")["fields"] + pick({"introduction", "goals"}))
    method = dict(G("2. Methodology"), title="2. Methodology", fields=G("2. Methodology")["fields"] + pick({"methodology", "initiatives"}))

    # --- future strategies without the conclusion (one conclusion closes the report)
    strategies = dict(C("5. Future strategies for making the campus carbon-neutral"), title="4.2 Future strategies for making the campus carbon-neutral")
    strategies["fields"] = [f for f in strategies["fields"] if f["field_key"] != "conclusion"]

    def chapter(title, *pieces, description=None):
        """One section from several: the pieces' fields in order (each under its own sub-heading) and all their tables."""
        fields, tables = [], []
        with_fields = [p for p in pieces if p["fields"]]
        for piece in pieces:
            if piece["fields"] and len(with_fields) > 1:
                fields.append({"field_key": "heading", "label": piece["title"][:250], "field_type": "heading", "column_width": 12, "show_in_pdf": True})
            fields.extend(piece["fields"])
            # the report's own table numbers ("Table II.1 - ...", "Table 1.3 - ...") stay on the table headings
            if not piece["fields"] and len(piece["tables"]) == 1 and piece["title"].startswith("Table"):
                piece = dict(piece, tables=[dict(piece["tables"][0], table_name=piece["title"][:200])])
            tables.extend(piece["tables"])
        out = {"title": title, "section_code": title.upper().replace(" ", "_")[:40], "layout_columns": 2, "is_collapsible": False, "is_collapsed": False,
               "show_in_pdf": True, "page_break_before": False, "fields": fields, "tables": tables}
        if description:
            out["description"] = description
        return out

    ordered = [
        cover, details, C("Strength and working days"), intro, method, C("Emission factors and constants used"),
        chapter("3.1 Land use", G("3.1 Land use"), G("Student and staff strength")),
        chapter("3.2 Water audit",
                G("3.2 Water audit - questionnaire"), G("Tank capacity by source of water (litres per day)"), G("Utilisation of water per day"), G("Water meter record for six months"),
                G("Water quality assessment"), C("3. GHG emissions from waste water and solid waste", "Scope and GHG from waste water and solid waste"),
                C("Consumption of water by the blocks"), C("Consumption of water by the departments"), C("Consumption of water by purpose"), C("Water - GHG from waste water and figures")),
        chapter("3.3 Energy audit",
                G("3.3 Energy audit - questionnaire"), G("Energy used by the equipment"), G("Solar and other alternative energy"),
                C("2. CO2 emission from electricity", "CO2 emission from electricity"), C("Equipment-wise consumption (rating x hours x working days)"),
                C("Table II.1 - Department-wise consumption of electricity by categories I, II and III"), C("Break up of the category I equipment"), C("2.2 Calculations and results", "Calculations and results")),
        chapter("3.4 Waste management",
                G("3.4 Waste management - questionnaire"), G("Area occupied"), G("Surroundings and level of disturbance"), G("Waste generated"),
                C("3.2 Waste audit", "Waste audit - GHG from solid waste"), C("Distribution of the waste generated by location"), C("Waste - GHG, results and figures", "Results and figures")),
        chapter("3.5 Plantation audit",
                G("3.5 Plantation audit - questionnaire"), G("Plants in the ornamental garden (Annexure I)"), G("Medicinal plants (Annexure II)"), G("Plants with QR codes"),
                G("Tree plantation drives"), G("Eco club activities"), C("Table 5.1 - Species on the campus")),
        chapter("3.6 Carbon footprint",
                G("Carbon footprint - questionnaire"), G("Transport and fuel"),
                C("1.1 CO2 emission from transportation - components of the calculation", "CO2 emission from transportation - components of the calculation"),
                C("Table 1.1 - Total distance (km), mode of transportation wise"), C("Total distance, fuel wise (Table 1.3)"),
                C("Total distance, total fuel consumption and total kgCO2 equivalence"), C("Table 1.2 - Distance travelled and CO2 by vehicle type"),
                C("CO2 equivalence calculation (activity x emission factor)"), C("Transport - results and figures", "Transport - results and figures"),
                G("Air quality determination"), G("Noise level in and around the college")),
        chapter("3.7 Best practices to reduce the carbon footprint", C("4. Best practices to reduce the carbon footprint", "Tree cover, composting, solar power and plastic waste"), C("Plastic waste given for recycling")),
        chapter("4. Recommendations and future strategies", G("Recommendations"), strategies),
        G("5. Conclusion"),
        chapter("6. Awards for environmental sustainability", C("6. Awards for environment sustainability", "Awards and recognitions"), C("Awards and recognitions")),
        C("Summary of emissions"), C("7. Resources"), C("Supporting documents"), G("Auditor sign-off"),
    ]

    # --- the narrative fields get the text editor
    for section in ordered:
        for f in section["fields"]:
            if f["field_key"] in NARRATIVE and f["field_type"] == "textarea":
                f["field_type"] = "rich_text"

    # --- keys must be unique in the merged form: notes are renumbered, a clashing key or table key gets a suffix
    # a table key and a field key share one namespace in the form builder
    field_keys, table_keys, note_count = set(), set(), 0
    merged = []
    for section in ordered:
        section = dict(section)
        fields = []
        for f in section["fields"]:
            f = dict(f)
            if f["field_type"] == "paragraph" and f["field_key"].startswith("note"):
                note_count += 1
                f["field_key"] = f"note_{note_count:03d}"
            key, n = f["field_key"], 1
            while f["field_key"] in field_keys:
                n += 1
                f["field_key"] = f"{key}_{n}"
            field_keys.add(f["field_key"])
            table_keys.add(f["field_key"])
            fields.append(f)
        tables = []
        for t in section["tables"]:
            t = dict(t)
            key, n = t["table_key"], 1
            while t["table_key"] in table_keys or t["table_key"] in field_keys:
                n += 1
                t["table_key"] = f"{key}_{n}"
            table_keys.add(t["table_key"])
            tables.append(t)
        section["fields"], section["tables"] = fields, tables
        merged.append(section)

    return form("Environmental Audit Report",
                "Environmental audit of a campus or facility: land use, water, energy, waste, plantation and the carbon footprint (transport, electricity, waste water and "
                "solid waste GHG, sinks, best practices), with the questionnaires and calculation tables of the client's two reports integrated.",
                "ENA", merged, form_type="AUDIT", report=True)


AA_ENV_CATALOGUE = [
    ("Environmental Audit Report", environmental_audit, "AUDIT", "Environment", ["ENV", "GHG"]),
]
