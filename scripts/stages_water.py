"""Seed stage: groundwater NOCs with their conditions, meters and about 20 weeks of readings.

Written through the real API as the Water auditor (Karthik Rajan), the way a field visit would:
  Sri Balaji Textiles, Weaving Unit   100 KLD NOC, valid; borewell drawing 80 to 95 KLD with a three-week spell above the limit
  Kaveri Engineering Works            50 KLD NOC expiring soon; the borewell is running over the limit right now

Readings are dated back from today (the 30-day usage figure is relative to the real date). Safe to re-run: a NOC is skipped
if its number already exists.
"""
import random
from datetime import date, timedelta

from seed_common import employers_map, login_as
from seed_lib import q1, section, sql_text

rng = random.Random(2026)


def iso(days_from_today):
    return (date.today() + timedelta(days=days_from_today)).isoformat()


# kilolitres a day, one figure per weekly interval, oldest first
BALAJI_BOREWELL = [84, 88, 91, 86, 83, 89, 92, 87, 85, 90, 93, 88, 84, 86, 103, 106, 104, 98, 90, 88]
KAVERI_BOREWELL = [44, 46, 48, 47, 49, 51, 53, 52, 54, 55, 56, 58, 57, 55, 54, 56, 57, 55, 56, 58]


def weekly_readings(daily_kl, start_value, weeks):
    """(date offset, cumulative KL) pairs, one a week, the last one today."""
    value = start_value
    points = [(-7 * weeks, round(value, 1))]
    for index, kld in enumerate(daily_kl[-weeks:]):
        value += kld * 7 * (1 + rng.uniform(-0.01, 0.01))
        points.append((-7 * (weeks - 1 - index), round(value, 1)))
    return points


NOCS = [
    dict(
        code="SBT", unit="Weaving Unit", number="WRD/GW/TPR/2025/0187", authority="Water Resources Department, SG & SWRDC, Chennai",
        issue=iso(-130), expiry=iso(965), qty=100000, split=(36000, 20000, 44000), well=("Bore well", 198, 6.5, 5, 6, 1),
        states={0: "Compliant", 1: "Compliant", 2: "Compliant", 3: "Compliant", 4: "Compliant", 5: "Compliant", 6: "Compliant", 7: "Compliant",
                8: "Compliant", 9: "Not Applicable", 10: "Non-Compliant", 11: "Compliant", 12: "Compliant", 13: "Compliant", 14: "Compliant",
                15: "Not Applicable", 16: "Not Applicable", 17: "Non-Compliant"},
        remarks={2: "Flow meter fitted on the suction line and sealed by the Executive Engineer on 12 June.",
                 4: "Monthly drawal statements filed up to the last quarter.",
                 10: "No dedicated monitoring bore well yet. Quote obtained, work to be completed within 30 days.",
                 17: "Treated water is reused in the garden; the ZLD plant is still at the design stage."},
        meters=[("Borewell O/P (M1)", "Borewell", True, BALAJI_BOREWELL, 41250.0), ("RO feed water", "RO Feed", False, [45] * 20, 12800.0),
                ("Canteen washing", "Canteen", False, [5] * 20, 1800.0), ("Toilet hand wash", "Toilet", False, [19] * 20, 6400.0),
                ("Guest house flush water", "Guest House", False, [3.5] * 20, 950.0), ("Gardening", "Gardening", False, [2] * 20, 410.0)],
    ),
    dict(
        code="KEW", unit="Ambattur Plant", number="WRD/GW/CHN/2023/0442", authority="Water Resources Department, Chennai Region",
        issue=iso(-1035), expiry=iso(62), qty=50000, split=(30000, 5000, 15000), well=("Bore well", 150, 8, 7.5, 8, 2),
        states={0: "Compliant", 2: "Compliant", 4: "Non-Compliant", 6: "Compliant", 12: "Non-Compliant"},
        remarks={4: "Daily drawal statements were not sent for the last two months.", 12: "Renewal application not yet filed although the NOC ends soon."},
        meters=[("Borewell 1 (main)", "Borewell", True, KAVERI_BOREWELL, 9800.0), ("Process water", "Other", False, [18] * 20, 2300.0)],
    ),
]


def stage_water():
    section("Groundwater NOCs")
    water = login_as("karthik.auditor@demo.complianceos.local", "auditor")
    if not water:
        return
    employers = employers_map()
    for spec in NOCS:
        if q1(f"SELECT id FROM water_nocs WHERE noc_number = {sql_text(spec['number'])} AND deleted_at IS NULL"):
            print(f"  = {spec['number']} (already there)")
            continue
        employer_id = employers.get(spec["code"])
        unit_id = q1(f"SELECT id FROM company_units WHERE employer_id = {employer_id} AND unit_name = {sql_text(spec['unit'])} AND deleted_at IS NULL")
        if not employer_id:
            print(f"  ! skipped {spec['number']}: employer {spec['code']} not found")
            continue
        well = spec["well"]
        created = water.call("POST", "/api/water-noc", {
            "employer_id": employer_id, "unit_id": int(unit_id) if unit_id else None, "noc_number": spec["number"],
            "issuing_authority": spec["authority"], "issue_date": spec["issue"], "expiry_date": spec["expiry"], "approved_quantity_lpd": spec["qty"],
            "purpose": "Domestic", "purpose_domestic_lpd": spec["split"][0], "purpose_gardening_lpd": spec["split"][1], "purpose_other_lpd": spec["split"][2],
            "well_type": well[0], "well_depth_m": well[1], "well_diameter_in": well[2], "pump_hp": well[3], "pumping_hours_per_day": well[4], "abstraction_structures": well[5],
            "standard_conditions": True,
        }, what=f"create {spec['number']}")
        if not created:
            continue
        nid = created["data"]["id"]

        detail = water.call("GET", f"/api/water-noc/{nid}", what="open NOC")
        conditions = detail["data"]["conditions"] if detail else []
        for index, state in spec["states"].items():
            if index < len(conditions):
                water.call("PATCH", f"/api/water-noc/{nid}/conditions/{conditions[index]['id']}",
                           {"compliance": state, "remarks": spec["remarks"].get(index)}, what="tick condition")

        total_readings = 0
        for name, source, counts, daily, start in spec["meters"]:
            meter = water.call("POST", f"/api/water-noc/{nid}/meters", {"name": name, "source": source, "reading_unit": "KL", "counts_toward_noc": counts}, what=f"meter {name}")
            if not meter:
                continue
            for offset, value in weekly_readings(daily, start, len(daily)):
                if water.call("POST", f"/api/water-noc/{nid}/meters/{meter['data']['id']}/readings", {"reading_date": iso(offset), "reading_value": value}, what="reading"):
                    total_readings += 1
        print(f"  + {spec['number']}: {len(conditions)} conditions, {len(spec['meters'])} meters, {total_readings} readings")
