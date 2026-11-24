"""Form 3 and Form 4 of the Hazardous and Other Wastes (Management and Trans-boundary Movement) Rules, 2016, built from the client's filled sample
(Shakthi Knitting Private Limited, "FORM - 3 REGISTER and FORM - 4 ANNUAL RETURN, year 2025-2026", submitted to the Tamil Nadu Pollution Control Board).

    Form 3  [see rules 6(5), 13(7), 14(6), 16(5) and 20(1)]  Format for maintaining records of hazardous and other wastes
    Form 4  [see rules 6(5), 13(8), 16(6) and 20(2)]          Form for filling annual returns (to the State Pollution Control Board by 30 June for April to March)

The headings of the statutory format are kept as printed. The sample's four waste streams (used oil, contaminated barrels, contaminated cotton rags, chemical
sludge) are NOT carried over as data: they are one factory's entries, so every row starts empty. Form 5 (named in the client's list) has no file yet.
"""
from forms_dsl import area, col, coldate, colnum, colsel, date, form, heading, note, reset_keys, sec, sign, table, text

UNITS = ["KL/Annum", "Metric Ton/Annum"]
AUTHORISATION = "Date of issuance of Authorisation and its reference Number"


def _facility(extra=None):
    return [text("Name of the Facility", req=True), area("Address of the Facility", w=12), heading(AUTHORISATION),
            text("Authorisation No."), date("Date of Issue"), text("Year (April to March)", placeholder="2025-2026"), *(extra or [])]


def form_3():
    reset_keys()
    return form("Form 3 - Records of Hazardous and Other Wastes", "Form 3 [see rules 6(5), 13(7), 14(6), 16(5) and 20(1)] of the Hazardous and Other Wastes (Management and "
                "Trans-boundary Movement) Rules, 2016: the format for maintaining records of hazardous and other wastes, month by month.", "HW3", [
        sec("Form 3", note("[see rules 6(5), 13(7), 14(6), 16(5) and 20(1)]\nFORMAT FOR MAINTAINING RECORDS OF HAZARDOUS AND OTHER WASTES"),
            *_facility(), cols=2),
        sec("Description of Hazardous and Other Wastes Handled: (Generated or Received)", cols=1, tables=[table(
            "wastes_handled", "Description of Hazardous and Other Wastes Handled: (Generated or Received)", [
                col("Type of Waste with Category as per Schedule I, II and III of these Rules", "waste", width=24), col("Name Of process", "process", width=16),
                col("Source of Waste Generation", "source", width=16), col("Waste Type", "waste_type", width=9), col("Method of Storage", "storage", width=12),
                col("Details of arrangements for transportation to actual users/TSDF", "transport", width=17), col("Total Quantity (per annum, as authorised)", "annual_quantity", width=10)],
            min_rows=1, max_rows=60,
            description="One row for each waste handled. Waste Type is, for example, Recyclable, Incinerable or Utilizable; the quantity is the authorised annual limit with its unit (KL or Metric Tonnes).")]),
        sec("Month-wise record", cols=1, tables=[table(
            "monthly_records", "Month-wise record", [
                col("Month/Year", "month", width=8), coldate("Date", "date", width=9), col("Type of Waste with Category as per Schedule I, II and III of these Rules", "waste", width=22),
                colnum("Total Quantity (Wet/Oily or Dry Qty)", "quantity", width=9, total=True), colnum("Stock Qty", "stock", width=8),
                col("SAFE Disposal: Destined to or Received From", "destined_to", width=14), col("Manifest No & Date", "manifest", width=10),
                col("Vehicle No", "vehicle", width=8), col("Transporter", "transporter", width=12)],
            min_rows=0, max_rows=600, totals=True,
            description="One row for each month and waste (and for each consignment sent out, with its manifest number, vehicle and transporter). Enter 0 for a month in which nothing was generated or sent out.")]),
        sec("Declaration", text("Name of the occupier / authorised person"), text("Designation"), sign("Signature of the occupier or operator of the disposal facility"), date("Date"),
            text("Place"), cols=2),
    ])


def form_4():
    reset_keys()
    unit = lambda: colsel("Unit", UNITS, "unit", width=7)  # noqa: E731
    return form("Form 4 - Annual Return (Hazardous and Other Wastes)", "Form 4 [see rules 6(5), 13(8), 16(6) and 20(2)] of the Hazardous and Other Wastes (Management and "
                "Trans-boundary Movement) Rules, 2016: the annual return to the State Pollution Control Board by 30 June for the preceding April to March.", "HW4", [
        sec("Form 4", note("[See rules 6(5), 13(8), 16(6) and 20 (2)]\nFORM FOR FILLING ANNUAL RETURNS\nUnder\nHazardous & Other waste (Management and Trans-boundary Movement), Rules, 2016\n"
                           "[To be submitted to State Pollution Control Board by 30th day of June of every year for the preceding period April to March]"),
            text("Return No"), text("Period", placeholder="2025-2026"), cols=2),
        sec("The facility", text("Name of the facility", req=True), area("Address of the facility", w=12), text("UID"),
            heading("Date of issuance of Authorization and its reference Number"), text("Authorization No"), date("Date of Issue"), date("Date of Expiry"),
            heading("Name the Authorized person"), text("Name of the Authorized person"), text("Designation"), area("Correspondence Address", w=12), text("Mobile Number"),
            text("Land Line Number (With Area Code)"), text("Fax Number (With Area Code)"), text("Email"), cols=2),
        sec("Production During the year (Product Wise), Wherever applicable", cols=1, tables=[table(
            "production", "Production During the year (Product Wise), Wherever applicable",
            [col("Schedule/ Product Name", "product", width=60), colsel("Unit", UNITS, "unit", width=20), colnum("Quantity", "quantity", width=20)], min_rows=0, max_rows=60)]),
        sec("Part A. To be filled by Hazardous Waste Generator", cols=1, tables=[table(
            "part_a", "Part A. To be filled by Hazardous Waste Generator", [
                col("Category", "category", width=20), unit(), colnum("Quantity in Stock at the Beginning of the Year", "opening", width=9),
                colnum("Total Quantity of the waste Generated", "generated", width=9), colnum("Quantity Dispatched to Disposal Facility", "to_disposal", width=9),
                colnum("Quantity Dispatched To Recycler Or Co- Processors or Pre - Processors", "to_recycler", width=11), colnum("Quantity Dispatched to Others", "to_others", width=9),
                colnum("Quantity Utilized in House", "in_house", width=9), colnum("Quantity in Storage at the End of the Year", "closing", width=9)], min_rows=0, max_rows=60)]),
        sec("Part B. To be filled by Treatment, storage and disposal facility operators", cols=1, tables=[table(
            "part_b", "Part B. To be filled by Treatment, storage and disposal facility operators", [
                col("Category", "category", width=20), unit(), colnum("Quantity in Stock at the Beginning of the Year", "opening", width=11), colnum("Total Quantity of Received", "received", width=11),
                colnum("Quantity Treated", "treated", width=10), colnum("Quantity Dispatched in landfills as such and after Treatment", "landfilled", width=12),
                colnum("Quantity Incinerated (If applicable)", "incinerated", width=10), colnum("Quantity Processed other than Specified Above", "other_processed", width=11),
                colnum("Quantity in Storage at the End of the Year", "closing", width=11)], min_rows=0, max_rows=60)]),
        sec("Part C. To be filled by Re - Cyclers or co-processors or other users", cols=1, tables=[table(
            "part_c", "Part C. To be filled by Re - Cyclers or co-processors or other users", [
                col("Category", "category", width=16), unit(), colnum("Quantity in Stock at the Beginning of the Year", "opening", width=9),
                colnum("Quantity of the waste Received during the year from Domestic Sources", "domestic", width=10), colnum("Quantity Of waste received during the year imported", "imported", width=9),
                colnum("Quantity Recycled Or Co- Processed or Used", "recycled", width=9), colnum("Quantity of waste Generated", "generated", width=9),
                colnum("Quantity of waste Disposed", "disposed", width=9), colnum("Quantity Re- Exported (Wherever Applicable)", "re_exported", width=9),
                colnum("Quantity in Storage at the End of the Year", "closing", width=10)], min_rows=0, max_rows=60)]),
        sec("Quantity of Products Dispatched During the Year (Wherever applicable)", cols=1, tables=[table(
            "products_dispatched", "Quantity of Products Dispatched During the Year (Wherever applicable)",
            [col("Product Dispatched", "product", width=55), colnum("Quantity", "quantity", width=25), col("unit", "unit", width=20)], min_rows=0, max_rows=60)]),
        sec("Signature of the Occupier or Operator of the disposal facility", sign("Signature of the Occupier or Operator of the disposal facility"), date("Date"), text("Place"), cols=2),
    ])


AA_WASTE_CATALOGUE = [
    ("Form 3 - Records of Hazardous and Other Wastes", form_3, "AUDIT", "Environment", ["ENV"]),
    ("Form 4 - Annual Return (Hazardous and Other Wastes)", form_4, "AUDIT", "Environment", ["ENV"]),
]
