"""The seven Permit to Work forms, word for word from the client's file "PTW's .pdf" (client's note: "Please don't change any content").

    Cold Work Permit                  Confined Space to Entry Permit      Electrical (Isolation) Permit      Excavation Permit
    Hot Work Permit                   Lifting Operation Permit            Work at Height Permit

Every permit has the same shape as the paper form: the permit details, the risks (tick boxes), the documents attached, the Yes / No / N/A
precautions with the follow-up answers the paper asks for under them, the areas inspected, the PPE, then Issue and acceptance (receiver, issuer,
contractor's safety engineer, SEC consultant), Clearance and Suspension, and on the second page the additional precautions and the Permit
Re-Validation table (the Confined Space permit has its entrants / attendants log instead). Wording, spelling and punctuation of the questions and
options are the client's; only the colons that end a label on paper are left off, and the check-boxes became tick lists.

Signatures are drawn on the screen (mouse, stylus or finger). They are not required to submit, because a permit is signed in stages.
"""
from forms_dsl import (area, clock, col, colclock, coldate, date, form, heading, multi, note, num, reset_keys, sec, select, sign, table, text)

YNA = ["Yes", "No", "N/A"]

PERMIT_VALID = "This permit is valid for 7 days from the date of issue."
ADDITIONAL = "List of additional precaution measures required (SEC Consultant/ Contractor's Safety Engineer/ Officer)"


# ───────────────────────────── building blocks ─────────────────────────────

def _when(completion_date=True):
    fields = [date("Starting From Date"), clock("Starting From Time")]
    if completion_date:
        fields.append(date("Expected Completion Date"))
    fields.append(clock("Expected Completion Time"))
    return fields


def _job(tools_label):
    return [area("Work Description"), text("Location of job to be performed", w=12), text(tools_label, w=12)]


def _risks(title, options):
    return sec(title, multi("Tick all that apply", options, w=12), text("Other(Specify)", w=12), cols=1)


def _documents(options=("Method Statement", "Risk Assessment")):
    return sec("The following document must be attached with this permit", multi("Tick all that apply", list(options), w=12), text("Other (specify)", w=12), cols=1)


def _q(question, *follow):
    """One precaution: the Yes / No / N/A answer and whatever the paper asks for underneath it."""
    return [select(question, YNA, w=12), *follow]


def _contacts():
    return [text("Contact Numbers 1", w=4), text("Contact Numbers 2", w=4), text("Contact Numbers 3", w=4)]


def _precautions(title, questions, other=True):
    fields = [f for question in questions for f in question]
    if other:
        fields.append(text("Other (specify)", w=12))
    return sec(title, *fields, cols=1)


def _inspected(options, extinguisher=False, other=True):
    fields = []
    if extinguisher:
        fields += [text("Fire Extinguisher Type", w=4), text("Quantity", w=4), text("Size", w=4)]
    fields.append(multi("Tick all that apply", options, w=12))
    if other:
        fields.append(text("Other (specify)", w=12))
    return sec("The following areas / items have been inspected by issuer and receiver", *fields, cols=1)


def _ppe(options, other_label="Other (Specify)"):
    return sec("PPE Required for the activity", multi("Tick all that apply", options, w=12), text(other_label, w=12), cols=1)


def _person(name_label):
    return [text(name_label, w=6), date("Date", w=6), sign("Signature")]


def _signoffs(informed, dot):
    """Issue and acceptance, Clearance and Suspension. The client's four permits differ by two phrases, kept exactly."""
    receiver = ("I certify that, I have read and verified this work permit and checklist. "
                + ("I have been informed about the risk assessment results. " if informed else "")
                + "I am aware of the risks that can be exposed to. I commit that I will be in line with all safety rules mentioned in work permit checklist "
                  "and will not deflect any of them.")
    issuer = ("I reviewed the work permission checklist and checked the working conditions. I have reviewed the all aspects of the task/activity and am satisfied "
              "with the arrangements as detailed in the “risk assessment” have been put in place and certify that the activity detailed above is authorized to proceed")
    clearance = (f"All men, materials, tools equipment, housekeeping etc{'.' if dot else ''} under my charge have been withdrawn. The permitted work is complete / not complete.")
    suspension = "This permit is suspended, I have notified the Authorized person specified that the work is not complete the area / equipment is not safe to use."
    return [
        sec("Issue and acceptance before work",
            heading("Acceptance of Work Permission by the person in-charge (Receiver)"), note(receiver), *_person("Permit Receiver Name"),
            heading("Authority to proceed by authorized person (Issuer)"), note(issuer), *_person("Permit Issuer Name"),
            heading("Acknowledge by Contractor's Safety Engineer/Officer"), *_person("Name"),
            heading("Verification by SEC Consultant (If appointed for the project)"), *_person("Name"),
            cols=2),
        sec("Clearance and cancellation after work or Suspension of permit",
            heading("Clearance. (Site Manager)"), note(clearance), *_person("Name"),
            heading("Suspension"), note(suspension), *_person("Name"),
            cols=2),
    ]


def _additional():
    return sec(ADDITIONAL, *[text(f"{n}.", w=12) for n in range(1, 6)], cols=1, page_break=True)


def _revalidation():
    return sec("Permit Re-Validation", description=PERMIT_VALID, cols=1, tables=[table(
        "revalidation", "Permit Re-Validation",
        [coldate("Date", "date"), colclock("Time", "time"), col("Issuer Signature", "issuer_signature"), col("Receiver Signature", "receiver_signature"),
         col("Contractor's Safety Signature", "contractor_safety_signature"), col("Verification by SEC Consultant", "sec_consultant"), col("Remarks", "remarks")],
        min_rows=0, max_rows=7,
        description="One row for each re-validation (up to 7). Type the name of the person who signed.")])


def _permit(name, description, prefix, sections):
    reset_keys()
    return form(name, description, prefix, sections, form_type="PERMIT")


# ───────────────────────────── the seven permits ─────────────────────────────

def cold_work():
    return _permit("Cold Work Permit", "Permit to work: Cold Work (the client's own permit, word for word).", "CWP", [
        sec("Cold Work Permit", text("PTW Ref .No"), text("Contractor"), text("Project Name"), num("No. of Employees involved"), *_when(),
            text("Activity", w=12), *_job("Tool/Equipment to be used")),
        _risks("Identify risk associated with this Cold Work", [
            "Fall from Height", "Adverse Weather", "Flying particles", "Moving Vehicle/ Equipment", "Falling Debris/ Objects", "Protruding objects, parts",
            "Tripping / Slipping", "Faulty Tool/ Material", "Noise", "Heat", "Vibration", "Poor Illumination"]),
        _documents(),
        _precautions("Precaution require to complete the work safely", [
            _q("Have tools and devices to be used been tested and adjusted?"),
            _q("Have all hazards/hazardous related to the this activities identified and assessed?",
               multi("Hazards identified", ["Working at height", "Scaffolding", "Pressure Test", "Chemical", "Electrical", "Saw/Cold cut", "Hot Surface", "Tool & Equipments", "Dust", "Lifting"], w=12)),
            _q("Are permits associated require for this activity? if yes, mentioned below;",
               multi("Permits required", ["Hot Work", "Working At Height", "Excavation", "Electrical", "Confined Space to Entry"], w=12), text("Other (specify)", w=12)),
        ]),
        _inspected(["Access/Egress", "Danger/Warning Sign", "Lighting", "Safety Barriers", "Hand Tools"]),
        _ppe(["Helmet", "Safety Shoes", "Safety Gloves", "Safety Ear Plugs/muff", "Safety goggles", "Reflective Vest", "Dust Mask", "Safety clothes"]),
        *_signoffs(informed=False, dot=False),
        _additional(), _revalidation(),
    ])


def confined_space():
    return _permit("Confined Space to Entry Permit", "Permit to work: Confined Space to Entry (the client's own permit, word for word).", "CSE", [
        sec("Confined Space to Entry Permit", text("PTW Ref .No"), text("Contractor Name"), text("Project Name"), text("Location"), *_when(completion_date=False),
            *_job("Tools/Equipments to be used")),
        _risks("Identify risk associated with this confined space entry", [
            "Lack of Oxygen", "Explosion", "Biological", "Noise", "Asphyxiation", "Fire", "Dust", "Vibration", "Engulfment", "Fume/Vapor", "Hot", "Traffic"]),
        _documents(),
        _precautions("Precaution require to complete the work safely", [
            _q("Are atmospheric inspection made?",
               num("Oxygen % (19.5 - 23.5 %)", w=6), num("Explosive % LEL (Less than 10%)", w=6),
               num("CO PPM (less than 35 PPM -8hr)", w=6), num("H2S PPM (less than 10PPM - 8hr)", w=6)),
            _q("Has appropriate ventilation provided after atmospheric inspection made?",
               multi("Ventilation", ["Natural", "Mechanical"], w=12), text("Mechanical (state details)", w=12)),
            _q("Is appropriate communication system in place? if yes, state", text("State", w=12)),
            _q("Are entrant and attendant very well known about emergency procedure?"),
            _q("Does the work require access to hot work? If yes, obtain a Hot work permit"),
            _q("If required, lockout /Tagout system is followed?"),
            _q("Are emergency team available in place or contact number displayed at place?", *_contacts()),
        ]),
        _inspected(["Access/Egress", "Danger/Warning Sign", "Lighting", "Log book register", "Gas Detector"], extinguisher=True),
        _ppe(["Helmet", "Safety Shoes", "Mechanical Gloves", "Safety Ear Plugs/muff", "Safety goggles", "Reflective Vest", "Gas Mask", "Safety Harness", "Gumboot", "Dust Mask"],
             other_label="Others (Specify)"),
        *_signoffs(informed=True, dot=True),
        _additional(),
        sec("Entry log", text("Supervisor Name", w=6), text("Permit Ref. No", w=6), date("Date", w=6), text("Location", w=6),
            heading("Entry Conditions"),
            note("• Confined Space Permit must be in place\n• If you fit for work (health fitness)\n• If you have adequate/appropriate PPE"),
            cols=2, tables=[table("entry_log", "Entry log", [col("Name", "name"), colclock("Time in", "time_in"), col("Sign", "sign_in"), colclock("Time Out", "time_out"), col("Sign", "sign_out")],
                                  min_rows=0, max_rows=40)]),
        sec("Details of Entrants", cols=1, tables=[table("entrants", "Details of Entrants", [col("Entrant Name", "name"), col("ID No", "id_no"), col("Designation", "designation"), col("Signature", "signature")],
                                                         min_rows=0, max_rows=40)]),
        sec("Details of Attendants", cols=1, tables=[table("attendants", "Details of Attendants", [col("Attendant Name", "name"), col("ID No", "id_no"), col("Designation", "designation"), col("Signature", "signature")],
                                                           min_rows=0, max_rows=20)]),
    ])


def electrical_isolation():
    return _permit("Electrical (Isolation) Permit", "Permit to work: Electrical (Isolation) (the client's own permit, word for word).", "LOT", [
        sec("Electrical (Isolation) Permit", text("PTW Ref .No"), date("Date"), text("Project Name"), num("Number of Employees"), *_when(),
            multi("Energized Lines/Equipment / De-Energized Line/ Equipment", ["Energized Lines/Equipment", "De-Energized Line/ Equipment"], w=12),
            *_job("Tool/Equipments to be used")),
        _risks("Identify risk associated with this Electrical work", [
            "Electrocution", "Arc Flash", "Flying particles", "Noise", "Falling Objects", "Protruding objects, parts", "Tripping / Slipping", "Electric shock",
            "Fire", "Manual handling", "Electric Burn", "Near Overhead lines"]),
        _documents(),
        _precautions("Precaution require to complete the work safely", [
            _q("Is the safe distance maintained?", text("Voltage", w=6), text("Distance", w=6)),
            _q("Does the work require access to confined spaces? If yes, obtain a confined space entry permit"),
            _q("Have all possible sources of electrical power been isolated, locked and properly tagged (LOTO)?"),
            _q("Is below mentioned any one of Isolation in place and the isolation followed as per procedure?",
               multi("Isolation", ["Switch Out", "Lockout/ Tag out"], w=12), text("No. of Locks", w=6)),
            _q("Has it been confirmed by testing, that the lines / equipment are de-energized ?"),
            _q("Have tools and devices to be used been tested and adjusted?"),
        ]),
        _inspected(["Access/Escape Route", "Danger/Waning Sign", "Lighting", "Safety Barriers", "Stick", "Portable Radio"], extinguisher=True),
        _ppe(["Helmet", "Safety Shoes", "Electrical Gloves", "Half Mask", "Safety goggles", "Reflective Vest", "Dust Mask", "Safety clothes", "Face shield", "Arc flash PPE",
              "Safety Ear Plugs/muff"], other_label="Other"),
        *_signoffs(informed=True, dot=True),
        _additional(), _revalidation(),
    ])


def excavation():
    return _permit("Excavation Permit", "Permit to work: Excavation (the client's own permit, word for word).", "EXC", [
        sec("Excavation Permit", text("PTW Ref .No"), date("Date"), text("Project Name"), num("No. of Employee involved"), *_when(),
            text("Excavation / Trench Depth", w=4), text("Length", w=4), text("Width", w=4), *_job("Tools/Equipment to be used")),
        _risks("Identify risk associated this Excavation", [
            "Personnel Falling", "Underground Utilities", "Biological", "Noise", "Falling Objects / Equipments", "Cave in (Collapse)", "Dust", "Vibration", "Flood",
            "Adjacent Structure", "Heat", "Traffic"]),
        _precautions("Precaution require to complete the work safely", [
            _q("Is method statement attached with this permit?"),
            _q("Is risk assessment attached with this permit?"),
            _q("Are the equipments/machineries inspected and valid certification available for equipment & operator ?"),
            _q("Is the hard barrier given and safe distance (at least 1 meter from the edge of excavation) maintained?"),
            _q("Are type of soil identified? if yes mention below", multi("Type of soil", ["Stable Rock", "Type A", "Type B", "Type C"], w=12)),
            _q("Will the excavation be 5 or more feet deep and will personnel be entering? If yes, state below the control measures been implemented:",
               multi("Control measures", ["Shoring", "Shielding", "Benching", "Sloping"], w=12), text("Details", w=12)),
            _q("Will the excavation be 20 or more feet deep? If yes, Name of Professional Engineer", text("Name of Professional Engineer", w=12)),
            _q("Are underground utilities checked below by means of appropriate detector through as build drawings, and marked accordingly at the work location",
               multi("Underground utilities", ["Electrical", "Sewer", "Communications", "Storm water", "Gas Line"], w=12)),
            _q("If underground utlities found, trial hole system (manual digging) is followed?"),
            _q("Are adequate inspection system followed for during, after excavation and backfilling?"),
        ]),
        _inspected(["Access/Egress", "Danger/Warning Sign", "Lighting/Flickering", "Flag man", "Detector (multi)", "As built Drawing"]),
        _ppe(["Helmet", "Safety Shoes", "Mechanical Gloves", "Safety Ear Plugs/muff", "Safety goggles", "Reflective Vest", "Dust Mask", "Safety clothes", "Gumboot"],
             other_label="Others (Specify)"),
        *_signoffs(informed=False, dot=True),
        _additional(), _revalidation(),
    ])


def hot_work():
    return _permit("Hot Work Permit", "Permit to work: Hot Work (the client's own permit, word for word).", "HWP", [
        sec("Hot Work Permit", text("PTW Ref .No"), text("Contractor"), text("Project Name"), num("Number of employees involved"), *_when(),
            multi("Welding / Bracing/Cutting/Grinding/Soldering", ["Welding", "Bracing/Cutting/Grinding/Soldering"], w=12), *_job("Tools/Equipment to be used")),
        _risks("Identify risk associated with this Hot Work", [
            "Electrocution", "Arc flash", "Flying particles", "Noise", "Falling Objects", "Protruding objects, parts", "Tripping / Slipping", "Electric shock",
            "Fire/Spark", "Manual handling", "Hot burn", "Explosion", "Health Hazard", "Fume /smoke"]),
        _documents(),
        _precautions("Precaution measures require to complete the work safely", [
            _q("Are you certified (welder) to undertake this work?"),
            _q("Is Equipment/Machine inspected and color coding available of the current month?"),
            _q("Are all combustible materials removed or shield from sparks?"),
            _q("Are the hoses inspected?", multi("Hoses", ["Free from grease/oil", "cut/crack", "Fitting (Special clips)"], w=12)),
            _q("Are regulator and Gauges inspected ?", multi("Regulator and Gauges", ["Defects/Broken", "Fitting", "Calibration"], w=12),
               multi("Pressure", ["Oxygen - release not exceed 50psi", "Acetylene - release not excess 15 psi"], w=12)),
            _q("Are flash back arrestors provided?"),
            _q("Are the cylinders provided with cap, trolley, chain and appropriate relieve valve?"),
            _q("Are emergency team available in place or contact number displayed at place?", *_contacts()),
            _q("Have tools and devices to be used been tested and adjusted?"),
        ]),
        _inspected(["Fire Canopy", "Danger/Waning Sign", "Lighting", "Safety Barriers", "Fire Watcher", "Fume Extractor/Ventilation", "Friction light", "Container (Rods)",
                    "Fire Blanket", "Sand Bucket"], extinguisher=True),
        _ppe(["Helmet", "Safety Shoes", "Welding Gloves", "Face shield", "Welding goggles", "Apron (Welding)", "Gas Mask", "Ear Plugs/muff", "Welding shield", "Welding Clothes"],
             other_label="Others (specify)"),
        *_signoffs(informed=False, dot=False),
        _additional(), _revalidation(),
    ])


def lifting_operation():
    return _permit("Lifting Operation Permit", "Permit to work: Lifting Operation (the client's own permit, word for word).", "LOP", [
        sec("Lifting Operation Permit", text("PTW Ref .No"), text("Contractor Name"), text("Project Name"), num("No. of Employees involved"), *_when(),
            multi("Lifting Equipment", ["Truck Mounted", "Crawler Crane", "Overhead Crane", "Tower Crane"], w=12),
            text("Details of Load Weight (approx.)", w=4), text("Dimension (max)", w=4), text("Quantity", w=4),
            select("Rigger Level", ["Less than 10 ton (Rigger level3)", "More than 10 to 40 ton (Rigger level 2)", "More than 40 (rigger level1)"], w=12),
            text("Details of Equip. Serial No", w=4), date("Valid Inspection Date", w=4), text("Capacity (SWL)", w=4),
            *_job("Tools/Equipment to be used")),
        _risks("Identify risk associated with Lifting work", [
            "Toppling/Tip Over/Turn Over", "Suspended Load", "High Wind", "Moving Vehicle/ Equipment", "Falling Objects", "Over Load", "Tripping / Slipping", "Noise",
            "Crushing", "Collapse", "Near Overhead lines", "Traffic", "Adverse Weather"]),
        _documents(("Method Statement", "Risk Assessment", "Lifting Plan (Refer procedure)")),
        _precautions("Precaution require to complete the work safely", [
            _q("Is the lifting equipment certified by accredited center and complied with SEC list?"),
            _q("Is the operator certified and hold valid license (KSA) to carried out this activity?", date("Certified: Expiry Date", w=6), date("License: Expiry Date", w=6)),
            _q("Are all accessories inspected (rigging arrangements)? if yes state below",
               multi("Accessories", ["Wire Rope Sling", "Web Sling", "Chain Sling", "Shackles", "Eye Bolt"], w=12), text("Other", w=12)),
            _q("Is Load Charts Checked? Is the Load within Crane capability at the given radius of operation?"),
            _q("Is the rigger certified to carried out this activity as per the load limit?",
               text("Name of Rigger", w=6), text("Rigger Level", w=6), text("Validity", w=6), date("Expiry Date", w=6)),
            _q("Is wind speed acceptable to proceed the activity ? (stop if any dusty wind or more than 32km/h)"),
            _q("Emergency Rescue team and equipment (tower erection) in place?"),
        ], other=False),
        _inspected(["Ground condition", "Danger/Warning Sign", "Signal man", "Safety Barriers", "Tag line", "Rigger", "Outrigger (extended)", "Lighting", "Out rigger Pad",
                    "Spreader Beam", "Man/Material Basket (Certified)"], other=False),
        _ppe(["Helmet", "Safety Shoes", "Mechanical Gloves", "Ear Plugs/muff", "Safety goggles", "Reflective Vest", "Dust Mask", "Safety clothes"]),
        *_signoffs(informed=False, dot=False),
        _additional(), _revalidation(),
    ])


def work_at_height():
    return _permit("Work at Height Permit", "Permit to work: Work at Height (the client's own permit, word for word).", "WAH", [
        sec("Work at Height Permit", text("PTW Ref .No"), text("Contractor"), text("Project Name"), num("No. of Employees involved"), *_when(),
            multi("Scaffolding / Ladder / Aerial Lifts / Roof Work", ["Scaffolding", "Ladder", "Aerial Lifts", "Roof Work"], w=12), text("Other; Specify", w=12),
            *_job("Tools/Equipment to be used")),
        _risks("Identify risk associated with Work At Height", [
            "Fall from Height", "Adverse Weather", "Flying particles", "Moving Vehicle/ Equipment", "Falling Debris/ Objects", "Protruding objects, parts", "Tripping / Slipping",
            "Faulty Equipment/ Material", "Fragile surface /Roof", "Work Under Below", "Near Overhead lines", "Near energized equipment"]),
        _documents(),
        _precautions("Precaution require to complete the work safely", [
            _q("Have the risk control/s been implemented? if yes state below",
               multi("Fall Protection", ["Guard Rails system", "Safety Net", "Toe Board"], w=12),
               multi("Fall restraint", ["Life Line", "Retractable Harness"], w=12),
               multi("Fall arrest", ["Harness with Shock absorber & Double Hook"], w=12)),
            _q("Have proper access/egress been provided?"),
            _q("Is wind speed greater than 32 km/h? If yes, do not proceed the activity"),
            _q("Are all floor openings at roof adequately covered/protected to prevent falling?"),
            _q("Is the scaffold erected and inspected by Certified person? (if no do not proceed the activity)"),
            _q("Are the scaffold , ladder, Arial lift inspected it?", text("Name of Inspector", w=6), date("Date of Inspection", w=6)),
        ]),
        _inspected(["Danger/Warning Sign", "Scaffold Tag System", "Lighting", "Safety Barriers", "Buddy System", "Rescue", "Material basket"]),
        _ppe(["Helmet with Chin strap", "Safety Shoes", "Safety Gloves", "Safety Ear Plugs/muff", "Safety goggles", "Reflective Vest", "Dust Mask", "Safety clothes"]),
        *_signoffs(informed=True, dot=True),
        _additional(), _revalidation(),
    ])


# (module name, builder, module_type, category, [the module's earlier name, when the client renamed it])
PTW_CATALOGUE = [
    ("Cold Work Permit", cold_work, "WORK_PERMIT", "Permits", None),
    ("Confined Space to Entry Permit", confined_space, "WORK_PERMIT", "Permits", "Confined Space Entry Permit"),
    ("Electrical (Isolation) Permit", electrical_isolation, "WORK_PERMIT", "Permits", "Electrical Isolation (LOTO) Permit"),
    ("Excavation Permit", excavation, "WORK_PERMIT", "Permits", None),
    ("Hot Work Permit", hot_work, "WORK_PERMIT", "Permits", None),
    ("Lifting Operation Permit", lifting_operation, "WORK_PERMIT", "Permits", None),
    ("Work at Height Permit", work_at_height, "WORK_PERMIT", "Permits", None),
]
