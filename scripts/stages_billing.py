"""Seed stage: billing settings, quotations, GST invoices and payment receipts.

Written through the real admin API, in the order a client relationship goes:
  ABC Manufacturing (Coimbatore)   10-line quotation -> accepted -> invoiced -> part paid, then paid in full (two receipts)
  Greenfield Foods (employer 4)    quotation sent, waiting for an answer
  Sri Balaji Textiles (employer 2) quotation accepted -> invoice issued, 45 days ago, unpaid (overdue)
  Delhi Auto Components            inter-state client (state code 07): IGST invoice, issued, part paid
  A draft quotation and a draft invoice, so the "Draft" states show.
Bank details are demo placeholders: replace them under Settings > Company. Safe to re-run: skipped when a quotation for ABC already exists.
"""
from seed_common import admin, iso
from seed_lib import db, q1, section, sql_text

SETTINGS = {
    "company_state": ("Tamil Nadu", "State"), "company_state_code": ("33", "GST state code"), "billing_default_sac": ("998311", "Default SAC code"),
    "bank_name": ("ICICI Bank", "Bank name"), "bank_account_number": ("000000000000", "Bank account number"), "bank_ifsc": ("ICIC0000000", "IFSC code"),
    "invoice_terms": ("A late fee of 1% per month plus GST will be charged on any outstanding amount.\nThe late fee will be applied starting from the 31st day after the invoice date and will continue until full payment is received.\nPlease send payment advice to the e-mail address above.\nAll matters are subject to Coimbatore jurisdiction.", "Invoice terms"),
}


def ensure_settings():
    section("Billing settings")
    for key, (value, label) in SETTINGS.items():
        if q1(f"SELECT id FROM settings WHERE setting_group = 'company' AND setting_key = {sql_text(key)}"):
            continue
        db(f"INSERT INTO settings (setting_group, setting_key, setting_value, value_type, label, is_public, is_encrypted, sort_order) VALUES ('company', {sql_text(key)}, {sql_text(value)}, 'string', {sql_text(label)}, 0, 0, 90)")
        print(f"  + {key}")


def lines(count=10):
    rows = db(f"SELECT name, scope, frequency, default_fee, sac_code FROM billing_services WHERE deleted_at IS NULL AND status = 'active' ORDER BY sort_order LIMIT {count}")
    return [{"category": r[0], "scope": r[1], "frequency": r[2], "fee": float(r[3]), "sac_code": r[4]} for r in rows]


def stage_billing():
    ensure_settings()
    section("Quotations and invoices")
    if q1("SELECT id FROM quotations WHERE client_name LIKE 'M/s ABC Manufacturing%' AND deleted_at IS NULL"):
        print("  already present")
        return
    employers = {int(i): int(i) for (i,) in db("SELECT id FROM employers WHERE deleted_at IS NULL")}
    balaji, greenfield = (2 if 2 in employers else None), (4 if 4 in employers else None)
    elements = ["Comprehensive Coverage: Compliance evaluations across all applicable local / national frameworks.", "On-Site Evaluation: Includes one structured physical on-site consultation block per calendar month.",
                "Support Channels: Ongoing secure priority telephone and electronic mail advisory windows."]

    def quote(**fields):
        body = {"quote_date": iso(-20), "valid_until": iso(10), "gst_percent": 18, "framework_elements": elements, "items": lines(), **fields}
        made = admin.call("POST", "/api/admin/billing/quotations", body, what=f"quotation {fields['client_name']}")
        return int(made["data"]["id"]) if made and made.get("data") else None

    def to_status(qid, status):
        admin.call("POST", f"/api/admin/billing/quotations/{qid}/status", {"status": status}, what=f"quotation {qid} {status}")

    def invoice_of(qid):
        made = admin.call("POST", f"/api/admin/billing/quotations/{qid}/invoice", {}, what="convert")
        return int(made["data"]["id"]) if made and made.get("data") else None

    def backdate(iid, days_ago):
        body = admin.call("GET", f"/api/admin/billing/invoices/{iid}", what="read invoice")
        data = body["data"]
        admin.call("PUT", f"/api/admin/billing/invoices/{iid}", {
            "employer_id": data["employer_id"], "quotation_id": data["quotation_id"], "buyer_name": data["buyer_name"], "buyer_address": data["buyer_address"], "buyer_gstin": data["buyer_gstin"],
            "buyer_state_code": data["buyer_state_code"], "invoice_date": iso(-days_ago), "payment_terms": "Net 30 days", "place_of_supply": "Tamil Nadu", "notes": data["notes"],
            "items": [{"description": it["description"], "sac_code": it["sac_code"], "quantity": float(it["quantity"]), "uom": it["uom"], "unit_price": float(it["unit_price"]), "gst_percent": float(it["gst_percent"])} for it in data["items"]]}, what="backdate")

    def issue(iid):
        admin.call("POST", f"/api/admin/billing/invoices/{iid}/issue", {}, what=f"issue {iid}")

    def pay(iid, amount, days_ago, mode, ref):
        admin.call("POST", f"/api/admin/billing/invoices/{iid}/payments", {"amount": amount, "payment_date": iso(-days_ago), "mode": mode, "reference": ref}, what=f"payment {iid}")

    # 1. ABC Manufacturing: the client's own sample, through to paid
    q = quote(client_name="M/s ABC Manufacturing Pvt. Ltd.", client_address="Coimbatore, Tamil Nadu - 641 0XX", client_contact="Mr. K. Ramesh (HR Manager)", client_profile="150 Employees | 2 Shifts | Engineering Sector",
              subject="Monthly Professional Service Price Quotation for integrated compliance management, regulatory advisory and technical support frameworks.",
              directive="To guarantee complete corporate compliance visibility, structural risk containment, and optimized operational welfare metrics.", client_state_code="33", quote_date=iso(-40), valid_until=iso(-10))
    if q:
        to_status(q, "Sent"); to_status(q, "Accepted")
        i = invoice_of(q)
        if i:
            backdate(i, 30)
            issue(i)
            pay(i, 30000, 25, "Bank transfer", "NEFT 260923286023591")
            pay(i, 34900, 8, "UPI", "UPI/4455/ABC")

    # 2. Greenfield Foods: waiting for an answer
    if greenfield:
        row = db(f"SELECT company_name, address_line_1, city, pincode, gst_number FROM employers WHERE id = {greenfield}")[0]
        q = quote(employer_id=greenfield, client_name=row[0], client_address=f"{row[1]}, {row[2]} - {row[3]}", client_contact="HR Manager", client_profile="Food processing | 120 employees", client_gstin=row[4] or None,
                  items=lines(6), subject="Monthly compliance and safety support")
        if q:
            to_status(q, "Sent")

    # 3. Sri Balaji Textiles: invoice issued 45 days ago and still unpaid
    if balaji:
        row = db(f"SELECT company_name, address_line_1, city, pincode, gst_number FROM employers WHERE id = {balaji}")[0]
        q = quote(employer_id=balaji, client_name=row[0], client_address=f"{row[1]}, {row[2]} - {row[3]}", client_contact="HR Manager", client_profile="Textile | 2 shifts", client_gstin=row[4] or None, items=lines(5), quote_date=iso(-60), valid_until=iso(-30))
        if q:
            to_status(q, "Sent"); to_status(q, "Accepted")
            i = invoice_of(q)
            if i:
                backdate(i, 45)
                issue(i)

    # 4. Delhi Auto Components: inter-state, IGST
    made = admin.call("POST", "/api/admin/billing/invoices", {
        "buyer_name": "Delhi Auto Components Pvt. Ltd.", "buyer_address": "Plot 14, Okhla Industrial Area, New Delhi - 110020", "buyer_gstin": "07AABCD1234E1Z5", "buyer_pan": "AABCD1234E", "invoice_date": iso(-15),
        "payment_terms": "Net 30 days", "place_of_supply": "Delhi", "notes": "Training and compliance audit, 2 days on site.",
        "items": [{"description": "Fee for training / course / seminar / workshop", "sac_code": "999294", "quantity": 1, "uom": "Nos", "unit_price": 10500, "gst_percent": 18},
                  {"description": "Statutory compliance audit (on site, per day)", "sac_code": "998311", "quantity": 2, "uom": "Days", "unit_price": 8000, "gst_percent": 18}]}, what="inter-state invoice")
    if made and made.get("data"):
        i = int(made["data"]["id"])
        issue(i)
        pay(i, 10000, 5, "Cheque", "Cheque 004512")

    # 5. drafts
    quote(client_name="Prospect: Kovai Garments", client_address="Tiruppur, Tamil Nadu", client_contact="Owner", items=lines(4), subject="Introductory compliance support")
    admin.call("POST", "/api/admin/billing/invoices", {"buyer_name": "Prospect: Kovai Garments", "buyer_address": "Tiruppur", "invoice_date": iso(0), "items": [{"description": "Compliance gap assessment", "quantity": 1, "unit_price": 15000, "gst_percent": 18}]}, what="draft invoice")
    print("  done")
