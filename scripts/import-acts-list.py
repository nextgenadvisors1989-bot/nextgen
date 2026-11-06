"""Adds the statutes of the client's "Act and Rules list out" sheet (13 x 19 brochure, 2026-11-05) to the Acts register (Admin > Compliance > Acts).

    python scripts/import-acts-list.py            # local demo admin
    LIVE_ADMIN_EMAIL=... LIVE_ADMIN_PASSWORD=... python scripts/import-acts-list.py

Safe to run again: an act that is already in the register (same name, ignoring case, spaces and punctuation) is left alone. Names and numbers are copied from the
sheet; where a number on the sheet is not the statute's own number it is left blank (see BLANK_NUMBER) and the admin can fill it in the Acts screen.
Rules, codes and regulations of the sheet are entered as register entries too, with the group they sit under on the sheet in "Department".
"""
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seed_lib import Session  # noqa: E402

EMAIL = os.environ.get("LIVE_ADMIN_EMAIL", "demo.admin@complianceos.local")
PASSWORD = os.environ.get("LIVE_ADMIN_PASSWORD", "Admin@2026")
SOURCE = "Listed on the client's Acts and Rules list (13 x 19 sheet). Check the text and the latest amendments before relying on it."

SOCIAL = "Social Security Code, 2020 (No 36 of 2020)"
WAGES = "Code on Wages, 2019"
IR = "Industrial Relations Code, 2020 (No 35 of 2020)"
OSH = "Occupational Safety, Health and Working Conditions Code, 2020 (No 37 of 2020)"
ENV = "Environmental laws enforced by CPCB / SPCB"
CHEM = "Chemical safety"
PETROL = "Petroleum and explosives"
OTHER = "Other laws on the sheet"

# name, short name, number as written on the sheet, year, group on the sheet, jurisdiction
ACTS = [
    # the four codes
    ("Code on Wages, 2019", "Code on Wages", None, 2019, WAGES, "Central"),
    ("Social Security Code, 2020", "Social Security Code", "No 36 of 2020", 2020, SOCIAL, "Central"),
    ("Industrial Relations Code, 2020", "Industrial Relations Code", "No 35 of 2020", 2020, IR, "Central"),
    ("Occupational Safety, Health and Working Conditions Code, 2020", "OSH Code", "No 37 of 2020", 2020, OSH, "Central"),
    # social security
    ("Employees' Provident Funds and Miscellaneous Provisions Act, 1952", "EPF Act", "No 19 of 1952", 1952, SOCIAL, "Central"),
    ("Employees' State Insurance Act, 1948", "ESI Act", "No 34 of 1948", 1948, SOCIAL, "Central"),
    ("Employees' Compensation Act, 1923", "EC Act", "No 8 of 1923", 1923, SOCIAL, "Central"),
    ("Employment Exchanges (Compulsory Notification of Vacancies) Act, 1959", "Employment Exchanges Act", "No 31 of 1959", 1959, SOCIAL, "Central"),
    ("Maternity Benefit Act, 1961", "Maternity Benefit Act", "No 53 of 1961", 1961, SOCIAL, "Central"),
    ("Cine-Workers Welfare Fund Act, 1981", "Cine-Workers Welfare Fund Act", "No 33 of 1981", 1981, SOCIAL, "Central"),
    ("Building and Other Construction Workers Welfare Cess Act, 1996", "BOCW Cess Act", "No 28 of 1996", 1996, SOCIAL, "Central"),
    ("Unorganised Workers Social Security Act, 2008", "Unorganised Workers Act", "No 33 of 2008", 2008, SOCIAL, "Central"),
    ("Labour Welfare Fund Act, 1987", "Labour Welfare Fund Act", "No 4 of 1987", 1987, SOCIAL, "Central"),
    # wages
    ("Payment of Wages Act, 1936", "Payment of Wages Act", "No 4 of 1936", 1936, WAGES, "Central"),
    ("Minimum Wages Act, 1948", "Minimum Wages Act", "No 11 of 1948", 1948, WAGES, "Central"),
    ("Payment of Bonus Act, 1965", "Payment of Bonus Act", "No 21 of 1965", 1965, WAGES, "Central"),
    ("Equal Remuneration Act, 1976", "Equal Remuneration Act", "No 25 of 1976", 1976, WAGES, "Central"),
    ("Equal Remuneration (Amendment) Act, 1987", None, "No 49 of 1987", 1987, WAGES, "Central"),
    ("Payment of Gratuity Act, 1972", "Payment of Gratuity Act", "No 39 of 1972", 1972, WAGES, "Central"),
    # industrial relations
    ("Trade Unions Act, 1926", "Trade Unions Act", "No 16 of 1926", 1926, IR, "Central"),
    ("Industrial Employment (Standing Orders) Act, 1946", "Standing Orders Act", "No 20 of 1946", 1946, IR, "Central"),
    ("Industrial Disputes Act, 1947", "Industrial Disputes Act", "No 14 of 1947", 1947, IR, "Central"),
    ("Shops and Establishment Act, 1942", "Shops and Establishment Act", "No 18 of 1942", 1942, IR, "Central"),
    ("Tamil Nadu Shops and Establishments Act, 1947", "TN Shops Act", "No 36 of 1947", 1947, IR, "State"),
    # OSH and working conditions
    ("Labour Law Ease of Compliance Rules (Maintenance of Registers under Various Labour Laws), 2017", "Ease of Compliance Rules", None, 2017, OSH, "Central"),
    ("Factories Act, 1948", "Factories Act", "No 63 of 1948", 1948, OSH, "Central"),
    ("Mines and Minerals (Development and Regulation) Amendment Act, 2023 and Rules, 1955", "Mines and Minerals Act", None, 2023, OSH, "Central"),
    ("Dock Workers (Safety, Health and Welfare) Act, 1986", "Dock Workers Act", "No 54 of 1986", 1986, OSH, "Central"),
    ("Inter-State Migrant Workmen (Regulation of Employment and Conditions of Service) Act, 1979", "ISMW Act", "No 30 of 1979", 1979, OSH, "Central"),
    ("Contract Labour (Regulation and Abolition) Act, 1970", "Contract Labour Act", "No 37 of 1970", 1970, OSH, "Central"),
    ("Plantations Labour Act, 1951", "Plantations Labour Act", "No 69 of 1951", 1951, OSH, "Central"),
    ("Building and Other Construction Workers (Regulation of Employment and Conditions of Service) Act, 1996", "BOCW Act", "No 27 of 1996", 1996, OSH, "Central"),
    # environment
    ("Environment (Protection) Act, 1986", "EP Act", "No 29 of 1986", 1986, ENV, "Central"),
    ("Water (Prevention and Control of Pollution) Act, 1974", "Water Act", "No 6 of 1974", 1974, ENV, "Central"),
    ("Air (Prevention and Control of Pollution) Act, 1981", "Air Act", "No 14 of 1981", 1981, ENV, "Central"),
    ("Solid Waste Management Rules, 2016", "SWM Rules", None, 2016, ENV, "Central"),
    ("Hazardous Waste Management Rules, 2016", "HW Rules", None, 2016, ENV, "Central"),
    ("Construction and Demolition Waste Management Rules, 2016", "C&D Waste Rules", None, 2016, ENV, "Central"),
    ("Bio-Medical Waste Management Rules, 2016", "BMW Rules", None, 2016, ENV, "Central"),
    ("E-Waste Management Rules, 2016", "E-Waste Rules", None, 2016, ENV, "Central"),
    ("Plastic Waste Management Rules, 2016", "Plastic Waste Rules", None, 2016, ENV, "Central"),
    # chemical safety
    ("Chemical Accidents (Emergency Planning, Preparedness and Response) Rules, 1996", "CAEPPR Rules", None, 1996, CHEM, "Central"),
    ("Manufacture, Storage and Import of Hazardous Chemicals Act / Rules, 2000", "MSIHC", "No 29 of 1989", 2000, CHEM, "Central"),
    ("Hazardous Chemicals (Amendment) Rules, 1994", None, None, 1994, CHEM, "Central"),
    ("Indian Chemical (Management and Safety) Rules, 2020", "CMSR", None, 2020, CHEM, "Central"),
    # petroleum and explosives
    ("Petroleum Act, 1934 with Petroleum Rules, 2012 and Amendment Rules, 2019", "Petroleum Act", "No 30 of 1934", 1934, PETROL, "Central"),
    ("Gas Cylinder Rules, 2016", None, None, 2016, PETROL, "Central"),
    ("Static and Mobile Pressure Vessels (Unfired) Rules, 2016", "SMPV(U) Rules", None, 2016, PETROL, "Central"),
    ("Explosives Act, 1884 with Explosives Rules, 2008", "Explosives Act", "No 4 of 1884", 1884, PETROL, "Central"),
    ("Explosive Substances Act, 1908 (Amendment Act, 2001)", "Explosive Substances Act", "No 6 of 1908", 1908, PETROL, "Central"),
    ("Ammonium Nitrate Rules, 2012", None, None, 2012, PETROL, "Central"),
    ("Calcium Carbide Rules, 1987", None, None, 1987, PETROL, "Central"),
    ("Cinematography Film Rules, 1948", None, None, 1948, PETROL, "Central"),
    # other laws on the sheet
    ("Boilers Act, 1923 (Amendment Act, 2007) with Boiler Rules, 1927 and Regulations, 1950", "Boilers Act", "No 5 of 1923", 1923, OTHER, "Central"),
    ("Legal Metrology Act, 2009", "Legal Metrology Act", "No 1 of 2009", 2009, OTHER, "Central"),
    ("Legal Metrology (Packaged Commodities) Amendment Rules, 2023", None, None, 2023, OTHER, "Central"),
    ("Income Tax Act, 1961", "Income Tax Act", None, 1961, OTHER, "Central"),
    ("Tamil Nadu Tax on Professions, Trades, Callings and Employments Act, 1992 (Profession Tax)", "TN Profession Tax Act", "No 24 of 1992", 1992, OTHER, "State"),
    ("Bureau of Indian Standards Act, 1986 with Rules, 1987", "BIS Act", "No 63 of 1986", 1986, OTHER, "Central"),
    ("Tamil Nadu Fire Service Act, 1985 with Fire Service Rules, 1990", "TN Fire Service Act", "No 40 of 1985", 1985, OTHER, "State"),
    ("Tamil Nadu Public Health Act, 1939", "TN Public Health Act", "No 3 of 1939", 1939, OTHER, "State"),
    ("Electricity Act, 2003 with Regulations, 2010", "Electricity Act", "No 36 of 2003", 2003, OTHER, "Central"),
    ("Textile Committee Act, 1963", None, None, 1963, OTHER, "Central"),
    ("Export (Quality Control and Inspection) Act - Export Promotion and Quality Assurance", None, None, None, OTHER, "Central"),
    ("Motor Vehicles Act, 1988 (Amendment Act, 2019)", "Motor Vehicles Act", "No 59 of 1988", 1988, OTHER, "Central"),
    ("Motor Transport Workers Act, 1961", "Motor Transport Workers Act", None, 1961, OTHER, "Central"),
    ("Collection of Statistics Act, 2008 (Amendment 2017) and Rules, 2011", None, None, 2008, OTHER, "Central"),
    ("Indian Telegraph Act, 1885 (TEC certification) - Ministry of Communication", "Telegraph Act", "No 13 of 1885", 1885, OTHER, "Central"),
    ("Information Technology Act, 2000", "IT Act", "No 21 of 2000", 2000, OTHER, "Central"),
    ("Tamil Nadu Lifts and Escalators Act, 1997", "TN Lifts Act", None, 1997, OTHER, "State"),
    ("Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013", "POSH Act", "No 14 of 2013", 2013, OTHER, "Central"),
    ("Child Labour (Prohibition and Regulation) Act, 1986", "Child Labour Act", None, 1986, OTHER, "Central"),
    ("Sales Promotion Employees (Conditions of Service) Act, 1976", "Sales Promotion Employees Act", None, 1976, OTHER, "Central"),
    ("ILO Conventions and Recommendations", "ILO", None, None, OTHER, "International"),
]
# the sheet gives "No 40 of 1961" for the Income Tax Act and "No 35 of 1952" for the Mines and Minerals Act; those are not the statutes' own numbers, so they are not copied
BLANK_NUMBER = {"Income Tax Act, 1961", "Mines and Minerals (Development and Regulation) Amendment Act, 2023 and Rules, 1955"}


def squash(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


admin = Session()
ok, message = admin.login((EMAIL, PASSWORD))
if not ok:
    sys.exit(f"Could not sign in as {EMAIL}: {message}")

existing = set()
page = 1
while True:
    status, payload = admin.send("GET", f"/api/admin/compliance/acts?limit=100&page={page}")
    rows = payload.get("data") if isinstance(payload, dict) else None
    if status != 200 or not isinstance(rows, list):
        sys.exit(f"Could not read the Acts register: HTTP {status}")
    for row in rows:
        existing.add(squash(str(row.get("actName") or row.get("act_name") or "")))
    pages = ((payload.get("meta") or {}).get("pagination") or payload.get("pagination") or {}).get("totalPages", 1)
    if page >= int(pages or 1):
        break
    page += 1

added = skipped = failed = 0
for name, short, number, year, group, jurisdiction in ACTS:
    if squash(name) in existing:
        skipped += 1
        continue
    body = {
        "act_name": name, "short_name": short, "act_number": None if name in BLANK_NUMBER else number, "act_year": year,
        "jurisdiction": jurisdiction, "state_name": "Tamil Nadu" if jurisdiction == "State" else None,
        "department": group, "summary": SOURCE, "status": "active",
    }
    result = admin.call("POST", "/api/admin/compliance/acts", body, what=name[:60])
    if result is None:
        failed += 1
    else:
        added += 1
print(f"Acts register: {added} added, {skipped} already there, {failed} refused (of {len(ACTS)} on the list)")
sys.exit(1 if failed else 0)
