"""Billing end-to-end check: quotations, GST invoices, payments and receipts, with every role.

    python scripts/verify-billing.py        (server on http://127.0.0.1:3001 with the demo data seeded)

Covers: validation, the quotation and invoice life cycles, locking after issue, gap-free numbering, CGST + SGST vs IGST, part and full payment,
over-payment, cancellation, PDFs, and that a client sees only its own issued documents. Test rows are removed at the end."""
import sys
from datetime import date, timedelta

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db  # noqa: E402

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print(("  ok  " if condition else "  FAIL") + f" {name}" + (f"  -> {detail}" if not condition and detail else ""))


def login(email, role):
    session = Session((email, PASSWORDS[role]))
    ok, detail = session.login()
    if not ok:
        sys.exit(f"cannot sign in as {email}: {detail}")
    return session


def data(response):
    return (response[1] or {}).get("data") if isinstance(response[1], dict) else None


def is_pdf(response):
    return response[0] == 200 and isinstance(response[1], (bytes, bytearray)) and response[1][:4] == b"%PDF"


iso = lambda days=0: (date.today() + timedelta(days=days)).isoformat()  # noqa: E731
admin = login("demo.admin@complianceos.local", "admin")
balaji = login("balaji.hr@demo.complianceos.local", "employer")     # employer 2
kaveri = login("kaveri.hr@demo.complianceos.local", "employer")     # employer 3
employee = login("employee.test@complianceos.local", "employee")
auditor = login("priya.auditor@demo.complianceos.local", "auditor")
B = "/api/admin/billing"

# clean any leftovers of an earlier run
db("DELETE FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE buyer_name LIKE 'ZZ TEST%')")
db("DELETE FROM invoices WHERE buyer_name LIKE 'ZZ TEST%'")
db("DELETE FROM quotations WHERE client_name LIKE 'ZZ TEST%'")

print("== access")
check("employee cannot read billing", employee.send("GET", f"{B}/summary")[0] in (401, 403))
check("auditor cannot read billing", auditor.send("GET", f"{B}/summary")[0] in (401, 403))
check("employer cannot use the admin billing API", balaji.send("GET", f"{B}/quotations")[0] in (401, 403))
check("employer cannot write through the client API", balaji.send("POST", "/api/employer/billing/quotations", {})[0] in (403, 405))
check("admin reads the summary", admin.send("GET", f"{B}/summary")[0] == 200)
lookups = data(admin.send("GET", f"{B}/lookups")) or {}
check("lookups carry employers, services and the seller state", bool(lookups.get("employers")) and len(lookups.get("services", [])) >= 10 and lookups.get("seller", {}).get("stateCode") == "33", str(lookups.get("seller")))

print("== service catalogue")
status, body = admin.send("POST", f"{B}/services", {"name": "ZZ TEST Service", "default_fee": 1234.5, "sac_code": "998311"})
sid = (data((status, body)) or {}).get("id")
check("a service can be added", status == 201 and sid, f"{status}")
check("a service needs a name", admin.send("POST", f"{B}/services", {"name": "", "default_fee": 1})[0] == 422)
check("a negative fee is refused", admin.send("POST", f"{B}/services", {"name": "ZZ TEST neg", "default_fee": -5})[0] == 422)
check("a service can be edited", admin.send("PUT", f"{B}/services/{sid}", {"name": "ZZ TEST Service 2", "default_fee": 99, "status": "inactive"})[0] == 200)
check("an inactive service leaves the picker list", all(s["name"] != "ZZ TEST Service 2" for s in (data(admin.send("GET", f"{B}/lookups")) or {}).get("services", [])))
check("a service can be removed", admin.send("DELETE", f"{B}/services/{sid}")[0] == 200)

print("== quotation")
items = [{"category": "Wages & Working Hours Compliance", "scope": "Wage validation", "frequency": "Monthly", "fee": 7000}, {"category": "Social Security Frameworks", "frequency": "Monthly", "fee": 6000}]
quote = {"client_name": "ZZ TEST Client", "client_address": "Coimbatore", "quote_date": iso(0), "valid_until": iso(15), "gst_percent": 18, "items": items, "framework_elements": ["Support Channels"]}
check("a quotation needs at least one line", admin.send("POST", f"{B}/quotations", {**quote, "items": []})[0] == 422)
check("a client name is required", admin.send("POST", f"{B}/quotations", {**quote, "client_name": ""})[0] == 422)
check("valid until cannot precede the date", admin.send("POST", f"{B}/quotations", {**quote, "valid_until": iso(-3)})[0] == 422)
check("a bad GSTIN is refused", admin.send("POST", f"{B}/quotations", {**quote, "client_gstin": "33AABCS1234D1Z"})[0] == 422)
check("a GST rate above 28 is refused", admin.send("POST", f"{B}/quotations", {**quote, "gst_percent": 40})[0] == 422)
check("a negative fee is refused", admin.send("POST", f"{B}/quotations", {**quote, "items": [{"category": "x", "fee": -1}]})[0] == 422)
status, body = admin.send("POST", f"{B}/quotations", quote)
qid = (data((status, body)) or {}).get("id")
check("a quotation is created", status == 201 and qid, f"{status} {body}")
q = data(admin.send("GET", f"{B}/quotations/{qid}")) or {}
check("totals: 13,000 + 18 % = 15,340", float(q.get("subtotal", 0)) == 13000 and float(q.get("gst_amount", 0)) == 2340 and float(q.get("total", 0)) == 15340, f"{q.get('subtotal')} {q.get('gst_amount')} {q.get('total')}")
check("it starts as a Draft with a QTN number", q.get("status") == "Draft" and str(q.get("quotation_number", "")).startswith("QTN/"), str(q.get("quotation_number")))
check("a draft cannot be accepted directly", admin.send("POST", f"{B}/quotations/{qid}/status", {"status": "Accepted"})[0] == 409)
check("a draft cannot be invoiced", admin.send("POST", f"{B}/quotations/{qid}/invoice", {})[0] == 409)
check("a draft can be edited", admin.send("PUT", f"{B}/quotations/{qid}", {**quote, "items": items + [{"category": "Fire & Emergency Safety Protocols", "fee": 3500}]})[0] == 200)
q = data(admin.send("GET", f"{B}/quotations/{qid}")) or {}
check("the edit re-totals (16,500 + GST 2,970 = 19,470)", float(q.get("total", 0)) == 19470 and len(q.get("items", [])) == 3, str(q.get("total")))
check("the client cannot see a draft", kaveri.send("GET", f"/api/employer/billing/quotations/{qid}")[0] == 404)
check("a quotation PDF prints", is_pdf(admin.send("GET", f"/api/pdf/billing/quotation/{qid}", raw=True)))
check("it is marked sent", admin.send("POST", f"{B}/quotations/{qid}/status", {"status": "Sent"})[0] == 200)
check("a bad status is refused", admin.send("POST", f"{B}/quotations/{qid}/status", {"status": "Dancing"})[0] == 422)
check("a sent quotation can still be edited", admin.send("PUT", f"{B}/quotations/{qid}", {**quote, "items": items})[0] == 200)
check("a sent quotation cannot be deleted", admin.send("DELETE", f"{B}/quotations/{qid}")[0] == 409)
check("it is accepted", admin.send("POST", f"{B}/quotations/{qid}/status", {"status": "Accepted"})[0] == 200)
check("an accepted quotation is locked", admin.send("PUT", f"{B}/quotations/{qid}", {**quote, "items": items})[0] == 409)

print("== convert to an invoice")
status, body = admin.send("POST", f"{B}/quotations/{qid}/invoice", {})
iid = (data((status, body)) or {}).get("id")
check("an accepted quotation becomes a draft invoice", status == 201 and iid, f"{status} {body}")
inv = data(admin.send("GET", f"{B}/invoices/{iid}")) or {}
check("the draft has no real number yet", str(inv.get("invoice_number", "")).startswith("DRAFT-") and inv.get("status") == "Draft", str(inv.get("invoice_number")))
check("lines and total carry across (13,000 + 2,340)", len(inv.get("items", [])) == 2 and float(inv.get("total", 0)) == 15340, str(inv.get("total")))
check("same state: CGST 1,170 + SGST 1,170, no IGST", float(inv.get("cgst_amount", 0)) == 1170 and float(inv.get("sgst_amount", 0)) == 1170 and float(inv.get("igst_amount", 0)) == 0, f"{inv.get('cgst_amount')} {inv.get('sgst_amount')} {inv.get('igst_amount')}")
check("the quotation is now Invoiced", (data(admin.send("GET", f"{B}/quotations/{qid}")) or {}).get("status") == "Invoiced")
check("it cannot be invoiced twice", admin.send("POST", f"{B}/quotations/{qid}/invoice", {})[0] == 409)
check("a draft invoice cannot take a payment", admin.send("POST", f"{B}/invoices/{iid}/payments", {"amount": 100, "payment_date": iso(0)})[0] == 409)
check("the client cannot see the draft invoice", kaveri.send("GET", f"/api/employer/billing/invoices/{iid}")[0] == 404)
check("a draft invoice PDF prints", is_pdf(admin.send("GET", f"/api/pdf/billing/invoice/{iid}", raw=True)))

print("== issue")
counter = lambda: int((db("SELECT last_value FROM document_sequences WHERE sequence_scope = 'INV-%d'" % date.today().year) or [[0]])[0][0])  # noqa: E731
before_counter = counter()
status, body = admin.send("POST", f"{B}/invoices/{iid}/issue", {})
number = (data((status, body)) or {}).get("invoice_number")
check("issuing gives an INV number", status == 200 and str(number).startswith("INV/"), f"{status} {body}")
check("the number is 16 characters or fewer (GST rule)", len(str(number)) <= 16, str(number))
seq = lambda n_: int(str(n_).split("/")[-1])  # noqa: E731
check("numbering continues the series without a gap", seq(number) == before_counter + 1 and counter() == before_counter + 1, f"counter {before_counter} -> {number}")
check("an issued invoice cannot be issued again", admin.send("POST", f"{B}/invoices/{iid}/issue", {})[0] == 409)
check("an issued invoice cannot be edited", admin.send("PUT", f"{B}/invoices/{iid}", {"buyer_name": "ZZ TEST X", "invoice_date": iso(0), "items": [{"description": "x", "quantity": 1, "unit_price": 1}]})[0] == 409)
check("an issued invoice cannot be deleted", admin.send("DELETE", f"{B}/invoices/{iid}")[0] == 409)
check("the invoice PDF prints", is_pdf(admin.send("GET", f"/api/pdf/billing/invoice/{iid}", raw=True)))

print("== payments and receipts")
check("a payment above the balance is refused", admin.send("POST", f"{B}/invoices/{iid}/payments", {"amount": 99999, "payment_date": iso(0)})[0] == 422)
check("a zero payment is refused", admin.send("POST", f"{B}/invoices/{iid}/payments", {"amount": 0, "payment_date": iso(0)})[0] == 422)
check("a future-dated payment is refused", admin.send("POST", f"{B}/invoices/{iid}/payments", {"amount": 100, "payment_date": iso(3)})[0] == 422)
check("a payment before the invoice date is refused", admin.send("POST", f"{B}/invoices/{iid}/payments", {"amount": 100, "payment_date": iso(-5)})[0] == 422)
status, body = admin.send("POST", f"{B}/invoices/{iid}/payments", {"amount": 5000, "payment_date": iso(0), "mode": "UPI", "reference": "ZZ TEST UPI"})
p1 = data((status, body)) or {}
check("a part payment is recorded with an RCT receipt", status == 201 and str(p1.get("receipt_number", "")).startswith("RCT/") and p1.get("status") == "Part paid" and float(p1.get("balance", 0)) == 10340, f"{status} {body}")
check("an invoice with a payment cannot be cancelled", admin.send("POST", f"{B}/invoices/{iid}/cancel", {"reason": "mistake"})[0] == 409)
check("the receipt PDF prints", is_pdf(admin.send("GET", f"/api/pdf/billing/receipt/{p1.get('id')}", raw=True)))
status, body = admin.send("POST", f"{B}/invoices/{iid}/payments", {"amount": 10340, "payment_date": iso(0), "mode": "Bank transfer", "reference": "ZZ TEST NEFT"})
p2 = data((status, body)) or {}
check("paying the balance makes it Paid", status == 201 and p2.get("status") == "Paid" and float(p2.get("balance", 1)) == 0, f"{status} {body}")
inv = data(admin.send("GET", f"{B}/invoices/{iid}")) or {}
check("paid total equals the invoice total", float(inv.get("amount_paid", 0)) == float(inv.get("total", 1)) and len(inv.get("payments", [])) == 2)
check("nothing more can be paid on a settled invoice", admin.send("POST", f"{B}/invoices/{iid}/payments", {"amount": 1, "payment_date": iso(0)})[0] == 409)
check("receipt numbers are unique", p1.get("receipt_number") != p2.get("receipt_number"))

print("== inter-state invoice and cancellation")
inter = {"buyer_name": "ZZ TEST Delhi Co", "buyer_address": "New Delhi", "buyer_gstin": "07AABCD1234E1Z5", "invoice_date": iso(0), "payment_terms": "Net 15 days",
         "items": [{"description": "Training", "sac_code": "999294", "quantity": 1, "uom": "Nos", "unit_price": 10500, "gst_percent": 18}]}
status, body = admin.send("POST", f"{B}/invoices", inter)
did = (data((status, body)) or {}).get("id")
d = data(admin.send("GET", f"{B}/invoices/{did}")) or {}
check("the client's sample: 10,500 + 18 % IGST 1,890 = 12,390", status == 201 and d.get("supply_type") == "Inter-state" and float(d.get("igst_amount", 0)) == 1890 and float(d.get("cgst_amount", 1)) == 0 and float(d.get("total", 0)) == 12390, str(d))
check("net 15 days sets the due date 15 days out", str(d.get("due_date"))[:10] == iso(15), str(d.get("due_date")))
check("a GSTIN and a different state code is refused", admin.send("POST", f"{B}/invoices", {**inter, "buyer_state_code": "33"})[0] == 422)
check("a bad PAN is refused", admin.send("POST", f"{B}/invoices", {**inter, "buyer_pan": "123"})[0] == 422)
check("an invoice needs a line", admin.send("POST", f"{B}/invoices", {**inter, "items": []})[0] == 422)
check("a zero quantity is refused", admin.send("POST", f"{B}/invoices", {**inter, "items": [{"description": "x", "quantity": 0, "unit_price": 5}]})[0] == 422)
check("a zero-value invoice cannot be issued", (lambda r: admin.send("POST", f"{B}/invoices/{r}/issue", {})[0] == 422)(data(admin.send("POST", f"{B}/invoices", {**inter, "items": [{"description": "free", "quantity": 1, "unit_price": 0}]})).get("id")))
check("the inter-state invoice PDF prints", is_pdf(admin.send("GET", f"/api/pdf/billing/invoice/{did}", raw=True)))
admin.send("POST", f"{B}/invoices/{did}/issue", {})
check("cancelling needs a reason", admin.send("POST", f"{B}/invoices/{did}/cancel", {"reason": ""})[0] == 422)
check("an unpaid invoice can be cancelled", admin.send("POST", f"{B}/invoices/{did}/cancel", {"reason": "ZZ TEST raised in error"})[0] == 200)
check("a cancelled invoice keeps its number and is Cancelled", (data(admin.send("GET", f"{B}/invoices/{did}")) or {}).get("status") == "Cancelled")
check("a cancelled invoice takes no payment", admin.send("POST", f"{B}/invoices/{did}/payments", {"amount": 10, "payment_date": iso(0)})[0] == 409)
check("a draft invoice can be deleted", (lambda r: admin.send("DELETE", f"{B}/invoices/{r}")[0] == 200)(data(admin.send("POST", f"{B}/invoices", inter)).get("id")))

print("== the client sees only its own issued documents")
employer_of_balaji = int(db("SELECT employer_id FROM employer_users eu JOIN users u ON u.id = eu.user_id WHERE u.email = 'balaji.hr@demo.complianceos.local'")[0][0])
status, body = admin.send("POST", f"{B}/quotations", {**quote, "client_name": "ZZ TEST Balaji Quote", "employer_id": employer_of_balaji})
bq = (data((status, body)) or {}).get("id")
admin.send("POST", f"{B}/quotations/{bq}/status", {"status": "Sent"})
mine = (balaji.send("GET", "/api/employer/billing/quotations")[1] or {}).get("data", [])
check("the client sees its own sent quotation", any(r["id"] == bq for r in mine))
check("another client does not", not any(r["id"] == bq for r in (kaveri.send("GET", "/api/employer/billing/quotations")[1] or {}).get("data", [])))
check("the client can download its quotation PDF", is_pdf(balaji.send("GET", f"/api/pdf/billing/quotation/{bq}", raw=True)))
check("another client cannot download it", kaveri.send("GET", f"/api/pdf/billing/quotation/{bq}", raw=True)[0] == 404)
check("an employee cannot download billing PDFs", employee.send("GET", f"/api/pdf/billing/quotation/{bq}", raw=True)[0] in (401, 403))
check("an unknown document kind is 404", admin.send("GET", f"/api/pdf/billing/nonsense/{bq}", raw=True)[0] == 404)
check("an unknown id is 404", admin.send("GET", "/api/pdf/billing/invoice/999999", raw=True)[0] == 404)
inv_of_balaji = db(f"SELECT id FROM invoices WHERE employer_id = {employer_of_balaji} AND status <> 'Draft' AND deleted_at IS NULL LIMIT 1")
if inv_of_balaji:
    check("the client can download its own invoice", is_pdf(balaji.send("GET", f"/api/pdf/billing/invoice/{inv_of_balaji[0][0]}", raw=True)))
    check("another client cannot download it", kaveri.send("GET", f"/api/pdf/billing/invoice/{inv_of_balaji[0][0]}", raw=True)[0] == 404)

print("== registers")
check("the quotation register filters by status", all(r["status"] == "Sent" for r in (admin.send("GET", f"{B}/quotations?status=Sent")[1] or {}).get("data", [])))
check("the invoice register searches by buyer", any("ZZ TEST" in r["buyer_name"] for r in (admin.send("GET", f"{B}/invoices?search=ZZ%20TEST")[1] or {}).get("data", [])))

# clean up everything this run created
db("DELETE FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE buyer_name LIKE 'ZZ TEST%')")
db("DELETE FROM invoices WHERE buyer_name LIKE 'ZZ TEST%'")
db("DELETE FROM quotations WHERE client_name LIKE 'ZZ TEST%'")
db("DELETE FROM billing_services WHERE name LIKE 'ZZ TEST%'")
# the test deleted the invoices and receipts it issued, so put the number counters back to the highest number still in use (the real series has no gaps)
for kind, table, column in (("INV", "invoices", "invoice_number"), ("RCT", "invoice_payments", "receipt_number"), ("QTN", "quotations", "quotation_number")):
    top = db(f"SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX({column}, '/', -1) AS UNSIGNED)), 0) FROM {table} WHERE {column} LIKE '{kind}/%'")[0][0]
    db(f"UPDATE document_sequences SET last_value = {int(top)} WHERE sequence_scope = '{kind}-{date.today().year}'")
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
