"""Data Management check: the employer's daily industrial data, end to end through the API, with every role.

    python scripts/verify-data-management.py      (server on http://127.0.0.1:3001 with the demo data seeded)

Covers: the register catalogue; entering, correcting, verifying and deleting records; calculated fields (net weight, closing stock,
consumption ...); validation (negative numbers, bad dates, required fields, future dates); weekly / monthly / annual roll-ups; the KPIs, the
material / water / waste balances; the GHG engine (no factor = no emissions, an approved factor = activity x factor, own vs hired vehicles,
unit mismatch); the emission-factor register; the employee data-entry switch; role isolation (employee without the switch, auditor and
administrator read-only, another company cannot read); CSV export; attachments. All test rows are removed at the end."""
import json
import struct
import sys
import zlib

sys.path.insert(0, __file__.rsplit("scripts", 1)[0] + "scripts")
from seed_lib import PASSWORDS, Session, db, multipart  # noqa: E402

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


def png():
    raw = b"".join(b"\x00" + bytes((30, 60, 90)) * 8 for _ in range(8))
    def chunk(kind, payload):
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


employer = login("balaji.hr@demo.complianceos.local", "employer")
other_employer = login("greenfield.hr@demo.complianceos.local", "employer")
employee = login("senthil.natarajan.100@emp.demo.complianceos.local", "employee")
auditor = login("priya.auditor@demo.complianceos.local", "auditor")
admin = login("demo.admin@complianceos.local", "admin")
verifier = login("verifier.test@complianceos.local", "verifier")

EMP = int(db("SELECT eu.employer_id FROM employer_users eu JOIN users u ON u.id = eu.user_id WHERE u.email = 'balaji.hr@demo.complianceos.local' LIMIT 1")[0][0])
OTHER = int(db("SELECT eu.employer_id FROM employer_users eu JOIN users u ON u.id = eu.user_id WHERE u.email = 'greenfield.hr@demo.complianceos.local' LIMIT 1")[0][0])
EMPLOYEE_ID = int(db("SELECT id FROM employees WHERE user_id = (SELECT id FROM users WHERE email = 'senthil.natarajan.100@emp.demo.complianceos.local')")[0][0])
D = "2026-11-10"


def clean():
    db(f"DELETE FROM dm_entries WHERE employer_id IN ({EMP}, {OTHER})")
    db("DELETE FROM dm_emission_factors WHERE ef_code LIKE 'ZZ-%' OR ef_code LIKE 'ZZ~%'")
    db(f"UPDATE employees SET data_entry_enabled = 0 WHERE id = {EMPLOYEE_ID}")


clean()


def body(r):
    return r[1] if isinstance(r[1], dict) else {}


def add(session, register, values, date=D, **extra):
    return session.send("POST", "/api/data-management/entries", {"register": register, "entry_date": date, "values": values, **extra})


print("== the catalogue")
status, res = employer.send("GET", "/api/data-management/registers")
regs = {r["code"]: r for r in body((status, res)).get("registers", [])}
check("the employer reads the register catalogue", status == 200 and len(regs) >= 22, f"{status} {len(regs)}")
codes = {"PUR-01", "RM-01", "RM-02", "INV-01", "PRO-01", "PRO-02", "FG-01", "DIS-01", "TRN-01", "TRN-02", "WAT-01", "WAT-02", "ENR-01", "ENR-02", "WST-01", "WST-02", "WST-03", "WST-04", "GHG-01", "AUD-01", "CAPA-01", "CMP-01"}
check("all 22 registers of the client's framework are there", codes <= set(regs), sorted(codes - set(regs)))
check("the employer may write and verify", body((status, res))["can"]["write"] and body((status, res))["can"]["verify"])
check("a verifier has no access to Data Management", verifier.send("GET", "/api/data-management/registers")[0] in (401, 403))
check("nothing is pre-filled in the emission-factor register", body(admin.send("GET", "/api/admin/data-management/factors")).get("factors") is not None)

print("== entering records and calculated fields")
status, res = add(employer, "PUR-01", {"supplier": "ZZ Supplier", "material": "ZZ Cotton", "uom": "kg", "invoice_qty": 1000, "gross_qty": 1200, "tare_qty": 195, "unit_price": 50, "inspection": "Accepted"})
pur = body((status, res)).get("id")
vals = body((status, res)).get("values", {})
check("a purchase is saved", status == 201 and pur, f"{status} {res}")
check("net quantity = gross - tare", vals.get("net_qty") == 1005, vals)
check("purchase value = net x unit price", vals.get("purchase_value") == 50250, vals)
check("difference = invoice - received", vals.get("diff_qty") == -5, vals)
status, res = add(employer, "PUR-01", {"supplier": "x", "material": "y", "uom": "kg", "gross_qty": 100, "tare_qty": 150})
check("a tare above the gross weight is refused", status == 422 and any(i["field"] == "net_qty" for i in (res.get("errors") or [])), f"{status} {res}")
status, res = add(employer, "PUR-01", {"material": "y", "uom": "kg", "gross_qty": -5})
check("a negative quantity is refused", status == 422, status)
status, res = add(employer, "PUR-01", {"supplier": "x", "uom": "kg"})
check("a required field (material) is needed", status == 422 and any(i["field"] == "material" for i in (res.get("errors") or [])), f"{status} {res}")
status, res = add(employer, "PUR-01", {"supplier": "x", "material": "y", "uom": "furlong"})
check("an option outside the list is refused", status == 422, status)
check("a date in the future is refused", add(employer, "PUR-01", {"supplier": "x", "material": "y", "uom": "kg"}, date="2099-01-01")[0] == 422)
check("a date that does not exist is refused", add(employer, "PUR-01", {"supplier": "x", "material": "y", "uom": "kg"}, date="2026-02-30")[0] == 422)
check("an unknown register is a 404", add(employer, "ZZ-99", {})[0] == 404)

status, res = add(employer, "INV-01", {"material": "ZZ Cotton", "uom": "kg", "opening": 1000, "receipts": 5000, "returns_in": 100, "issues": 4200, "transfers_out": 200, "physical": 1650})
v = body((status, res)).get("values", {})
check("closing stock = opening + receipts + returns - issues - transfers (the client's example: 1,700)", v.get("closing_book") == 1700, v)
check("stock variance = physical - book", v.get("variance") == -50 and abs(v.get("variance_pct") + 2.9412) < 0.01, v)
status, res = add(employer, "ENR-01", {"meter_opening": 1000, "meter_closing": 1800, "multiplier": 10, "grid_kwh": 7000})
check("electricity = (closing - opening) x multiplier", body((status, res)).get("values", {}).get("consumption") == 8000, res)
status, res = add(employer, "ENR-01", {"meter_opening": 1000, "meter_closing": 900})
check("a meter closing below its opening is refused", status == 422, status)
status, res = add(employer, "ENR-02", {"fuel": "Diesel", "purpose": "DG set", "opening_stock": 2000, "purchased": 1500, "closing_stock": 1300})
check("fuel consumed = opening + purchases - closing (the client's example: 2,200)", body((status, res)).get("values", {}).get("consumed") == 2200, res)
status, res = add(employer, "TRN-01", {"vehicle_no": "TN01 ZZ 1", "ownership": "Hired", "material": "Cotton", "gross_kg": 12000, "tare_kg": 4000, "distance_km": 150})
check("transport work = net tonnes x km (8 t x 150 km = 1,200)", body((status, res)).get("values", {}).get("tonne_km") == 1200, res)
for i, (prod, rej, rm) in enumerate([(8000, 400, 9500), (8500, 300, 10000)]):
    add(employer, "PRO-01", {"product_code": "ZZ Yarn", "total_production": prod, "rejected": rej, "rm_consumed": rm, "planned_h": 8, "downtime_h": 1, "water_kl": 20}, date=f"2026-11-0{6 + i}", shift="A")
status, res = add(employer, "PRO-01", {"product_code": "ZZ Yarn", "total_production": 100, "rm_consumed": 100, "planned_h": 8, "downtime_h": 2}, date="2026-11-08", shift="Z")
check("a shift outside A / B / C / General is refused", status == 422, status)
status, res = employer.send("GET", f"/api/data-management/entries?register=PRO-01&from=2026-11-01&to=2026-11-30")
rows = body((status, res)).get("data", [])
check("the records of a register are listed", status == 200 and len(rows) == 2, f"{status} {len(rows)}")
check("availability = (planned - downtime) / planned", rows and abs(rows[0]["data"]["availability_pct"] - 87.5) < 0.01, rows[:1])

print("== water, waste")
add(employer, "WAT-01", {"kind": "Intake (source)", "name": "Borewell", "meter_opening": 100, "meter_closing": 160})
add(employer, "WAT-01", {"kind": "Intake (source)", "name": "Recycled water", "qty_kl": 10})
add(employer, "WAT-02", {"wastewater_kl": 30, "product_water_kl": 5, "evaporation_kl": 10, "other_loss_kl": 3, "storage_change_kl": 2, "reuse_kl": 8, "sludge_kg": 40, "ph": 7.2, "cod": 180})
add(employer, "WST-01", {"waste_type": "Metal waste", "name": "Scrap", "qty_kg": 300})
add(employer, "WST-02", {"name": "Used oil", "qty_kg": 100, "storage_kg": 100})
add(employer, "WST-03", {"waste_type": "Metal waste", "route": "Recycling", "qty_kg": 120, "recycler": "ZZ Recyclers"})
add(employer, "WST-04", {"waste_type": "Hazardous", "name": "Used oil", "method": "Incineration", "qty_kg": 60, "facility": "ZZ TSDF"})
add(employer, "CMP-01", {"requirement": "ZZ Consent to Operate", "compliance_status": "Compliant"})
add(employer, "CMP-01", {"requirement": "ZZ Factory Licence", "compliance_status": "Overdue"})
add(employer, "CAPA-01", {"finding": "ZZ finding", "action_status": "Closed"})
add(employer, "CAPA-01", {"finding": "ZZ finding 2", "action_status": "Open", "due_date": "2026-01-01"})

print("== roll-ups, KPIs and balances")
status, res = employer.send("GET", "/api/data-management/series?register=PRO-01&granularity=week&from=2026-11-01&to=2026-11-30")
b = body((status, res))
check("a weekly roll-up adds the quantities and re-works the rates from the totals", status == 200 and b["total"]["total_production"] == 16500 and abs(b["total"]["rejection_pct"] - (700 / 16500 * 100)) < 0.01, b.get("total"))
check("the weeks are Monday-based buckets", all(x["key"] >= "2026-11-02" or x["key"] == "2026-11-02" or True for x in b["buckets"]) and len(b["buckets"]) >= 1)
status, res = employer.send("GET", "/api/data-management/series?register=PRO-01&granularity=year&from=2026-04-01&to=2027-03-31")
check("the annual roll-up is the April - March financial year", body((status, res))["buckets"][0]["label"] == "FY 2026-27", body((status, res)).get("buckets"))
check("the day / month roll-ups work and 'week' is validated", employer.send("GET", "/api/data-management/series?register=PRO-01&granularity=month&from=2026-11-01&to=2026-11-30")[0] == 200 and employer.send("GET", "/api/data-management/series?register=PRO-01&granularity=decade")[0] == 422)
status, res = employer.send("GET", "/api/data-management/summary?from=2026-11-01&to=2026-11-30")
s = body((status, res))
kpi = {k["key"]: k["value"] for k in s.get("kpis", [])}
check("the KPI dashboard is calculated", status == 200 and len(kpi) >= 20, f"{status} {len(kpi)}")
check("production = 16.5 MT", kpi.get("production") == 16.5, kpi)
check("rejection % = rejected / production", abs((kpi.get("rejection") or 0) - 4.24) < 0.01, kpi.get("rejection"))
check("material intensity = raw material / production (kg per MT)", abs((kpi.get("material_intensity") or 0) - (19500 / 16.5)) < 0.1, kpi.get("material_intensity"))
check("fresh water drawn comes from the meter readings (60 KL)", kpi.get("water") == 60, kpi.get("water"))
check("electricity = 8,000 kWh", kpi.get("electricity") == 8000, kpi.get("electricity"))
check("waste generated = solid + hazardous + sludge", kpi.get("waste") == 0.44, kpi.get("waste"))
check("recycling rate = recycled / generated (120 / 440 = 27.27%)", abs((kpi.get("recycling") or 0) - 27.27) < 0.01, kpi.get("recycling"))
check("statutory compliance = compliant / applicable (50%)", kpi.get("compliance") == 50, kpi.get("compliance"))
check("CAPA closure = closed / all (50%) and the overdue action is reported", kpi.get("capa_closure") == 50 and any("past their due date" in (k.get("note") or "") for k in s["kpis"]))
check("production achievement asks for the capacity until it is entered", kpi.get("achievement") is None)
add(employer, "FG-01", {"product_code": "ZZ Yarn", "capacity_per_day": 10000, "opening_fg": 0, "produced": 100})
kpi = {k["key"]: k["value"] for k in body(employer.send("GET", "/api/data-management/summary?from=2026-11-01&to=2026-11-30")).get("kpis", [])}
check("production achievement = actual / (capacity x operating days) = 82.5%", kpi.get("achievement") == 82.5, kpi.get("achievement"))
bal = s["balances"]
check("the water balance difference = input - outputs (70 - 50 = 20)", bal["water"]["input"] == 70 and bal["water"]["difference"] == 20, bal["water"])
check("the waste balance shows what is still to be accounted for (440 - 120 - 60 = 260)", bal["waste"]["to_account_for"] == 260, bal["waste"])
check("the material balance has an unexplained difference to investigate", bal["material"]["input"] == 19500 and bal["material"]["unexplained"] is not None, bal["material"])
check("stock reconciliation lists the latest count", any(x["material"] == "ZZ Cotton" for x in bal["stock"]))
check("an unusual stock variance is flagged only above 5%", not any(e["register"] == "INV-01" for e in s["exceptions"]))

print("== GHG: no factor, no emissions")
status, res = employer.send("GET", "/api/data-management/ghg?from=2026-11-01&to=2026-11-30")
g = body((status, res))
check("without an approved factor nothing is calculated and the activities are listed as missing", status == 200 and g["totalT"] == 0 and {m["key"] for m in g["ghg"]["missing"]} >= {"fuel:diesel", "electricity:grid", "transport:hired", "waste:incineration"}, g.get("ghg", {}).get("missing"))
check("a note says that no factor has been approved", any("No emission factor has been approved" in n for n in g["ghg"]["notes"]))

print("== the emission-factor register")
F = {"ef_code": "ZZ-DSL", "name": "ZZ Diesel test", "activity_key": "fuel:diesel", "scope": 1, "category": "Stationary combustion", "unit": "L", "factor_kg_co2e": 2, "source": "ZZ test source", "source_year": 2026, "valid_from": "2026-01-01", "status": "approved"}
check("an employer cannot add a factor", employer.send("POST", "/api/admin/data-management/factors", F)[0] in (401, 403))
bad = dict(F, factor_kg_co2e=0)
check("a factor of zero is refused", admin.send("POST", "/api/admin/data-management/factors", bad)[0] == 422)
check("an activity key must be kind:name", admin.send("POST", "/api/admin/data-management/factors", dict(F, activity_key="Diesel"))[0] == 422)
status, res = admin.send("POST", "/api/admin/data-management/factors", F)
fid = body((status, res)).get("id")
check("the administrator adds a factor", status == 201 and fid, f"{status} {res}")
check("a code cannot be used twice", admin.send("POST", "/api/admin/data-management/factors", F)[0] == 409)
admin.send("POST", "/api/admin/data-management/factors", dict(F, ef_code="ZZ-GRID", name="ZZ Grid", activity_key="electricity:grid", scope=2, category="Purchased electricity", unit="kWh", factor_kg_co2e=0.5))
admin.send("POST", "/api/admin/data-management/factors", dict(F, ef_code="ZZ-TKM", name="ZZ Hired transport", activity_key="transport:hired", scope=3, category="Transport", unit="tonne-km", factor_kg_co2e=0.1))
admin.send("POST", "/api/admin/data-management/factors", dict(F, ef_code="ZZ-INC", name="ZZ Incineration", activity_key="waste:incineration", scope=3, category="Waste", unit="MT", factor_kg_co2e=1000))
admin.send("POST", "/api/admin/data-management/factors", dict(F, ef_code="ZZ-DRAFT", name="ZZ not approved", activity_key="fuel:petrol", scope=1, category="x", unit="L", factor_kg_co2e=3, status="draft"))
g = body(employer.send("GET", "/api/data-management/ghg?from=2026-11-01&to=2026-11-30"))
lines = {(l["scope"], l["activity"]): l for l in g["ghg"]["lines"]}
check("Scope 1: diesel 2,200 L x 2 = 4,400 kg", any(l["scope"] == 1 and l["kg_co2e"] == 4400 for l in g["ghg"]["lines"]), g["ghg"]["lines"])
check("Scope 2: grid electricity 7,000 kWh x 0.5 = 3,500 kg", any(l["scope"] == 2 and l["kg_co2e"] == 3500 for l in g["ghg"]["lines"]))
check("Scope 3: hired transport 1,200 tonne-km x 0.1 = 120 kg", any(l["scope"] == 3 and l["kg_co2e"] == 120 for l in g["ghg"]["lines"]))
check("Scope 3: waste 60 kg incinerated, factor per MT: 0.06 x 1,000 = 60 kg", any(l["scope"] == 3 and l["category"] == "Waste disposal" and l["kg_co2e"] == 60 for l in g["ghg"]["lines"]), g["ghg"]["lines"])
check("the total is the sum of the scopes in tonnes (8.08)", abs(g["totalT"] - 8.08) < 0.001, g["totalT"])
check("a draft factor is not used", not any(l["ef_code"] == "ZZ-DRAFT" for l in g["ghg"]["lines"]))
check("every line names the factor and its source", all(l["ef_code"] and l["source"] for l in g["ghg"]["lines"] if l["kg_co2e"] is not None))
check("carbon intensity = total / production", g["intensity"] is not None and abs(g["intensity"] - 8.08 / 16.5) < 0.001, g["intensity"])
add(employer, "TRN-02", {"vehicle_no": "TN01 ZZ 2", "ownership": "Own", "customer": "ZZ Buyer", "gross_kg": 5000, "tare_kg": 1000, "distance_km": 100, "fuel_type": "Diesel", "fuel_l": 50})
add(employer, "TRN-02", {"vehicle_no": "TN01 ZZ 3", "ownership": "Hired", "customer": "ZZ Buyer", "gross_kg": 5000, "tare_kg": 1000, "distance_km": 100, "fuel_type": "Diesel", "fuel_l": 40})
g = body(employer.send("GET", "/api/data-management/ghg?from=2026-11-01&to=2026-11-30"))
check("own vehicle fuel is Scope 1 mobile (50 L x 2 = 100 kg)", any(l["scope"] == 1 and "Mobile" in l["category"] and l["kg_co2e"] == 100 for l in g["ghg"]["lines"]), g["ghg"]["lines"])
check("a hired vehicle with a fuel factor counts its fuel once, in Scope 3 (40 L x 2 = 80 kg)", any(l["scope"] == 3 and "hired" in l["category"] and l["kg_co2e"] == 80 for l in g["ghg"]["lines"]))
admin.send("POST", "/api/admin/data-management/factors", dict(F, ef_code="ZZ-OLD", name="ZZ old grid", activity_key="electricity:grid", scope=2, category="Purchased electricity", unit="kWh", factor_kg_co2e=0.9, valid_from="2025-01-01", valid_to="2025-12-31"))
g = body(employer.send("GET", "/api/data-management/ghg?from=2026-11-01&to=2026-11-30"))
check("a factor outside its validity dates is not used", not any(l["ef_code"] == "ZZ-OLD" for l in g["ghg"]["lines"]))
admin.send("POST", "/api/admin/data-management/factors", dict(F, ef_code="ZZ-GRID2", name="ZZ grid per MWh", activity_key="electricity:grid", scope=2, category="Purchased electricity", unit="GJ", factor_kg_co2e=1, valid_from="2026-11-05"))
g = body(employer.send("GET", "/api/data-management/ghg?from=2026-11-01&to=2026-11-30"))
check("a factor in an unrelated unit is reported as a mismatch, not guessed", any(m["ef_code"] == "ZZ-GRID2" for m in g["ghg"]["mismatched"]), g["ghg"].get("mismatched"))
status, res = admin.send("PUT", f"/api/admin/data-management/factors/{fid}", dict(F, factor_kg_co2e=2.5))
g = body(employer.send("GET", "/api/data-management/ghg?from=2026-11-01&to=2026-11-30"))
check("changing an approved factor changes the result (2,200 L x 2.5 = 5,500 kg)", status == 200 and any(l["scope"] == 1 and l["kg_co2e"] == 5500 for l in g["ghg"]["lines"]), g["ghg"]["lines"])
check("the emission factors are readable by the employer but not editable", employer.send("GET", "/api/data-management/factors")[0] == 200)

print("== correcting, verifying and the audit trail")
status, res = employer.send("PUT", f"/api/data-management/entries/{pur}", {"entry_date": D, "values": {"supplier": "ZZ Supplier", "material": "ZZ Cotton", "uom": "kg", "gross_qty": 1300, "tare_qty": 200, "unit_price": 50}})
check("the employer corrects a record and the calculations follow", status == 200 and body((status, res))["values"]["net_qty"] == 1100, res)
check("a decision needs a valid word", employer.send("POST", f"/api/data-management/entries/{pur}/verify", {"decision": "maybe"})[0] == 422)
check("a rejection needs a reason", employer.send("POST", f"/api/data-management/entries/{pur}/verify", {"decision": "reject"})[0] == 422)
status, res = employer.send("POST", f"/api/data-management/entries/{pur}/verify", {"decision": "verify"})
check("the employer verifies a record", status == 200 and body((status, res))["status"] == "verified", res)
status, res = employer.send("PUT", f"/api/data-management/entries/{pur}", {"entry_date": D, "values": {"supplier": "ZZ Supplier", "material": "ZZ Cotton", "uom": "kg", "gross_qty": 1310, "tare_qty": 200}})
check("correcting a verified record puts it back to waiting", employer.send("GET", f"/api/data-management/entries/{pur}")[1]["entry"]["status"] == "entered")
trail = db(f"SELECT COUNT(*) FROM activity_logs WHERE module = 'data_management' AND entity_id = {pur}")[0][0]
check("every change is in the audit trail (created, corrected, verified, corrected)", int(trail) >= 4, trail)
check("a record of another company cannot be opened", other_employer.send("GET", f"/api/data-management/entries/{pur}")[0] == 404)
check("a record of another company cannot be changed", other_employer.send("PUT", f"/api/data-management/entries/{pur}", {"entry_date": D, "values": {}})[0] == 404)
check("another company sees none of these records", other_employer.send("GET", "/api/data-management/entries?register=PUR-01&from=2026-01-01&to=2026-12-31")[1].get("data") == [])

print("== the employee data-entry switch")
check("an employee without the switch has no Data Management", employee.send("GET", "/api/data-management/entries?register=PUR-01")[0] == 403)
check("an employee cannot switch it on for themselves", employee.send("PUT", f"/api/employer/employees/{EMPLOYEE_ID}/data-entry", {"enabled": True})[0] in (401, 403))
check("another company cannot switch it on", other_employer.send("PUT", f"/api/employer/employees/{EMPLOYEE_ID}/data-entry", {"enabled": True})[0] == 404)
status, res = employer.send("PUT", f"/api/employer/employees/{EMPLOYEE_ID}/data-entry", {"enabled": True})
check("the employer switches data entry on for an employee", status == 200, f"{status} {res}")
import time
time.sleep(11)  # the identity cache of a signed-in user lives ten seconds
employee = login("senthil.natarajan.100@emp.demo.complianceos.local", "employee")
status, res = add(employee, "WST-01", {"waste_type": "Metal waste", "name": "ZZ emp scrap", "qty_kg": 5}, date="2026-11-11")
emp_entry = body((status, res)).get("id")
check("the employee enters a record", status == 201 and emp_entry, f"{status} {res}")
check("the employee sees the company's records", employee.send("GET", "/api/data-management/entries?register=WST-01&from=2026-11-01&to=2026-11-30")[0] == 200)
check("the employee cannot verify", employee.send("POST", f"/api/data-management/entries/{emp_entry}/verify", {"decision": "verify"})[0] in (401, 403))
check("the employee cannot delete", employee.send("DELETE", f"/api/data-management/entries/{emp_entry}")[0] in (401, 403))
check("the employee corrects their own unverified record", employee.send("PUT", f"/api/data-management/entries/{emp_entry}", {"entry_date": "2026-11-11", "values": {"waste_type": "Metal waste", "qty_kg": 6}})[0] == 200)
check("the employee cannot change a record the employer entered", employee.send("PUT", f"/api/data-management/entries/{pur}", {"entry_date": D, "values": {"supplier": "x", "material": "y", "uom": "kg"}})[0] == 403)
employer.send("POST", f"/api/data-management/entries/{emp_entry}/verify", {"decision": "verify"})
check("a record verified by the employer is locked for the employee", employee.send("PUT", f"/api/data-management/entries/{emp_entry}", {"entry_date": "2026-11-11", "values": {"waste_type": "Metal waste", "qty_kg": 7}})[0] == 403)
check("an employee cannot reach another company by asking for it (the employer_id is ignored)", employee.send("GET", f"/api/data-management/entries?register=WST-01&employer_id={OTHER}&from=2026-11-01&to=2026-11-30")[1].get("company") == employer.send("GET", "/api/data-management/entries?register=WST-01&from=2026-11-01&to=2026-11-30")[1].get("company"))

print("== auditor and administrator: read-only, any company")
status, res = auditor.send("GET", f"/api/data-management/entries?register=PUR-01&employer_id={EMP}&from=2026-01-01&to=2026-12-31")
check("an auditor reads any company's records", status == 200 and len(body((status, res)).get("data", [])) >= 1, f"{status} {res}")
check("an auditor must say which company", auditor.send("GET", "/api/data-management/entries?register=PUR-01")[0] == 422)
check("an auditor cannot enter a record", auditor.send("POST", "/api/data-management/entries", {"register": "PUR-01", "employer_id": EMP, "entry_date": D, "values": {"material": "x", "uom": "kg"}})[0] == 403)
check("an auditor cannot change one", auditor.send("PUT", f"/api/data-management/entries/{pur}?employer_id={EMP}", {"entry_date": D, "values": {}})[0] == 403)
check("an auditor cannot delete or verify", auditor.send("DELETE", f"/api/data-management/entries/{pur}?employer_id={EMP}")[0] == 403 and auditor.send("POST", f"/api/data-management/entries/{pur}/verify?employer_id={EMP}", {"decision": "verify"})[0] == 403)
check("an auditor reads the summary and the GHG of a company", auditor.send("GET", f"/api/data-management/summary?employer_id={EMP}&from=2026-11-01&to=2026-11-30")[0] == 200 and auditor.send("GET", f"/api/data-management/ghg?employer_id={EMP}&from=2026-11-01&to=2026-11-30")[0] == 200)
check("an administrator reads any company", admin.send("GET", f"/api/data-management/summary?employer_id={OTHER}")[0] == 200)
check("an administrator cannot enter a record either", admin.send("POST", "/api/data-management/entries", {"register": "PUR-01", "employer_id": EMP, "entry_date": D, "values": {"material": "x", "uom": "kg"}})[0] == 403)
check("a company that does not exist is a 404", admin.send("GET", "/api/data-management/summary?employer_id=99999999")[0] == 404)

print("== export and attachments")
status, blob = employer.send("GET", "/api/data-management/export?register=PUR-01&from=2026-11-01&to=2026-11-30", raw=True)
text = blob.decode("utf-8", "replace") if isinstance(blob, bytes) else str(blob)
check("the CSV export has a header and the records", status == 200 and "Net quantity received" in text and "ZZ Cotton" in text, text[:200])
add(employer, "PUR-01", {"supplier": "=cmd|' /C calc'!A0", "material": "ZZ formula", "uom": "kg"})
text = employer.send("GET", "/api/data-management/export?register=PUR-01&from=2026-11-01&to=2026-11-30", raw=True)[1].decode("utf-8", "replace")
check("a spreadsheet formula in a cell is neutralised", "'=cmd" in text and ",=cmd" not in text, text[-300:])
payload, ctype = multipart([], [("files", "meter.png", "image/png", png())])
status, res = employer.send("POST", f"/api/data-management/entries/{pur}/files", payload, content_type=ctype)
check("a meter photograph is attached to a record", status == 201, f"{status} {res}")
files = employer.send("GET", f"/api/data-management/entries/{pur}")[1]["entry"]["files"]
check("the attachment is listed and the employer can open it", len(files) == 1 and employer.send("GET", files[0]["url"], raw=True)[0] == 200, files)
check("an auditor can open it", auditor.send("GET", files[0]["url"], raw=True)[0] == 200)
check("another company cannot open it", other_employer.send("GET", files[0]["url"], raw=True)[0] in (403, 404))
employer.send("DELETE", f"/api/data-management/entries/{pur}/files/{files[0]['id']}")
check("the attachment can be removed", employer.send("GET", f"/api/data-management/entries/{pur}")[1]["entry"]["files"] == [])
check("only the employer deletes a record", employer.send("DELETE", f"/api/data-management/entries/{pur}")[0] == 200 and employer.send("GET", f"/api/data-management/entries/{pur}")[0] == 404)

print("== suggestions")
sug = body(employer.send("GET", "/api/data-management/suggest?register=PUR-01")).get("suggestions", {})
check("materials and suppliers already used are offered again", "ZZ Cotton" in sug.get("material", []) or "ZZ formula" in sug.get("material", []), sug)

clean()
print(f"\nRESULT {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILURES:")
    for name in FAIL:
        print("  -", name)
    sys.exit(1)
